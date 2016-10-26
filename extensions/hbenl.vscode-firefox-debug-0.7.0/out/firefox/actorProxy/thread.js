"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var log_1 = require('../../util/log');
var events_1 = require('events');
var pendingRequests_1 = require('./pendingRequests');
var source_1 = require('./source');
var log = log_1.Log.create('ThreadActorProxy');
(function (ExceptionBreakpoints) {
    ExceptionBreakpoints[ExceptionBreakpoints["All"] = 0] = "All";
    ExceptionBreakpoints[ExceptionBreakpoints["Uncaught"] = 1] = "Uncaught";
    ExceptionBreakpoints[ExceptionBreakpoints["None"] = 2] = "None";
})(exports.ExceptionBreakpoints || (exports.ExceptionBreakpoints = {}));
var ExceptionBreakpoints = exports.ExceptionBreakpoints;
/**
 * A ThreadActorProxy is a proxy for a "thread-like actor" (a Tab or a WebWorker) in Firefox.
 */
var ThreadActorProxy = (function (_super) {
    __extends(ThreadActorProxy, _super);
    function ThreadActorProxy(_name, connection) {
        _super.call(this);
        this._name = _name;
        this.connection = connection;
        this.pendingSourcesRequests = new pendingRequests_1.PendingRequests();
        this.pendingStackFramesRequests = new pendingRequests_1.PendingRequests();
        this.pendingReleaseRequests = new pendingRequests_1.PendingRequests();
        this.connection.register(this);
        log.debug("Created thread " + this.name);
    }
    Object.defineProperty(ThreadActorProxy.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Attach the thread if it is detached
     */
    ThreadActorProxy.prototype.attach = function () {
        var _this = this;
        if (!this.attachPromise) {
            log.debug("Attaching thread " + this.name);
            this.attachPromise = new Promise(function (resolve, reject) {
                _this.pendingAttachRequest = { resolve: resolve, reject: reject };
                _this.connection.sendRequest({
                    to: _this.name, type: 'attach',
                    options: { useSourceMaps: true }
                });
            });
            this.detachPromise = null;
        }
        else {
            log.warn('Attaching this thread has already been requested!');
        }
        return this.attachPromise;
    };
    /**
     * Resume the thread if it is paused
     */
    ThreadActorProxy.prototype.resume = function (exceptionBreakpoints, resumeLimitType) {
        var _this = this;
        if (!this.resumePromise) {
            log.debug("Resuming thread " + this.name);
            var resumeLimit_1 = resumeLimitType ? { type: resumeLimitType } : undefined;
            var pauseOnExceptions_1 = undefined;
            var ignoreCaughtExceptions_1 = undefined;
            switch (exceptionBreakpoints) {
                case ExceptionBreakpoints.All:
                    pauseOnExceptions_1 = true;
                    break;
                case ExceptionBreakpoints.Uncaught:
                    pauseOnExceptions_1 = true;
                    ignoreCaughtExceptions_1 = true;
                    break;
            }
            this.resumePromise = new Promise(function (resolve, reject) {
                _this.pendingResumeRequest = { resolve: resolve, reject: reject };
                _this.connection.sendRequest({
                    to: _this.name, type: 'resume',
                    resumeLimit: resumeLimit_1, pauseOnExceptions: pauseOnExceptions_1, ignoreCaughtExceptions: ignoreCaughtExceptions_1
                });
            });
            this.interruptPromise = null;
        }
        return this.resumePromise;
    };
    /**
     * Interrupt the thread if it is running
     */
    ThreadActorProxy.prototype.interrupt = function (immediately) {
        var _this = this;
        if (immediately === void 0) { immediately = true; }
        if (!this.interruptPromise) {
            log.debug("Interrupting thread " + this.name);
            this.interruptPromise = new Promise(function (resolve, reject) {
                _this.pendingInterruptRequest = { resolve: resolve, reject: reject };
                _this.connection.sendRequest({
                    to: _this.name, type: 'interrupt',
                    when: immediately ? undefined : 'onNext'
                });
            });
            this.resumePromise = null;
        }
        return this.interruptPromise;
    };
    /**
     * Detach the thread if it is attached
     */
    ThreadActorProxy.prototype.detach = function () {
        var _this = this;
        if (!this.detachPromise) {
            log.debug("Detaching thread " + this.name);
            this.detachPromise = new Promise(function (resolve, reject) {
                _this.pendingDetachRequest = { resolve: resolve, reject: reject };
                _this.connection.sendRequest({ to: _this.name, type: 'detach' });
            });
            this.attachPromise = null;
        }
        else {
            log.warn('Detaching this thread has already been requested!');
        }
        return this.detachPromise;
    };
    /**
     * Fetch the list of source files. This will also cause newSource events to be emitted for
     * every source file (including those that are loaded later and strings passed to eval())
     */
    ThreadActorProxy.prototype.fetchSources = function () {
        var _this = this;
        log.debug("Fetching sources from thread " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingSourcesRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'sources' });
        });
    };
    /**
     * Fetch StackFrames. This can only be called while the thread is paused.
     */
    ThreadActorProxy.prototype.fetchStackFrames = function (start, count) {
        var _this = this;
        log.debug("Fetching stackframes from thread " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingStackFramesRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({
                to: _this.name, type: 'frames',
                start: start, count: count
            });
        });
    };
    /**
     * Evaluate the given expression on the specified StackFrame. This can only be called while
     * the thread is paused and will resume it temporarily.
     */
    ThreadActorProxy.prototype.evaluate = function (expr, frameActorName) {
        var _this = this;
        log.debug("Evaluating '" + expr + "' on thread " + this.name);
        return new Promise(function (resolve, reject) {
            if (_this.pendingEvaluateRequest) {
                var err = 'Another evaluateRequest is already running';
                log.error(err);
                reject(err);
                return;
            }
            if (!_this.interruptPromise) {
                var err = 'Can\'t evaluate because the thread isn\'t paused';
                log.error(err);
                reject(err);
                return;
            }
            _this.pendingEvaluateRequest = { resolve: resolve, reject: reject };
            _this.resumePromise = new Promise(function (resolve, reject) {
                _this.pendingResumeRequest = { resolve: resolve, reject: reject };
            });
            _this.interruptPromise = null;
            var escapedExpression = expr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var tryExpression = "eval(\"try{" + escapedExpression + "}catch(e){e.name+':'+e.message}\")";
            _this.connection.sendRequest({
                to: _this.name, type: 'clientEvaluate',
                expression: tryExpression, frame: frameActorName
            });
        });
    };
    /**
     * Release object grips that were promoted to thread-lifetime grips using
     * ObjectGripActorProxy.extendLifetime(). This can only be called while the thread is paused.
     */
    ThreadActorProxy.prototype.releaseMany = function (objectGripActorNames) {
        var _this = this;
        log.debug("Releasing grips on thread " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingReleaseRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({
                to: _this.name, type: 'releaseMany',
                actors: objectGripActorNames
            });
        });
    };
    ThreadActorProxy.prototype.receiveResponse = function (response) {
        var _this = this;
        if (response['type'] === 'paused') {
            var pausedResponse = response;
            log.debug("Received paused message of type " + pausedResponse.why.type);
            switch (pausedResponse.why.type) {
                case 'attached':
                    if (this.pendingAttachRequest) {
                        this.pendingAttachRequest.resolve(undefined);
                        this.pendingAttachRequest = null;
                        this.interruptPromise = Promise.resolve(undefined);
                    }
                    else {
                        log.warn('Received attached message without pending request');
                    }
                    break;
                case 'interrupted':
                case 'alreadyPaused':
                    if (this.pendingInterruptRequest) {
                        this.pendingInterruptRequest.resolve(undefined);
                        this.pendingInterruptRequest = null;
                    }
                    else {
                        log.warn("Received " + pausedResponse.why.type + " message without pending request");
                    }
                    break;
                case 'resumeLimit':
                case 'breakpoint':
                case 'exception':
                case 'debuggerStatement':
                    if (this.pendingInterruptRequest) {
                        this.pendingInterruptRequest.resolve(undefined);
                        this.pendingInterruptRequest = null;
                    }
                    else {
                        this.interruptPromise = Promise.resolve(undefined);
                    }
                    if (this.pendingResumeRequest) {
                        this.pendingResumeRequest.reject("Hit " + pausedResponse.why.type);
                        this.pendingResumeRequest = null;
                    }
                    this.resumePromise = null;
                    this.emit('paused', pausedResponse.why);
                    break;
                case 'clientEvaluated':
                    this.interruptPromise = Promise.resolve(undefined);
                    this.resumePromise = null;
                    if (this.pendingEvaluateRequest) {
                        this.pendingEvaluateRequest.resolve(pausedResponse.why.frameFinished.return);
                        this.pendingEvaluateRequest = null;
                    }
                    else {
                        log.warn('Received clientEvaluated message without pending request');
                    }
                    break;
                default:
                    log.warn("Paused event with reason " + pausedResponse.why.type + " not handled yet");
                    this.emit('paused', pausedResponse.why);
                    break;
            }
        }
        else if (response['type'] === 'resumed') {
            if (this.pendingResumeRequest) {
                log.debug("Received resumed event from " + this.name);
                this.pendingResumeRequest.resolve(undefined);
                this.pendingResumeRequest = null;
            }
            else {
                log.debug("Received unexpected resumed event from " + this.name);
                this.interruptPromise = null;
                this.resumePromise = Promise.resolve(undefined);
                this.emit('resumed');
            }
        }
        else if (response['type'] === 'detached') {
            log.debug("Thread " + this.name + " detached");
            if (this.pendingDetachRequest) {
                this.pendingDetachRequest.resolve(undefined);
                this.pendingDetachRequest = null;
            }
            else {
                log.warn("Thread " + this.name + " detached without a corresponding request");
            }
            this.pendingStackFramesRequests.rejectAll('Detached');
            if (this.pendingEvaluateRequest) {
                this.pendingEvaluateRequest.reject('Detached');
                this.pendingEvaluateRequest = null;
            }
        }
        else if (response['sources']) {
            var sources = (response['sources']);
            log.debug("Received " + sources.length + " sources from thread " + this.name);
            this.pendingSourcesRequests.resolveOne(sources);
        }
        else if (response['type'] === 'newSource') {
            var source_2 = (response['source']);
            log.debug("New source " + source_2.url + " on thread " + this.name);
            var sourceActor = this.connection.getOrCreate(source_2.actor, function () { return new source_1.SourceActorProxy(source_2, _this.connection); });
            this.emit('newSource', sourceActor);
        }
        else if (response['frames']) {
            var frames_1 = (response['frames']);
            log.debug("Received " + frames_1.length + " frames from thread " + this.name);
            this.pendingStackFramesRequests.resolveOne(frames_1);
        }
        else if (response['type'] === 'exited') {
            log.debug("Thread " + this.name + " exited");
            this.emit('exited');
        }
        else if (response['error'] === 'wrongState') {
            log.warn("Thread " + this.name + " was in the wrong state for the last request");
            //TODO reject last request!
            this.emit('wrongState');
        }
        else if (response['error'] === 'wrongOrder') {
            log.warn("got wrongOrder error: " + response['message']);
            this.resumePromise = null;
            this.pendingResumeRequest.reject("You need to resume " + response['lastPausedUrl'] + " first");
        }
        else if (response['error'] === 'noSuchActor') {
            log.error("No such actor " + JSON.stringify(this.name));
            if (this.pendingAttachRequest) {
                this.pendingAttachRequest.reject('No such actor');
            }
            if (this.pendingDetachRequest) {
                this.pendingDetachRequest.reject('No such actor');
            }
            if (this.pendingInterruptRequest) {
                this.pendingInterruptRequest.reject('No such actor');
            }
            if (this.pendingResumeRequest) {
                this.pendingResumeRequest.reject('No such actor');
            }
            this.pendingSourcesRequests.rejectAll('No such actor');
            this.pendingStackFramesRequests.rejectAll('No such actor');
            if (this.pendingEvaluateRequest) {
                this.pendingEvaluateRequest.reject('No such actor');
                this.pendingEvaluateRequest = null;
            }
            this.pendingReleaseRequests.rejectAll('No such actor');
        }
        else if (response['error'] === 'notReleasable') {
            log.error('Error releasing threadGrips');
            this.pendingReleaseRequests.rejectOne('Not releasable');
        }
        else if (response['error'] === 'unknownFrame') {
            var errorMsg = response['message'];
            log.error("Error evaluating expression: " + errorMsg);
            this.pendingEvaluateRequest.reject(errorMsg);
            this.pendingEvaluateRequest = null;
        }
        else if (Object.keys(response).length === 1) {
            log.debug('Received response to releaseMany request');
            this.pendingReleaseRequests.resolveOne(undefined);
        }
        else {
            if (response['type'] === 'newGlobal') {
                log.debug("Received newGlobal event from " + this.name + " (ignoring)");
            }
            else if (response['type'] === 'willInterrupt') {
                log.debug("Received willInterrupt event from " + this.name + " (ignoring)");
            }
            else {
                log.warn("Unknown message from ThreadActor: " + JSON.stringify(response));
            }
        }
    };
    /**
     * The paused event is only sent when the thread is paused because it hit a breakpoint or a
     * resumeLimit, but not if it was paused due to an interrupt request or because an evaluate
     * request is finished
     */
    ThreadActorProxy.prototype.onPaused = function (cb) {
        this.on('paused', cb);
    };
    /**
     * The resumed event is only sent when the thread is resumed without a corresponding request
     * (this happens when a tab in Firefox is reloaded or navigated to a different url while
     * the corresponding thread is paused)
     */
    ThreadActorProxy.prototype.onResumed = function (cb) {
        this.on('resumed', cb);
    };
    ThreadActorProxy.prototype.onExited = function (cb) {
        this.on('exited', cb);
    };
    ThreadActorProxy.prototype.onWrongState = function (cb) {
        this.on('wrongState', cb);
    };
    ThreadActorProxy.prototype.onNewSource = function (cb) {
        this.on('newSource', cb);
    };
    return ThreadActorProxy;
}(events_1.EventEmitter));
exports.ThreadActorProxy = ThreadActorProxy;
//# sourceMappingURL=thread.js.map