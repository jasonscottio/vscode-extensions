"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var log_1 = require('../../util/log');
var events_1 = require('events');
var pendingRequests_1 = require('./pendingRequests');
var log = log_1.Log.create('ConsoleActorProxy');
var ConsoleActorProxy = (function (_super) {
    __extends(ConsoleActorProxy, _super);
    function ConsoleActorProxy(_name, connection) {
        _super.call(this);
        this._name = _name;
        this.connection = connection;
        this.pendingStartListenersRequests = new pendingRequests_1.PendingRequests();
        this.pendingStopListenersRequests = new pendingRequests_1.PendingRequests();
        this.pendingResultIDRequests = new pendingRequests_1.PendingRequests();
        this.pendingEvaluateRequests = new Map();
        this.connection.register(this);
    }
    Object.defineProperty(ConsoleActorProxy.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    ConsoleActorProxy.prototype.startListeners = function () {
        var _this = this;
        log.debug('Starting console listeners');
        return new Promise(function (resolve, reject) {
            _this.pendingStartListenersRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({
                to: _this.name, type: 'startListeners',
                listeners: ConsoleActorProxy.listenFor
            });
        });
    };
    ConsoleActorProxy.prototype.stopListeners = function () {
        var _this = this;
        log.debug('Stopping console listeners');
        return new Promise(function (resolve, reject) {
            _this.pendingStopListenersRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({
                to: _this.name, type: 'stopListeners',
                listeners: ConsoleActorProxy.listenFor
            });
        });
    };
    /**
     * Evaluate the given expression. This will create 2 PendingRequest objects because we expect
     * 2 answers: the first answer gives us a resultID for the evaluation result. The second answer
     * gives us the actual evaluation result.
     */
    ConsoleActorProxy.prototype.evaluate = function (expr) {
        var _this = this;
        log.debug("Evaluating '" + expr + "' on console " + this.name);
        return new Promise(function (resolveEvaluate, rejectEvaluate) {
            // we don't use a promise for the pendingResultIDRequest because we need the
            // pendingEvaluateRequest to be enqueued *immediately* after receiving the resultID
            // message (and a promise doesn't call its callbacks immediately after being resolved,
            // but rather schedules them to be called later)
            _this.pendingResultIDRequests.enqueue({
                resolve: function (resultID) {
                    _this.pendingEvaluateRequests.set(resultID, {
                        resolve: resolveEvaluate, reject: rejectEvaluate
                    });
                },
                reject: function () { }
            });
            var escapedExpression = expr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var tryExpression = "eval(\"try{" + escapedExpression + "}catch(e){e.name+':'+e.message}\")";
            _this.connection.sendRequest({
                to: _this.name, type: 'evaluateJSAsync',
                text: tryExpression
            });
        });
    };
    ConsoleActorProxy.prototype.receiveResponse = function (response) {
        if (response['startedListeners']) {
            log.debug('Listeners started');
            this.pendingStartListenersRequests.resolveOne(null);
        }
        else if (response['stoppedListeners']) {
            log.debug('Listeners stopped');
            this.pendingStartListenersRequests.resolveOne(null);
        }
        else if (response['type'] === 'consoleAPICall') {
            log.debug("Received ConsoleAPI message");
            this.emit('consoleAPI', response.message);
        }
        else if (response['type'] === 'pageError') {
            log.debug("Received PageError message");
            this.emit('pageError', response.pageError);
        }
        else if (response['type'] === 'evaluationResult') {
            log.debug("Received EvaluationResult message");
            var resultResponse = response;
            if (!this.pendingEvaluateRequests.has(resultResponse.resultID)) {
                log.error('Received evaluationResult with unknown resultID');
            }
            else {
                this.pendingEvaluateRequests.get(resultResponse.resultID).resolve(resultResponse.result);
            }
        }
        else if (response['resultID']) {
            log.debug("Received ResultID message");
            this.pendingResultIDRequests.resolveOne(response['resultID']);
        }
        else {
            log.warn("Unknown message from ConsoleActor: " + JSON.stringify(response));
        }
    };
    ConsoleActorProxy.prototype.onConsoleAPICall = function (cb) {
        this.on('consoleAPI', cb);
    };
    ConsoleActorProxy.prototype.onPageErrorCall = function (cb) {
        this.on('pageError', cb);
    };
    ConsoleActorProxy.listenFor = ['PageError', 'ConsoleAPI'];
    return ConsoleActorProxy;
}(events_1.EventEmitter));
exports.ConsoleActorProxy = ConsoleActorProxy;
//# sourceMappingURL=console.js.map