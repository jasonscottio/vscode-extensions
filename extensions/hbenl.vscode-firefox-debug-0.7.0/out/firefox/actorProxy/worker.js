"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var log_1 = require('../../util/log');
var events_1 = require('events');
var index_1 = require('../index');
var log = log_1.Log.create('WorkerActorProxy');
var WorkerActorProxy = (function (_super) {
    __extends(WorkerActorProxy, _super);
    function WorkerActorProxy(_name, _url, connection) {
        _super.call(this);
        this._name = _name;
        this._url = _url;
        this.connection = connection;
        this.connection.register(this);
    }
    Object.defineProperty(WorkerActorProxy.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(WorkerActorProxy.prototype, "url", {
        get: function () {
            return this._url;
        },
        enumerable: true,
        configurable: true
    });
    WorkerActorProxy.prototype.attach = function () {
        var _this = this;
        if (!this.attachPromise) {
            log.debug("Attaching worker " + this.name);
            this.attachPromise = new Promise(function (resolve, reject) {
                _this.pendingAttachRequest = { resolve: resolve, reject: reject };
                _this.connection.sendRequest({ to: _this.name, type: 'attach' });
            });
        }
        else {
            log.warn('Attaching this worker has already been requested!');
        }
        return this.attachPromise;
    };
    WorkerActorProxy.prototype.connect = function () {
        var _this = this;
        if (!this.connectPromise) {
            log.debug("Attaching worker " + this.name);
            this.connectPromise = new Promise(function (resolve, reject) {
                _this.pendingConnectRequest = { resolve: resolve, reject: reject };
                _this.connection.sendRequest({
                    to: _this.name, type: 'connect',
                    options: { useSourceMaps: true }
                });
            });
        }
        else {
            log.warn('Connecting this worker has already been requested!');
        }
        return this.connectPromise;
    };
    WorkerActorProxy.prototype.receiveResponse = function (response) {
        var _this = this;
        if (response['type'] === 'attached') {
            log.debug("Worker " + this.name + " attached");
            var attachedResponse = response;
            if (this.pendingAttachRequest) {
                this.pendingAttachRequest.resolve(attachedResponse.url);
                this.pendingAttachRequest = null;
            }
            else {
                log.warn("Worker " + this.name + " attached without a corresponding request");
            }
        }
        else if (response['type'] === 'connected') {
            log.debug("Worker " + this.name + " attached");
            var connectedResponse_1 = response;
            if (this.pendingConnectRequest) {
                var threadActor = this.connection.getOrCreate(connectedResponse_1.threadActor, function () { return new index_1.ThreadActorProxy(connectedResponse_1.threadActor, _this.connection); });
                this.pendingConnectRequest.resolve(threadActor);
                this.pendingConnectRequest = null;
            }
            else {
                log.warn("Worker " + this.name + " connected without a corresponding request");
            }
        }
        else if (response['type'] === 'close') {
            log.debug("Worker " + this.name + " closed");
            this.emit('close');
        }
        else {
            if (response['type'] === 'newSource') {
                log.debug("Ignored newSource event from worker " + this.name);
            }
            else {
                log.warn("Unknown message from WorkerActor: " + JSON.stringify(response));
            }
        }
    };
    WorkerActorProxy.prototype.onClose = function (cb) {
        this.on('close', cb);
    };
    return WorkerActorProxy;
}(events_1.EventEmitter));
exports.WorkerActorProxy = WorkerActorProxy;
//# sourceMappingURL=worker.js.map