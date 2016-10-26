"use strict";
var misc_1 = require('../util/misc');
var index_1 = require('./index');
var ThreadAdapter = (function () {
    function ThreadAdapter(id, threadActor, consoleActor, name, debugSession) {
        this.sources = [];
        this.frames = [];
        this.scopes = [];
        this.objectGripAdaptersByActorName = new Map();
        this.pauseLifetimeObjects = [];
        this.threadLifetimeObjects = [];
        this.id = id;
        this.actor = threadActor;
        this.consoleActor = consoleActor;
        this._name = name;
        this._debugSession = debugSession;
    }
    Object.defineProperty(ThreadAdapter.prototype, "debugSession", {
        get: function () {
            return this._debugSession;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ThreadAdapter.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ThreadAdapter.prototype, "actorName", {
        get: function () {
            return this.actor.name;
        },
        enumerable: true,
        configurable: true
    });
    ThreadAdapter.prototype.init = function (exceptionBreakpoints) {
        var _this = this;
        this.actor.onPaused(function (reason) {
            _this.completionValue = reason.frameFinished;
        });
        this.coordinator = new index_1.ThreadCoordinator(this.actor, this.consoleActor);
        return this.actor.attach().then(function () {
            _this.coordinator.setExceptionBreakpoints(exceptionBreakpoints);
            return _this.actor.fetchSources().then(function () { return _this.coordinator.resume(function () { return Promise.resolve(undefined); }); });
        });
    };
    ThreadAdapter.prototype.createSourceAdapter = function (id, actor, path) {
        var adapter = new index_1.SourceAdapter(id, actor, path);
        this.sources.push(adapter);
        return adapter;
    };
    ThreadAdapter.prototype.getOrCreateObjectGripAdapter = function (objectGrip, threadLifetime) {
        var objectGripAdapter = this.objectGripAdaptersByActorName.get(objectGrip.actor);
        if (objectGripAdapter !== undefined) {
            // extend the lifetime of the found ObjectGripAdapter if necessary
            if (threadLifetime && !objectGripAdapter.isThreadLifetime) {
                this.pauseLifetimeObjects.splice(this.pauseLifetimeObjects.indexOf(objectGripAdapter), 1);
                this.threadLifetimeObjects.push(objectGripAdapter);
                objectGripAdapter.isThreadLifetime = true;
            }
        }
        else {
            // create new ObjectGripAdapter
            objectGripAdapter = new index_1.ObjectGripAdapter(objectGrip, threadLifetime, this);
            this.objectGripAdaptersByActorName.set(objectGrip.actor, objectGripAdapter);
            if (threadLifetime) {
                this.threadLifetimeObjects.push(objectGripAdapter);
            }
            else {
                this.pauseLifetimeObjects.push(objectGripAdapter);
            }
        }
        return objectGripAdapter;
    };
    ThreadAdapter.prototype.registerScopeAdapter = function (scopeAdapter) {
        this.scopes.push(scopeAdapter);
    };
    ThreadAdapter.prototype.findSourceAdaptersForPath = function (path) {
        if (!path)
            return [];
        return this.sources.filter(function (sourceAdapter) { return (sourceAdapter.sourcePath === path); });
    };
    ThreadAdapter.prototype.findSourceAdapterForActorName = function (actorName) {
        for (var i = 0; i < this.sources.length; i++) {
            if (this.sources[i].actor.name === actorName) {
                return this.sources[i];
            }
        }
        return null;
    };
    ThreadAdapter.prototype.interrupt = function () {
        return this.coordinator.interrupt();
    };
    ThreadAdapter.prototype.resume = function () {
        var _this = this;
        return this.coordinator.resume(function () { return _this.disposePauseLifetimeAdapters(); });
    };
    ThreadAdapter.prototype.stepOver = function () {
        var _this = this;
        return this.coordinator.resume(function () { return _this.disposePauseLifetimeAdapters(); }, 'next');
    };
    ThreadAdapter.prototype.stepIn = function () {
        var _this = this;
        return this.coordinator.resume(function () { return _this.disposePauseLifetimeAdapters(); }, 'step');
    };
    ThreadAdapter.prototype.stepOut = function () {
        var _this = this;
        return this.coordinator.resume(function () { return _this.disposePauseLifetimeAdapters(); }, 'finish');
    };
    ThreadAdapter.prototype.setBreakpoints = function (breakpointInfos, sourceAdapter) {
        return index_1.BreakpointsAdapter.setBreakpointsOnSourceActor(breakpointInfos, sourceAdapter, this.coordinator);
    };
    ThreadAdapter.prototype.setExceptionBreakpoints = function (exceptionBreakpoints) {
        this.coordinator.setExceptionBreakpoints(exceptionBreakpoints);
    };
    ThreadAdapter.prototype.fetchAllStackFrames = function () {
        var _this = this;
        return this.coordinator.runOnPausedThread(function (finished) {
            return _this.actor.fetchStackFrames().then(function (frames) {
                var frameAdapters = frames.map(function (frame) {
                    var frameAdapter = new index_1.FrameAdapter(frame, _this);
                    _this._debugSession.registerFrameAdapter(frameAdapter);
                    _this.frames.push(frameAdapter);
                    return frameAdapter;
                });
                if (frameAdapters.length > 0) {
                    frameAdapters[0].scopeAdapters[0].addCompletionValue(_this.completionValue);
                }
                var objectGripAdapters = misc_1.concatArrays(frameAdapters.map(function (frameAdapter) { return frameAdapter.getObjectGripAdapters(); }));
                var extendLifetimePromises = objectGripAdapters.map(function (objectGripAdapter) {
                    return objectGripAdapter.actor.extendLifetime().catch(function (err) { return undefined; });
                });
                Promise.all(extendLifetimePromises).then(function () { return finished(); });
                return frameAdapters;
            }, function (err) {
                finished();
                throw err;
            });
        });
    };
    ThreadAdapter.prototype.fetchStackFrames = function (start, count) {
        var stackFramesPromise = (this.frames.length > 0) ?
            Promise.resolve(this.frames) :
            this.fetchAllStackFrames();
        return stackFramesPromise.then(function (frameAdapters) {
            var requestedFrames;
            if (count > 0) {
                requestedFrames = frameAdapters.slice(start, start + count);
            }
            else {
                requestedFrames = frameAdapters.slice(start);
            }
            return [requestedFrames, frameAdapters.length];
        });
    };
    ThreadAdapter.prototype.fetchVariables = function (variablesProvider) {
        return this.coordinator.runOnPausedThread(function (finished) {
            return variablesProvider.getVariables().then(function (variableAdapters) {
                var objectGripAdapters = variableAdapters
                    .map(function (variableAdapter) { return variableAdapter.getObjectGripAdapter(); })
                    .filter(function (objectGripAdapter) { return (objectGripAdapter != null); });
                var extendLifetimePromises = objectGripAdapters.map(function (objectGripAdapter) {
                    return objectGripAdapter.actor.extendLifetime().catch(function (err) { return undefined; });
                });
                Promise.all(extendLifetimePromises).then(function () { return finished(); });
                return variableAdapters.map(function (variableAdapter) { return variableAdapter.getVariable(); });
            }, function (err) {
                finished();
                throw err;
            });
        });
    };
    ThreadAdapter.prototype.evaluate = function (expression, frameActorName, threadLifetime) {
        var _this = this;
        var evaluatePromise;
        if (frameActorName) {
            evaluatePromise = this.coordinator.evaluate(expression, frameActorName);
        }
        else {
            evaluatePromise = this.coordinator.consoleEvaluate(expression);
        }
        return evaluatePromise.then(function (_a) {
            var grip = _a[0], finished = _a[1];
            var variableAdapter;
            if (grip) {
                variableAdapter = index_1.VariableAdapter.fromGrip('', grip, threadLifetime, _this);
            }
            else {
                variableAdapter = new index_1.VariableAdapter('', 'undefined');
            }
            var objectGripAdapter = variableAdapter.getObjectGripAdapter();
            if (objectGripAdapter) {
                objectGripAdapter.actor.extendLifetime().then(function () { return finished(); }, function (err) { return finished(); });
            }
            else {
                finished();
            }
            return variableAdapter.getVariable();
        });
    };
    ThreadAdapter.prototype.detach = function () {
        return this.actor.detach();
    };
    ThreadAdapter.prototype.disposePauseLifetimeAdapters = function () {
        var _this = this;
        var objectGripActorsToRelease = this.pauseLifetimeObjects.map(function (objectGripAdapter) { return objectGripAdapter.actor.name; });
        this.pauseLifetimeObjects.forEach(function (objectGripAdapter) {
            objectGripAdapter.dispose();
            _this.objectGripAdaptersByActorName.delete(objectGripAdapter.actor.name);
        });
        this.pauseLifetimeObjects = [];
        this.scopes.forEach(function (scopeAdapter) {
            scopeAdapter.dispose();
        });
        this.scopes = [];
        this.frames.forEach(function (frameAdapter) {
            frameAdapter.dispose();
        });
        this.frames = [];
        return this.actor.releaseMany(objectGripActorsToRelease).catch(function (err) { return undefined; });
    };
    return ThreadAdapter;
}());
exports.ThreadAdapter = ThreadAdapter;
//# sourceMappingURL=thread.js.map