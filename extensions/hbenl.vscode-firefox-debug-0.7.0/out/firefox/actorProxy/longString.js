"use strict";
var log_1 = require('../../util/log');
var pendingRequests_1 = require('./pendingRequests');
var log = log_1.Log.create('LongStringGripActorProxy');
var LongStringGripActorProxy = (function () {
    function LongStringGripActorProxy(grip, connection) {
        this.grip = grip;
        this.connection = connection;
        this.pendingSubstringRequests = new pendingRequests_1.PendingRequests();
        this.connection.register(this);
    }
    Object.defineProperty(LongStringGripActorProxy.prototype, "name", {
        get: function () {
            return this.grip.actor;
        },
        enumerable: true,
        configurable: true
    });
    LongStringGripActorProxy.prototype.extendLifetime = function () {
        this.connection.sendRequest({ to: this.name, type: 'threadGrip' });
    };
    LongStringGripActorProxy.prototype.fetchContent = function () {
        var _this = this;
        log.debug("Fetching content from long string " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingSubstringRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'substring', start: 0, end: _this.grip.length });
        });
    };
    LongStringGripActorProxy.prototype.receiveResponse = function (response) {
        if (response['substring'] !== undefined) {
            log.debug("Content fetched from " + this.name);
            this.pendingSubstringRequests.resolveOne(response['substring']);
        }
        else if (response['error'] === 'noSuchActor') {
            log.error("No such actor " + JSON.stringify(this.grip));
            this.pendingSubstringRequests.rejectAll('No such actor');
        }
        else if (Object.keys(response).length === 1) {
            log.debug('Received response to threadGrip or release request');
        }
        else {
            log.warn("Unknown message from LongStringActor: " + JSON.stringify(response));
        }
    };
    return LongStringGripActorProxy;
}());
exports.LongStringGripActorProxy = LongStringGripActorProxy;
//# sourceMappingURL=longString.js.map