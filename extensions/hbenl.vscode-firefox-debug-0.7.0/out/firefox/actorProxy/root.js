"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var log_1 = require('../../util/log');
var events_1 = require('events');
var pendingRequests_1 = require('./pendingRequests');
var tab_1 = require('./tab');
var console_1 = require('./console');
var log = log_1.Log.create('RootActorProxy');
var RootActorProxy = (function (_super) {
    __extends(RootActorProxy, _super);
    function RootActorProxy(connection) {
        _super.call(this);
        this.connection = connection;
        this.tabs = new Map();
        this.pendingProcessRequests = new pendingRequests_1.PendingRequests();
        this.pendingTabsRequests = new pendingRequests_1.PendingRequests();
        this.pendingAddonsRequests = new pendingRequests_1.PendingRequests();
        this.connection.register(this);
    }
    Object.defineProperty(RootActorProxy.prototype, "name", {
        get: function () {
            return 'root';
        },
        enumerable: true,
        configurable: true
    });
    RootActorProxy.prototype.fetchProcess = function () {
        var _this = this;
        log.debug('Fetching process');
        return new Promise(function (resolve, reject) {
            _this.pendingProcessRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'getProcess' });
        });
    };
    RootActorProxy.prototype.fetchTabs = function () {
        var _this = this;
        log.debug('Fetching tabs');
        return new Promise(function (resolve, reject) {
            _this.pendingTabsRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'listTabs' });
        });
    };
    RootActorProxy.prototype.fetchAddons = function () {
        var _this = this;
        log.debug('Fetching addons');
        return new Promise(function (resolve, reject) {
            _this.pendingAddonsRequests.enqueue({ resolve: resolve, reject: reject });
            _this.connection.sendRequest({ to: _this.name, type: 'listAddons' });
        });
    };
    RootActorProxy.prototype.receiveResponse = function (response) {
        var _this = this;
        if (response['applicationType']) {
            this.emit('init', response);
        }
        else if (response['tabs']) {
            var tabsResponse = response;
            var currentTabs_1 = new Map();
            // sometimes Firefox returns 0 tabs if the listTabs request was sent 
            // shortly after launching it
            if (tabsResponse.tabs.length === 0) {
                log.info('Received 0 tabs - will retry in 100ms');
                setTimeout(function () {
                    _this.connection.sendRequest({ to: _this.name, type: 'listTabs' });
                }, 100);
                return;
            }
            log.debug("Received " + tabsResponse.tabs.length + " tabs");
            // convert the Tab array into a map of TabActorProxies, re-using already 
            // existing proxies and emitting tabOpened events for new ones
            tabsResponse.tabs.forEach(function (tab) {
                var actorsForTab;
                if (_this.tabs.has(tab.actor)) {
                    actorsForTab = _this.tabs.get(tab.actor);
                }
                else {
                    log.debug("Tab " + tab.actor + " opened");
                    actorsForTab = [
                        new tab_1.TabActorProxy(tab.actor, tab.title, tab.url, _this.connection),
                        new console_1.ConsoleActorProxy(tab.consoleActor, _this.connection)
                    ];
                    _this.emit('tabOpened', actorsForTab);
                }
                currentTabs_1.set(tab.actor, actorsForTab);
            });
            // emit tabClosed events for tabs that have disappeared
            this.tabs.forEach(function (actorsForTab) {
                if (!currentTabs_1.has(actorsForTab[0].name)) {
                    log.debug("Tab " + actorsForTab[0].name + " closed");
                    _this.emit('tabClosed', actorsForTab);
                }
            });
            this.tabs = currentTabs_1;
            this.pendingTabsRequests.resolveOne(currentTabs_1);
        }
        else if (response['type'] === 'tabListChanged') {
            log.debug('Received tabListChanged event');
            this.emit('tabListChanged');
        }
        else if (response['addons']) {
            var addonsResponse = response;
            log.debug("Received " + addonsResponse.addons.length + " addons");
            this.pendingAddonsRequests.resolveOne(addonsResponse.addons);
        }
        else if (response['form']) {
            var processResponse = response;
            log.debug('Received getProcess response');
            this.pendingProcessRequests.resolveOne([
                new tab_1.TabActorProxy(processResponse.form.actor, 'Browser', processResponse.form.url, this.connection),
                new console_1.ConsoleActorProxy(processResponse.form.consoleActor, this.connection)
            ]);
        }
        else {
            log.warn("Unknown message from RootActor: " + JSON.stringify(response));
        }
    };
    RootActorProxy.prototype.onInit = function (cb) {
        this.on('init', cb);
    };
    RootActorProxy.prototype.onTabOpened = function (cb) {
        this.on('tabOpened', cb);
    };
    RootActorProxy.prototype.onTabClosed = function (cb) {
        this.on('tabClosed', cb);
    };
    RootActorProxy.prototype.onTabListChanged = function (cb) {
        this.on('tabListChanged', cb);
    };
    return RootActorProxy;
}(events_1.EventEmitter));
exports.RootActorProxy = RootActorProxy;
//# sourceMappingURL=root.js.map