"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var log_1 = require('../../util/log');
var events_1 = require('events');
var index_1 = require('../index');
var pendingRequests_1 = require('./pendingRequests');
var log = log_1.Log.create('TabActorProxy');
var TabActorProxy = (function (_super) {
    __extends(TabActorProxy, _super);
    function TabActorProxy(_name, _title, _url, connection) {
        _super.call(this);
        this._name = _name;
        this._title = _title;
        this._url = _url;
        this.connection = connection;
        this.pendingAttachRequests = new pendingRequests_1.PendingRequests();
        this.pendingDetachRequests = new pendingRequests_1.PendingRequests();
        this.pendingWorkersRequests = new pendingRequests_1.PendingRequests();
        this.workers = new Map();
        this.connection.register(this);
    }
    Object.defineProperty(TabActorProxy.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabActorProxy.prototype, "title", {
        get: function () {
            return this._title;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(TabActorProxy.prototype, "url", {
        get: function () {
            return this._url;
        },
        enumerable: true,
        configurable: true
    });
    TabActorProxy.prototype.attach = function () {
        var _this = this;
        log.debug("Attaching to tab " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingAttachRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'attach' });
        });
    };
    TabActorProxy.prototype.detach = function () {
        var _this = this;
        log.debug("Detaching from tab " + this.name);
        return new Promise(function (resolve, reject) {
            _this.pendingDetachRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'detach' });
        });
    };
    TabActorProxy.prototype.fetchWorkers = function () {
        var _this = this;
        log.debug('Fetching workers');
        return new Promise(function (resolve, reject) {
            _this.pendingWorkersRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'listWorkers' });
        });
    };
    TabActorProxy.prototype.receiveResponse = function (response) {
        var _this = this;
        if (response['type'] === 'tabAttached') {
            log.debug("Attached to tab " + this.name);
            var tabAttachedResponse_1 = response;
            var threadActor = this.connection.getOrCreate(tabAttachedResponse_1.threadActor, function () { return new index_1.ThreadActorProxy(tabAttachedResponse_1.threadActor, _this.connection); });
            this.emit('attached', threadActor);
            this.pendingAttachRequests.resolveOne(threadActor);
        }
        else if (response['type'] === 'exited') {
            log.debug("Tab " + this.name + " exited");
            this.pendingAttachRequests.rejectOne("exited");
        }
        else if (response['type'] === 'detached') {
            log.debug("Detached from tab " + this.name + " as requested");
            this.pendingDetachRequests.resolveOne(null);
        }
        else if (response['error'] === 'wrongState') {
            log.warn("Tab " + this.name + " was in the wrong state for the last request");
            this.pendingDetachRequests.rejectOne("exited");
        }
        else if (response['type'] === 'tabDetached') {
            log.debug("Detached from tab " + this.name + " because it was closed");
            // TODO handle pendingRequests
            this.emit('detached');
        }
        else if (response['type'] === 'tabNavigated') {
            if (response['state'] === 'start') {
                this._url = response.url;
                log.debug("Tab " + this.name + " will navigate to " + this._url);
                this.emit('willNavigate');
            }
            else if (response['state'] === 'stop') {
                var didNavigateResponse = response;
                this._url = didNavigateResponse.url;
                this._title = didNavigateResponse.title;
                log.debug("Tab " + this.name + " did navigate to " + this._url);
                this.emit('didNavigate');
            }
        }
        else if (response['type'] === 'workerListChanged') {
            log.debug('Received workerListChanged event');
            this.emit('workerListChanged');
        }
        else if (response['workers']) {
            var workersResponse = response;
            var currentWorkers_1 = new Map();
            log.debug("Received " + workersResponse.workers.length + " workers");
            // convert the Worker array into a map of WorkerActorProxies, re-using already 
            // existing proxies and emitting workerStarted events for new ones
            workersResponse.workers.forEach(function (worker) {
                var workerActor;
                if (_this.workers.has(worker.actor)) {
                    workerActor = _this.workers.get(worker.actor);
                }
                else {
                    log.debug("Worker " + worker.actor + " started");
                    workerActor = new index_1.WorkerActorProxy(worker.actor, worker.url, _this.connection);
                    _this.emit('workerStarted', workerActor);
                }
                currentWorkers_1.set(worker.actor, workerActor);
            });
            // emit workerStopped events for workers that have disappeared
            this.workers.forEach(function (workerActor) {
                if (!currentWorkers_1.has(workerActor.name)) {
                    log.debug("Worker " + workerActor.name + " stopped");
                    _this.emit('workerStopped', workerActor);
                }
            });
            this.workers = currentWorkers_1;
            this.pendingWorkersRequests.resolveOne(currentWorkers_1);
        }
        else if (response['error'] === 'noSuchActor') {
            log.error("No such actor " + JSON.stringify(this.name));
            this.pendingAttachRequests.rejectAll('No such actor');
            this.pendingDetachRequests.rejectAll('No such actor');
        }
        else {
            if (response['type'] === 'frameUpdate') {
                log.debug("Ignored frameUpdate event from tab " + this.name);
            }
            else if (response['type'] === 'newSource') {
                log.debug("Ignored newSource event from tab " + this.name);
            }
            else {
                log.warn("Unknown message from TabActor: " + JSON.stringify(response));
            }
        }
    };
    TabActorProxy.prototype.onAttached = function (cb) {
        this.on('attached', cb);
    };
    TabActorProxy.prototype.onDetached = function (cb) {
        this.on('detached', cb);
    };
    TabActorProxy.prototype.onWillNavigate = function (cb) {
        this.on('willNavigate', cb);
    };
    TabActorProxy.prototype.onDidNavigate = function (cb) {
        this.on('didNavigate', cb);
    };
    TabActorProxy.prototype.onWorkerListChanged = function (cb) {
        this.on('workerListChanged', cb);
    };
    TabActorProxy.prototype.onWorkerStarted = function (cb) {
        this.on('workerStarted', cb);
    };
    TabActorProxy.prototype.onWorkerStopped = function (cb) {
        this.on('workerStopped', cb);
    };
    return TabActorProxy;
}(events_1.EventEmitter));
exports.TabActorProxy = TabActorProxy;
//# sourceMappingURL=tab.js.map