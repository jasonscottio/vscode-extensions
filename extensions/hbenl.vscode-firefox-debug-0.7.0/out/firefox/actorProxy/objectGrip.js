"use strict";
var log_1 = require('../../util/log');
var pendingRequests_1 = require('./pendingRequests');
var log = log_1.Log.create('ObjectGripActorProxy');
var ObjectGripActorProxy = (function () {
    function ObjectGripActorProxy(grip, connection) {
        this.grip = grip;
        this.connection = connection;
        this.pendingThreadGripRequest = null;
        this.threadGripPromise = null;
        this.pendingPrototypeAndPropertiesRequests = new pendingRequests_1.PendingRequests();
        this.connection.register(this);
    }
    Object.defineProperty(ObjectGripActorProxy.prototype, "name", {
        get: function () {
            return this.grip.actor;
        },
        enumerable: true,
        configurable: true
    });
    ObjectGripActorProxy.prototype.extendLifetime = function () {
        var _this = this;
        if (this.threadGripPromise != null) {
            return this.threadGripPromise;
        }
        log.debug("Extending lifetime of " + this.name);
        this.threadGripPromise = new Promise(function (resolve, reject) {
            _this.pendingThreadGripRequest = { resolve: resolve, reject: reject };
            _this.connection.sendRequest({ to: _this.name, type: 'threadGrip' });
        });
        return this.threadGripPromise;
    };
    ObjectGripActorProxy.prototype.fetchPrototypeAndProperties = function () {
        var _this = this;
        log.debug("Fetching prototype and properties from " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingPrototypeAndPropertiesRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'prototypeAndProperties' });
        });
    };
    ObjectGripActorProxy.prototype.dispose = function () {
        this.connection.unregister(this);
    };
    ObjectGripActorProxy.prototype.receiveResponse = function (response) {
        if ((response['prototype'] !== undefined) && (response['ownProperties'] !== undefined)) {
            log.debug("Prototype and properties fetched from " + this.name);
            this.pendingPrototypeAndPropertiesRequests.resolveOne(response);
        }
        else if (Object.keys(response).length === 1) {
            log.debug('Received response to threadGrip request');
            if (this.pendingThreadGripRequest != null) {
                this.pendingThreadGripRequest.resolve(undefined);
                this.pendingThreadGripRequest = null;
            }
            else {
                log.warn('Received threadGrip response without pending request');
            }
        }
        else if (response['error'] === 'noSuchActor') {
            log.error("No such actor " + JSON.stringify(this.grip));
            this.pendingPrototypeAndPropertiesRequests.rejectAll('No such actor');
            if (this.pendingThreadGripRequest != null) {
                this.pendingThreadGripRequest.resolve(undefined);
                this.pendingThreadGripRequest = null;
            }
        }
        else {
            log.warn("Unknown message from ObjectGripActor: " + JSON.stringify(response));
        }
    };
    return ObjectGripActorProxy;
}());
exports.ObjectGripActorProxy = ObjectGripActorProxy;
//# sourceMappingURL=objectGrip.js.map