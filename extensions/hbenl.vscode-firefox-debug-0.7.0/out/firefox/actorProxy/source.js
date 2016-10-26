"use strict";
var log_1 = require('../../util/log');
var pendingRequests_1 = require('./pendingRequests');
var breakpoint_1 = require('./breakpoint');
var log = log_1.Log.create('SourceActorProxy');
var SourceActorProxy = (function () {
    function SourceActorProxy(_source, connection) {
        this._source = _source;
        this.connection = connection;
        this.pendingSetBreakpointRequests = new pendingRequests_1.PendingRequests();
        this.pendingFetchSourceRequests = new pendingRequests_1.PendingRequests();
        this.connection.register(this);
    }
    Object.defineProperty(SourceActorProxy.prototype, "name", {
        get: function () {
            return this._source.actor;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SourceActorProxy.prototype, "source", {
        get: function () {
            return this._source;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SourceActorProxy.prototype, "url", {
        get: function () {
            return this._source.url;
        },
        enumerable: true,
        configurable: true
    });
    SourceActorProxy.prototype.setBreakpoint = function (location, condition) {
        var _this = this;
        log.debug("Setting breakpoint at line " + location.line + " in " + this.url);
        return new Promise(function (resolve, reject) {
            _this.pendingSetBreakpointRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'setBreakpoint', location: location, condition: condition });
        });
    };
    SourceActorProxy.prototype.fetchSource = function () {
        var _this = this;
        log.debug("Fetching source of " + this.url);
        return new Promise(function (resolve, reject) {
            _this.pendingFetchSourceRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'source' });
        });
    };
    SourceActorProxy.prototype.receiveResponse = function (response) {
        var _this = this;
        if (response['isPending'] !== undefined) {
            var setBreakpointResponse_1 = response;
            var actualLocation = setBreakpointResponse_1.actualLocation;
            log.debug("Breakpoint has been set at " + JSON.stringify(actualLocation) + " in " + this.url);
            var breakpointActor = this.connection.getOrCreate(setBreakpointResponse_1.actor, function () { return new breakpoint_1.BreakpointActorProxy(setBreakpointResponse_1.actor, _this.connection); });
            this.pendingSetBreakpointRequests.resolveOne(new SetBreakpointResult(breakpointActor, actualLocation));
        }
        else if (response['source'] !== undefined) {
            var grip = response['source'];
            this.pendingFetchSourceRequests.resolveOne(grip);
        }
        else if (response['error'] === 'noSuchActor') {
            log.error("No such actor " + JSON.stringify(this.name));
            this.pendingFetchSourceRequests.rejectAll('No such actor');
            this.pendingSetBreakpointRequests.rejectAll('No such actor');
        }
        else {
            log.warn("Unknown message from SourceActor: " + JSON.stringify(response));
        }
    };
    return SourceActorProxy;
}());
exports.SourceActorProxy = SourceActorProxy;
var SetBreakpointResult = (function () {
    function SetBreakpointResult(breakpointActor, actualLocation) {
        this.breakpointActor = breakpointActor;
        this.actualLocation = actualLocation;
    }
    return SetBreakpointResult;
}());
exports.SetBreakpointResult = SetBreakpointResult;
//# sourceMappingURL=source.js.map