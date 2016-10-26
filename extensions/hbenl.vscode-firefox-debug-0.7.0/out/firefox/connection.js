"use strict";
var log_1 = require('../util/log');
var transport_1 = require('./transport');
var root_1 = require('./actorProxy/root');
var log = log_1.Log.create('DebugConnection');
/**
 * Connects to a target supporting the Firefox Debugging Protocol and sends and receives messages
 */
var DebugConnection = (function () {
    function DebugConnection(socket) {
        var _this = this;
        this.actors = new Map();
        this._rootActor = new root_1.RootActorProxy(this);
        this.transport = new transport_1.DebugProtocolTransport(socket);
        this.transport.on('message', function (response) {
            if (_this.actors.has(response.from)) {
                log.debug("Received response/event " + JSON.stringify(response));
                _this.actors.get(response.from).receiveResponse(response);
            }
            else {
                log.error('Unknown actor: ' + JSON.stringify(response));
            }
        });
    }
    Object.defineProperty(DebugConnection.prototype, "rootActor", {
        get: function () {
            return this._rootActor;
        },
        enumerable: true,
        configurable: true
    });
    DebugConnection.prototype.sendRequest = function (request) {
        log.debug("Sending request " + JSON.stringify(request));
        this.transport.sendMessage(request);
    };
    DebugConnection.prototype.register = function (actor) {
        this.actors.set(actor.name, actor);
    };
    DebugConnection.prototype.unregister = function (actor) {
        this.actors.delete(actor.name);
    };
    DebugConnection.prototype.getOrCreate = function (actorName, createActor) {
        if (this.actors.has(actorName)) {
            return this.actors.get(actorName);
        }
        else {
            return createActor();
        }
    };
    DebugConnection.prototype.disconnect = function () {
        return this.transport.disconnect();
    };
    return DebugConnection;
}());
exports.DebugConnection = DebugConnection;
//# sourceMappingURL=connection.js.map