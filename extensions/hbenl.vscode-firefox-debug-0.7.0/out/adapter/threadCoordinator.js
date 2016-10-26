"use strict";
var log_1 = require('../util/log');
var log = log_1.Log.create('ThreadCoordinator');
var ThreadState;
(function (ThreadState) {
    ThreadState[ThreadState["Paused"] = 0] = "Paused";
    ThreadState[ThreadState["Running"] = 1] = "Running";
    ThreadState[ThreadState["StepOver"] = 2] = "StepOver";
    ThreadState[ThreadState["StepIn"] = 3] = "StepIn";
    ThreadState[ThreadState["StepOut"] = 4] = "StepOut";
})(ThreadState || (ThreadState = {}));
var QueuedRequest = (function () {
    function QueuedRequest() {
    }
    return QueuedRequest;
}());
/**
 * Requests that are sent to Firefox should be coordinated through this class:
 * - setting breakpoints and fetching stackframes and object properties must be run on a paused thread
 * - before the thread is resumed, the object grips that were fetched during the pause are released;
 *   no other requests should be sent to that thread between releasing and resuming, so they are
 *   queued to be sent later or rejected
 * - evaluate requests can only be sent when the thread is paused and resume the thread temporarily,
 *   so they must be sent sequentially
 */
var ThreadCoordinator = (function () {
    function ThreadCoordinator(actor, consoleActor) {
        var _this = this;
        this.actor = actor;
        this.consoleActor = consoleActor;
        /**
         * The user-visible state of the thread. It may be put in a different state temporarily
         * in order to set breakpoints but will be put in the desired state when these requests
         * are finished.
         */
        this.desiredThreadState = ThreadState.Paused;
        /**
         * Queued tasks requiring the thread to be paused. These tasks are started using
         * runOnPausedThread() and if the thread is currently resuming, they are put in this queue.
         */
        this.queuedtasksRunningOnPausedThread = [];
        /**
         * The number of tasks that are currently running requiring the thread to be paused.
         * These tasks are started using runOnPausedThread() and if the thread is running it will
         * automatically be paused temporarily.
         */
        this.tasksRunningOnPausedThread = 0;
        /**
         * This flag specifies if the thread is currently being resumed
         */
        this.resumeRequestIsRunning = false;
        /**
         * Evaluate requests queued to be run later
         */
        this.queuedEvaluateRequests = [];
        /**
         * This flag specifies if an evaluate request is currently running
         */
        this.evaluateRequestIsRunning = false;
        actor.onPaused(function (reason) {
            _this.desiredThreadState = ThreadState.Paused;
        });
        actor.onResumed(function () {
            _this.desiredThreadState = ThreadState.Running;
            if (_this.tasksRunningOnPausedThread > 0) {
                log.warn('Thread resumed unexpectedly while tasks that need the thread to be paused were running - interrupting again');
                actor.interrupt();
            }
        });
    }
    /**
     * Run a (possibly asynchronous) task on the paused thread.
     * If the thread is not already paused, it will be paused temporarily and automatically
     * resumed when the task is finished (if there are no other reasons to pause the
     * thread). The task is passed a callback that must be invoked when the task is finished.
     * If the thread is currently being resumed the task is either queued to be executed
     * later or rejected, depending on the rejectOnResume flag.
     */
    ThreadCoordinator.prototype.runOnPausedThread = function (task, rejectOnResume) {
        var _this = this;
        if (rejectOnResume === void 0) { rejectOnResume = true; }
        if (!this.resumeRequestIsRunning) {
            this.tasksRunningOnPausedThread++;
            log.debug("Starting task on paused thread (now running: " + this.tasksRunningOnPausedThread + ")");
            return new Promise(function (resolve, reject) {
                var result = _this.actor.interrupt().then(function () { return task(function () { return _this.taskFinished(); }); });
                resolve(result);
            });
        }
        else if (!rejectOnResume) {
            log.debug('Queueing task to be run on paused thread');
            var resultPromise = new Promise(function (resolve, reject) {
                var send = function () {
                    _this.tasksRunningOnPausedThread++;
                    log.debug("Starting task on paused thread (now running: " + _this.tasksRunningOnPausedThread + ")");
                    var result = _this.actor.interrupt().then(function () { return task(function () { return _this.taskFinished(); }); });
                    resolve(result);
                    return result;
                };
                _this.queuedtasksRunningOnPausedThread.push({ send: send, resolve: resolve, reject: reject });
            });
            return resultPromise;
        }
        else {
            return Promise.reject('Resuming');
        }
    };
    ThreadCoordinator.prototype.setExceptionBreakpoints = function (exceptionBreakpoints) {
        this.exceptionBreakpoints = exceptionBreakpoints;
        // the exceptionBreakpoints setting can only be sent to firefox when the thread is resumed,
        // so we start a dummy task that will pause the thread temporarily
        this.runOnPausedThread(function (finished) { return finished(); });
    };
    ThreadCoordinator.prototype.interrupt = function () {
        var _this = this;
        return this.actor.interrupt(false).then(function () {
            _this.desiredThreadState = ThreadState.Paused;
        });
    };
    /**
     * Resume the thread (once all tasks that require the thread to be paused are finished).
     * This will call the releaseResources function and wait until the returned Promise is
     * resolved before sending the resume request to the thread.
     */
    ThreadCoordinator.prototype.resume = function (releaseResources, resumeLimit) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.queuedResumeRequest = function () {
                switch (resumeLimit) {
                    case 'next':
                        _this.desiredThreadState = ThreadState.StepOver;
                        break;
                    case 'step':
                        _this.desiredThreadState = ThreadState.StepIn;
                        break;
                    case 'finish':
                        _this.desiredThreadState = ThreadState.StepOut;
                        break;
                    default:
                        _this.desiredThreadState = ThreadState.Running;
                        break;
                }
                releaseResources()
                    .then(function () { return _this.actor.resume(_this.exceptionBreakpoints, resumeLimit); })
                    .then(function () {
                    _this.resumeRequestIsRunning = false;
                    resolve();
                    _this.doNext();
                }, function (err) {
                    _this.resumeRequestIsRunning = false;
                    reject(err);
                    _this.doNext();
                });
            };
            _this.doNext();
        });
    };
    /**
     * Evaluate the given expression on the specified StackFrame.
     */
    ThreadCoordinator.prototype.evaluate = function (expr, frameActorName) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var send = function () {
                return _this.actor.interrupt().then(function () {
                    return _this.actor.evaluate(expr, frameActorName);
                }).then(function (grip) { return [grip, function () { return _this.evaluateFinished(); }]; }, function (err) {
                    _this.evaluateFinished();
                    throw err;
                });
            };
            _this.queuedEvaluateRequests.push({ send: send, resolve: resolve, reject: reject });
            _this.doNext();
        });
    };
    /**
     * Evaluate the given expression using the consoleActor.
     */
    ThreadCoordinator.prototype.consoleEvaluate = function (expr) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var send = function () {
                return _this.consoleActor.evaluate(expr).then(function (grip) { return [grip, function () { return _this.evaluateFinished(); }]; }, function (err) {
                    _this.evaluateFinished();
                    throw err;
                });
            };
            _this.queuedEvaluateRequests.push({ send: send, resolve: resolve, reject: reject });
            _this.doNext();
        });
    };
    /**
     * This method is called when a task started with runOnPausedThread() is finished.
     */
    ThreadCoordinator.prototype.taskFinished = function () {
        this.tasksRunningOnPausedThread--;
        log.debug("Task finished on paused thread (remaining: " + this.tasksRunningOnPausedThread + ")");
        this.doNext();
    };
    /**
     * This method is called when an evaluateRequest is finished.
     */
    ThreadCoordinator.prototype.evaluateFinished = function () {
        log.debug('Evaluate finished');
        this.evaluateRequestIsRunning = false;
        this.doNext();
    };
    /**
     * Figure out what to do next after some task is finished or has been enqueued.
     */
    ThreadCoordinator.prototype.doNext = function () {
        var _this = this;
        if ((this.tasksRunningOnPausedThread > 0) || this.resumeRequestIsRunning) {
            return;
        }
        if (this.queuedtasksRunningOnPausedThread.length > 0) {
            this.queuedtasksRunningOnPausedThread.forEach(function (queuedTask) { return queuedTask.send(); });
            this.queuedtasksRunningOnPausedThread = [];
        }
        else if (this.queuedResumeRequest) {
            this.resumeRequestIsRunning = true;
            var resumeRequest = this.queuedResumeRequest;
            this.queuedResumeRequest = null;
            resumeRequest();
        }
        else if ((this.queuedEvaluateRequests.length > 0) && !this.evaluateRequestIsRunning) {
            this.evaluateRequestIsRunning = true;
            var queuedEvaluateRequest_1 = this.queuedEvaluateRequests.shift();
            queuedEvaluateRequest_1.send().then(function (_a) {
                var grip = _a[0], finished = _a[1];
                queuedEvaluateRequest_1.resolve([grip, finished]);
                _this.doNext();
            }, function (err) {
                _this.evaluateRequestIsRunning = false;
                queuedEvaluateRequest_1.reject(err);
                _this.doNext();
            });
        }
        else {
            switch (this.desiredThreadState) {
                case ThreadState.Running:
                    this.actor.resume(this.exceptionBreakpoints);
                    break;
                case ThreadState.StepOver:
                    this.actor.resume(this.exceptionBreakpoints, 'next');
                    break;
                case ThreadState.StepIn:
                    this.actor.resume(this.exceptionBreakpoints, 'step');
                    break;
                case ThreadState.StepOut:
                    this.actor.resume(this.exceptionBreakpoints, 'finish');
                    break;
            }
        }
    };
    return ThreadCoordinator;
}());
exports.ThreadCoordinator = ThreadCoordinator;
//# sourceMappingURL=threadCoordinator.js.map