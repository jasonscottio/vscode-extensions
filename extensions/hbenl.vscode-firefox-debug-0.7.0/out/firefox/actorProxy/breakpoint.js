"use strict";
var log_1 = require('../../util/log');
var pendingRequests_1 = require('./pendingRequests');
var log = log_1.Log.create('BreakpointActorProxy');
var BreakpointActorProxy = (function () {
    function BreakpointActorProxy(_name, connection) {
        this._name = _name;
        this.connection = connection;
        this.pendingDeleteRequests = new pendingRequests_1.PendingRequests();
        this.connection.register(this);
    }
    Object.defineProperty(BreakpointActorProxy.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    BreakpointActorProxy.prototype.delete = function () {
        var _this = this;
        log.debug("Deleting breakpoint " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingDeleteRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'delete' });
        });
    };
    BreakpointActorProxy.prototype.receiveResponse = function (response) {
        log.debug("Breakpoint " + this.name + " deleted");
        this.pendingDeleteRequests.resolveAll(null);
        this.connection.unregister(this);
    };
    return BreakpointActorProxy;
}());
exports.BreakpointActorProxy = BreakpointActorProxy;
//# sourceMappingURL=breakpoint.js.map