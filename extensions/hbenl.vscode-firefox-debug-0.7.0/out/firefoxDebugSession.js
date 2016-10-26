"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var os = require('os');
var path = require('path');
var net_1 = require('net');
var log_1 = require('./util/log');
var addon_1 = require('./util/addon');
var launcher_1 = require('./util/launcher');
var vscode_debugadapter_1 = require('vscode-debugadapter');
var index_1 = require('./firefox/index');
var index_2 = require('./adapter/index');
var log = log_1.Log.create('FirefoxDebugSession');
var pathConversionLog = log_1.Log.create('PathConversion');
var consoleActorLog = log_1.Log.create('ConsoleActor');
var FirefoxDebugSession = (function (_super) {
    __extends(FirefoxDebugSession, _super);
    function FirefoxDebugSession(debuggerLinesStartAt1, isServer) {
        var _this = this;
        if (isServer === void 0) { isServer = false; }
        _super.call(this, debuggerLinesStartAt1, isServer);
        this.firefoxProc = null;
        this.pathMappings = [];
        this.nextThreadId = 1;
        this.threadsById = new Map();
        this.nextBreakpointId = 1;
        this.breakpointsBySourcePath = new Map();
        this.verifiedBreakpointSources = [];
        this.nextFrameId = 1;
        this.framesById = new Map();
        this.nextVariablesProviderId = 1;
        this.variablesProvidersById = new Map();
        this.nextSourceId = 1;
        this.sourcesById = new Map();
        this.exceptionBreakpoints = index_1.ExceptionBreakpoints.All;
        this.urlDetector = /^[a-zA-Z][a-zA-Z0-9\+\-\.]*\:\/\//;
        this.isWindowsPlatform = (os.platform() === 'win32');
        if (!isServer) {
            log_1.Log.consoleLog = function (msg) {
                _this.sendEvent(new vscode_debugadapter_1.OutputEvent(msg + '\n'));
            };
        }
    }
    FirefoxDebugSession.prototype.registerVariablesProvider = function (variablesProvider) {
        var providerId = this.nextVariablesProviderId++;
        variablesProvider.variablesProviderId = providerId;
        this.variablesProvidersById.set(providerId, variablesProvider);
    };
    FirefoxDebugSession.prototype.unregisterVariablesProvider = function (variablesProvider) {
        this.variablesProvidersById.delete(variablesProvider.variablesProviderId);
    };
    FirefoxDebugSession.prototype.registerFrameAdapter = function (frameAdapter) {
        var frameId = this.nextFrameId++;
        frameAdapter.id = frameId;
        this.framesById.set(frameAdapter.id, frameAdapter);
    };
    FirefoxDebugSession.prototype.unregisterFrameAdapter = function (frameAdapter) {
        this.framesById.delete(frameAdapter.id);
    };
    FirefoxDebugSession.prototype.getOrCreateObjectGripActorProxy = function (objectGrip) {
        var _this = this;
        return this.firefoxDebugConnection.getOrCreate(objectGrip.actor, function () {
            return new index_1.ObjectGripActorProxy(objectGrip, _this.firefoxDebugConnection);
        });
    };
    FirefoxDebugSession.prototype.getOrCreateLongStringGripActorProxy = function (longStringGrip) {
        var _this = this;
        return this.firefoxDebugConnection.getOrCreate(longStringGrip.actor, function () {
            return new index_1.LongStringGripActorProxy(longStringGrip, _this.firefoxDebugConnection);
        });
    };
    FirefoxDebugSession.prototype.convertFirefoxSourceToPath = function (source) {
        if (source.addonID && (source.addonID === this.addonId)) {
            var sourcePath = path.join(this.addonPath, source.addonPath);
            pathConversionLog.debug("Addon script path: " + sourcePath);
            return sourcePath;
        }
        else if (source.isSourceMapped && source.generatedUrl && !this.urlDetector.test(source.url)) {
            var generatedPath = this.convertFirefoxUrlToPath(source.generatedUrl);
            if (!generatedPath)
                return null;
            var relativePath = source.url;
            var sourcePath = path.join(path.dirname(generatedPath), relativePath);
            pathConversionLog.debug("Sourcemapped path: " + sourcePath);
            return sourcePath;
        }
        else if ((this.addonType === 'webExtension') && (source.url.substr(0, 16) === 'moz-extension://')) {
            var sourcePath = path.join(this.addonPath, source.url.substr(source.url.indexOf('/', 16)));
            pathConversionLog.debug("WebExtension script path: " + sourcePath);
            return sourcePath;
        }
        else {
            return this.convertFirefoxUrlToPath(source.url);
        }
    };
    FirefoxDebugSession.prototype.convertFirefoxUrlToPath = function (url) {
        if (!url)
            return null;
        for (var i = 0; i < this.pathMappings.length; i++) {
            var _a = this.pathMappings[i], from = _a[0], to = _a[1];
            if (url.substr(0, from.length) === from) {
                var path_1 = to + url.substr(from.length);
                if (this.isWindowsPlatform) {
                    path_1 = path_1.replace(/\//g, '\\');
                }
                pathConversionLog.debug("Converted url " + url + " to path " + path_1);
                return path_1;
            }
        }
        if ((url.substr(0, 11) === 'resource://') || (url.substr(0, 9) === 'chrome://') ||
            (url === 'XStringBundle') || (url.substr(0, 4) === 'jar:')) {
            pathConversionLog.info("Can't convert url " + url + " to path");
        }
        else {
            pathConversionLog.warn("Can't convert url " + url + " to path");
        }
        return null;
    };
    FirefoxDebugSession.prototype.initializeRequest = function (response, args) {
        response.body = {
            supportsConfigurationDoneRequest: false,
            supportsEvaluateForHovers: false,
            supportsFunctionBreakpoints: false,
            supportsConditionalBreakpoints: true,
            exceptionBreakpointFilters: [
                {
                    filter: 'all',
                    label: 'All Exceptions',
                    default: false
                },
                {
                    filter: 'uncaught',
                    label: 'Uncaught Exceptions',
                    default: true
                }
            ]
        };
        this.sendResponse(response);
    };
    FirefoxDebugSession.prototype.launchRequest = function (response, args) {
        var _this = this;
        var configError = this.readCommonConfiguration(args);
        if (configError) {
            response.success = false;
            response.message = configError;
            this.sendResponse(response);
            return;
        }
        launcher_1.launchFirefox(args, this.addonId).then(function (launchResult) {
            _this.firefoxProc = launchResult;
            launcher_1.waitForSocket(args).then(function (socket) {
                _this.startSession(socket);
                _this.sendResponse(response);
            }, function (err) {
                log.error('Error: ' + err);
                response.success = false;
                response.message = String(err);
                _this.sendResponse(response);
            });
        }, function (err) {
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.attachRequest = function (response, args) {
        var _this = this;
        var configError = this.readCommonConfiguration(args);
        if (configError) {
            response.success = false;
            response.message = configError;
            this.sendResponse(response);
            return;
        }
        var socket = net_1.connect(args.port || 6000, args.host || 'localhost');
        this.startSession(socket);
        socket.on('connect', function () {
            _this.sendResponse(response);
        });
        socket.on('error', function (err) {
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.readCommonConfiguration = function (args) {
        if (args.log) {
            log_1.Log.config = args.log;
        }
        if (args.addonType) {
            if (!args.addonPath) {
                return "If you set \"addonType\" you also have to set \"addonPath\" in the " + args.request + " configuration";
            }
            this.addonType = args.addonType;
            var success = void 0;
            var addonIdOrErrorMsg = void 0;
            _a = addon_1.findAddonId(args.addonType, args.addonPath), success = _a[0], addonIdOrErrorMsg = _a[1];
            if (success) {
                this.addonId = addonIdOrErrorMsg;
                this.addonPath = args.addonPath;
            }
            else {
                return addonIdOrErrorMsg;
            }
        }
        else if (args.addonPath) {
            return "If you set \"addonPath\" you also have to set \"addonType\" in the " + args.request + " configuration";
        }
        else if (args.url) {
            if (!args.webRoot) {
                return "If you set \"url\" you also have to set \"webRoot\" in the " + args.request + " configuration";
            }
            else if (!path.isAbsolute(args.webRoot)) {
                return "The \"webRoot\" property in the " + args.request + " configuration has to be an absolute path";
            }
            var webRootUrl = args.url;
            if (webRootUrl.indexOf('/') >= 0) {
                webRootUrl = webRootUrl.substr(0, webRootUrl.lastIndexOf('/'));
            }
            var webRoot = path.normalize(args.webRoot);
            if (this.isWindowsPlatform) {
                webRoot = webRoot.replace(/\\/g, '/');
            }
            if (webRoot[webRoot.length - 1] === '/') {
                webRoot = webRoot.substr(0, webRoot.length - 1);
            }
            this.pathMappings.push([webRootUrl, webRoot]);
        }
        else if (args.webRoot) {
            return "If you set \"webRoot\" you also have to set \"url\" in the " + args.request + " configuration";
        }
        this.pathMappings.push([(this.isWindowsPlatform ? 'file:///' : 'file://'), '']);
        pathConversionLog.debug('Path mappings:');
        this.pathMappings.forEach(function (_a) {
            var from = _a[0], to = _a[1];
            return pathConversionLog.debug("'" + from + "' => '" + to + "'");
        });
        var _a;
    };
    FirefoxDebugSession.prototype.startSession = function (socket) {
        var _this = this;
        this.firefoxDebugConnection = new index_1.DebugConnection(socket);
        var rootActor = this.firefoxDebugConnection.rootActor;
        var nextTabId = 1;
        if (this.addonId) {
            // attach to Firefox addon
            rootActor.onInit(function () {
                rootActor.fetchAddons().then(function (addons) {
                    addons.forEach(function (addon) {
                        if (addon.id === _this.addonId) {
                            _this.attachTab(new index_1.TabActorProxy(addon.actor, addon.name, '', _this.firefoxDebugConnection), new index_1.ConsoleActorProxy(addon.consoleActor, _this.firefoxDebugConnection), nextTabId++, false, 'Addon');
                        }
                    });
                });
                if (_this.addonType === 'legacy') {
                    rootActor.fetchProcess().then(function (_a) {
                        var tabActor = _a[0], consoleActor = _a[1];
                        _this.attachTab(tabActor, consoleActor, nextTabId++, true, 'Browser');
                    });
                }
            });
        }
        // attach to all tabs, register the corresponding threads and inform VSCode about them
        rootActor.onTabOpened(function (_a) {
            var tabActor = _a[0], consoleActor = _a[1];
            log.info("Tab opened with url " + tabActor.url);
            var tabId = nextTabId++;
            _this.attachTab(tabActor, consoleActor, tabId);
            _this.attachConsole(consoleActor);
        });
        rootActor.onTabListChanged(function () {
            rootActor.fetchTabs();
        });
        rootActor.onInit(function () {
            rootActor.fetchTabs();
        });
        // now we are ready to accept breakpoints -> fire the initialized event to give UI a chance to set breakpoints
        this.sendEvent(new vscode_debugadapter_1.InitializedEvent());
    };
    FirefoxDebugSession.prototype.attachTab = function (tabActor, consoleActor, tabId, hasWorkers, threadName) {
        var _this = this;
        if (hasWorkers === void 0) { hasWorkers = true; }
        tabActor.attach().then(function (threadActor) {
            log.debug("Attached to tab " + tabActor.name);
            var threadId = _this.nextThreadId++;
            if (!threadName) {
                threadName = "Tab " + tabId;
            }
            var threadAdapter = new index_2.ThreadAdapter(threadId, threadActor, consoleActor, threadName, _this);
            _this.attachThread(threadActor, threadAdapter);
            threadAdapter.init(_this.exceptionBreakpoints).then(function () {
                _this.threadsById.set(threadId, threadAdapter);
                _this.sendEvent(new vscode_debugadapter_1.ThreadEvent('started', threadId));
                tabActor.onDetached(function () {
                    _this.threadsById.delete(threadId);
                    _this.sendEvent(new vscode_debugadapter_1.ThreadEvent('exited', threadId));
                });
            }, function (err) {
                // When the user closes a tab, Firefox creates an invisible tab and
                // immediately closes it again (while we're still trying to attach to it),
                // so the initialization for this invisible tab fails and we end up here.
                // Since we never sent the current threadId to VSCode, we can re-use it
                if (_this.nextThreadId == (threadId + 1)) {
                    _this.nextThreadId--;
                }
            });
            if (hasWorkers) {
                var nextWorkerId_1 = 1;
                tabActor.onWorkerStarted(function (workerActor) {
                    log.info("Worker started with url " + tabActor.url);
                    var workerId = nextWorkerId_1++;
                    _this.attachWorker(workerActor, tabId, workerId);
                });
                tabActor.onWorkerListChanged(function () { return tabActor.fetchWorkers(); });
                tabActor.fetchWorkers();
            }
        }, function (err) {
            log.error("Failed attaching to tab: " + err);
        });
    };
    FirefoxDebugSession.prototype.attachWorker = function (workerActor, tabId, workerId) {
        var _this = this;
        workerActor.attach().then(function (url) { return workerActor.connect(); }).then(function (threadActor) {
            log.debug("Attached to worker " + workerActor.name);
            var threadId = _this.nextThreadId++;
            var threadAdapter = new index_2.ThreadAdapter(threadId, threadActor, null, "Worker " + tabId + "/" + workerId, _this);
            _this.attachThread(threadActor, threadAdapter);
            threadAdapter.init(_this.exceptionBreakpoints).then(function () {
                _this.threadsById.set(threadId, threadAdapter);
                _this.sendEvent(new vscode_debugadapter_1.ThreadEvent('started', threadId));
                workerActor.onClose(function () {
                    _this.threadsById.delete(threadId);
                    _this.sendEvent(new vscode_debugadapter_1.ThreadEvent('exited', threadId));
                });
            }, function (err) {
                log.error('Failed initializing worker thread');
            });
        }, function (err) {
            log.error("Failed attaching to worker: " + err);
        });
    };
    FirefoxDebugSession.prototype.attachThread = function (threadActor, threadAdapter) {
        var _this = this;
        threadActor.onNewSource(function (sourceActor) {
            pathConversionLog.debug("New source " + sourceActor.url + " in thread " + threadActor.name);
            _this.attachSource(sourceActor, threadAdapter);
        });
        threadActor.onPaused(function (reason) {
            log.info("Thread " + threadActor.name + " paused , reason: " + reason.type);
            var stoppedEvent = new vscode_debugadapter_1.StoppedEvent(reason.type, threadAdapter.id);
            stoppedEvent.body.allThreadsStopped = false;
            _this.sendEvent(stoppedEvent);
        });
        threadActor.onResumed(function () {
            log.info("Thread " + threadActor.name + " resumed unexpectedly");
            _this.sendEvent(new vscode_debugadapter_1.ContinuedEvent(threadAdapter.id));
        });
        threadActor.onExited(function () {
            log.info("Thread " + threadActor.name + " exited");
            _this.threadsById.delete(threadAdapter.id);
            _this.sendEvent(new vscode_debugadapter_1.ThreadEvent('exited', threadAdapter.id));
        });
    };
    FirefoxDebugSession.prototype.attachSource = function (sourceActor, threadAdapter) {
        var _this = this;
        var sourcePath = this.convertFirefoxSourceToPath(sourceActor.source);
        var sourceAdapters = threadAdapter.findSourceAdaptersForPath(sourcePath);
        if (sourceAdapters.length > 0) {
            sourceAdapters.forEach(function (sourceAdapter) { return sourceAdapter.actor = sourceActor; });
        }
        else {
            var sourceId = this.nextSourceId++;
            var sourceAdapter = threadAdapter.createSourceAdapter(sourceId, sourceActor, sourcePath);
            this.sourcesById.set(sourceId, sourceAdapter);
            sourceAdapters.push(sourceAdapter);
        }
        if (this.breakpointsBySourcePath.has(sourcePath)) {
            var breakpointInfos_1 = this.breakpointsBySourcePath.get(sourcePath);
            sourceAdapters.forEach(function (sourceAdapter) {
                var setBreakpointsPromise = threadAdapter.setBreakpoints(breakpointInfos_1, sourceAdapter);
                if (_this.verifiedBreakpointSources.indexOf(sourceActor.url) < 0) {
                    setBreakpointsPromise.then(function (breakpointAdapters) {
                        log.debug('Updating breakpoints');
                        breakpointAdapters.forEach(function (breakpointAdapter) {
                            var breakpoint = new vscode_debugadapter_1.Breakpoint(true, breakpointAdapter.breakpointInfo.actualLine);
                            breakpoint.id = breakpointAdapter.breakpointInfo.id;
                            _this.sendEvent(new vscode_debugadapter_1.BreakpointEvent('update', breakpoint));
                        });
                        _this.verifiedBreakpointSources.push(sourceActor.url);
                    });
                }
            });
        }
    };
    FirefoxDebugSession.prototype.attachConsole = function (consoleActor) {
        var _this = this;
        consoleActor.onConsoleAPICall(function (msg) {
            consoleActorLog.debug("Console API: " + JSON.stringify(msg));
            var category = (msg.level === 'error') ? 'stderr' :
                (msg.level === 'warn') ? 'console' : 'stdout';
            var displayMsg = msg.arguments.join(',') + '\n';
            _this.sendEvent(new vscode_debugadapter_1.OutputEvent(displayMsg, category));
        });
        consoleActor.onPageErrorCall(function (err) {
            consoleActorLog.debug("Page Error: " + JSON.stringify(err));
            if (err.category === 'content javascript') {
                var category = err.exception ? 'stderr' : 'stdout';
                _this.sendEvent(new vscode_debugadapter_1.OutputEvent(err.errorMessage + '\n', category));
            }
        });
        consoleActor.startListeners();
    };
    FirefoxDebugSession.prototype.threadsRequest = function (response) {
        log.debug("Received threadsRequest - replying with " + this.threadsById.size + " threads");
        var responseThreads = [];
        this.threadsById.forEach(function (threadAdapter) {
            responseThreads.push(new vscode_debugadapter_1.Thread(threadAdapter.id, threadAdapter.name));
        });
        response.body = { threads: responseThreads };
        this.sendResponse(response);
    };
    FirefoxDebugSession.prototype.setBreakPointsRequest = function (response, args) {
        var _this = this;
        log.debug("Received setBreakpointsRequest with " + args.breakpoints.length + " breakpoints for " + args.source.path);
        var sourcePath = args.source.path;
        var breakpointInfos = args.breakpoints.map(function (breakpoint) { return {
            id: _this.nextBreakpointId++,
            requestedLine: breakpoint.line,
            condition: breakpoint.condition
        }; });
        this.breakpointsBySourcePath.set(sourcePath, breakpointInfos);
        this.verifiedBreakpointSources = this.verifiedBreakpointSources.filter(function (verifiedSourcePath) { return (verifiedSourcePath !== sourcePath); });
        this.threadsById.forEach(function (threadAdapter) {
            var sourceAdapters = threadAdapter.findSourceAdaptersForPath(sourcePath);
            sourceAdapters.forEach(function (sourceAdapter) {
                log.debug("Found source " + args.source.path + " on tab " + threadAdapter.actorName);
                var setBreakpointsPromise = threadAdapter.setBreakpoints(breakpointInfos, sourceAdapter);
                if (_this.verifiedBreakpointSources.indexOf(sourcePath) < 0) {
                    setBreakpointsPromise.then(function (breakpointAdapters) {
                        response.body = {
                            breakpoints: breakpointAdapters.map(function (breakpointAdapter) {
                                var breakpoint = new vscode_debugadapter_1.Breakpoint(true, breakpointAdapter.breakpointInfo.actualLine);
                                breakpoint.id = breakpointAdapter.breakpointInfo.id;
                                return breakpoint;
                            })
                        };
                        log.debug('Replying to setBreakpointsRequest with actual breakpoints from the first thread with this source');
                        _this.sendResponse(response);
                    }, function (err) {
                        log.error("Failed setBreakpointsRequest: " + err);
                        response.success = false;
                        response.message = String(err);
                        _this.sendResponse(response);
                    });
                    _this.verifiedBreakpointSources.push(sourcePath);
                }
            });
        });
        if (this.verifiedBreakpointSources.indexOf(sourcePath) < 0) {
            log.debug("Replying to setBreakpointsRequest (Source " + args.source.path + " not seen yet)");
            response.body = {
                breakpoints: breakpointInfos.map(function (breakpointInfo) {
                    var breakpoint = new vscode_debugadapter_1.Breakpoint(false, breakpointInfo.requestedLine);
                    breakpoint.id = breakpointInfo.id;
                    return breakpoint;
                })
            };
            this.sendResponse(response);
        }
    };
    FirefoxDebugSession.prototype.setExceptionBreakPointsRequest = function (response, args) {
        var _this = this;
        log.debug("Received setExceptionBreakPointsRequest with filters: " + JSON.stringify(args.filters));
        this.exceptionBreakpoints = index_1.ExceptionBreakpoints.None;
        if (args.filters.indexOf('all') >= 0) {
            this.exceptionBreakpoints = index_1.ExceptionBreakpoints.All;
        }
        else if (args.filters.indexOf('uncaught') >= 0) {
            this.exceptionBreakpoints = index_1.ExceptionBreakpoints.Uncaught;
        }
        this.threadsById.forEach(function (threadAdapter) {
            return threadAdapter.setExceptionBreakpoints(_this.exceptionBreakpoints);
        });
        this.sendResponse(response);
    };
    FirefoxDebugSession.prototype.pauseRequest = function (response, args) {
        var _this = this;
        log.debug('Received pauseRequest');
        var threadId = args.threadId ? args.threadId : 1;
        var threadAdapter = this.threadsById.get(threadId);
        threadAdapter.interrupt().then(function () {
            log.debug('Replying to pauseRequest');
            _this.sendResponse(response);
            var stoppedEvent = new vscode_debugadapter_1.StoppedEvent('interrupt', threadId);
            stoppedEvent.body.allThreadsStopped = false;
            _this.sendEvent(stoppedEvent);
        }, function (err) {
            log.error('Failed pauseRequest: ' + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.continueRequest = function (response, args) {
        var _this = this;
        log.debug('Received continueRequest');
        var threadAdapter = this.threadsById.get(args.threadId);
        threadAdapter.resume().then(function () {
            log.debug('Replying to continueRequest');
            response.body = { allThreadsContinued: false };
            _this.sendResponse(response);
        }, function (err) {
            log.error('Failed continueRequest: ' + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.nextRequest = function (response, args) {
        var _this = this;
        log.debug('Received nextRequest');
        var threadAdapter = this.threadsById.get(args.threadId);
        threadAdapter.stepOver().then(function () {
            log.debug('Replying to nextRequest');
            _this.sendResponse(response);
        }, function (err) {
            log.error('Failed nextRequest: ' + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.stepInRequest = function (response, args) {
        var _this = this;
        log.debug('Received stepInRequest');
        var threadAdapter = this.threadsById.get(args.threadId);
        threadAdapter.stepIn().then(function () {
            log.debug('Replying to stepInRequest');
            _this.sendResponse(response);
        }, function (err) {
            log.error('Failed stepInRequest: ' + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.stepOutRequest = function (response, args) {
        var _this = this;
        log.debug('Received stepOutRequest');
        var threadAdapter = this.threadsById.get(args.threadId);
        threadAdapter.stepOut().then(function () {
            log.debug('Replying to stepOutRequest');
            _this.sendResponse(response);
        }, function (err) {
            log.error('Failed stepOutRequest: ' + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.stackTraceRequest = function (response, args) {
        var _this = this;
        var threadAdapter = this.threadsById.get(args.threadId);
        log.debug("Received stackTraceRequest for " + threadAdapter.actorName);
        threadAdapter.fetchStackFrames(args.startFrame || 0, args.levels || 0).then(function (_a) {
            var frameAdapters = _a[0], totalFrameCount = _a[1];
            log.debug('Replying to stackTraceRequest');
            response.body = {
                stackFrames: frameAdapters.map(function (frameAdapter) { return frameAdapter.getStackframe(); }),
                totalFrames: totalFrameCount
            };
            _this.sendResponse(response);
        }, function (err) {
            log.error("Failed stackTraceRequest: " + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.scopesRequest = function (response, args) {
        log.debug('Received scopesRequest');
        var frameAdapter = this.framesById.get(args.frameId);
        if (frameAdapter === undefined) {
            var err = 'Failed scopesRequest: the requested frame can\'t be found';
            log.error(err);
            response.success = false;
            response.message = err;
            this.sendResponse(response);
            return;
        }
        log.debug('Replying to scopesRequest');
        response.body = { scopes: frameAdapter.scopeAdapters.map(function (scopeAdapter) { return scopeAdapter.getScope(); }) };
        this.sendResponse(response);
    };
    FirefoxDebugSession.prototype.variablesRequest = function (response, args) {
        var _this = this;
        log.debug('Received variablesRequest');
        var variablesProvider = this.variablesProvidersById.get(args.variablesReference);
        if (variablesProvider === undefined) {
            var err = 'Failed variablesRequest: the requested object reference can\'t be found';
            log.error(err);
            response.success = false;
            response.message = err;
            this.sendResponse(response);
            return;
        }
        variablesProvider.threadAdapter.fetchVariables(variablesProvider).then(function (variables) {
            log.debug('Replying to variablesRequest');
            response.body = { variables: variables };
            _this.sendResponse(response);
        }, function (err) {
            log.error("Failed variablesRequest: " + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.evaluateRequest = function (response, args) {
        var _this = this;
        log.debug('Received evaluateRequest');
        var threadAdapter;
        var frameActorName;
        if (args.frameId) {
            var frameAdapter = this.framesById.get(args.frameId);
            threadAdapter = frameAdapter.threadAdapter;
            frameActorName = frameAdapter.frame.actor;
        }
        else {
            threadAdapter = this.threadsById.get(1);
        }
        threadAdapter.evaluate(args.expression, frameActorName, (args.context !== 'watch')).then(function (variable) {
            log.debug('Replying to evaluateRequest');
            response.body = {
                result: variable.value,
                variablesReference: variable.variablesReference
            };
            _this.sendResponse(response);
        }, function (err) {
            log.error("Failed evaluateRequest for \"" + args.expression + "\": " + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.sourceRequest = function (response, args) {
        var _this = this;
        log.debug('Received sourceRequest');
        var sourceAdapter = this.sourcesById.get(args.sourceReference);
        sourceAdapter.actor.fetchSource().then(function (sourceGrip) {
            if (typeof sourceGrip === 'string') {
                response.body = { content: sourceGrip };
                _this.sendResponse(response);
            }
            else {
                var longStringGrip = sourceGrip;
                var longStringActor = _this.getOrCreateLongStringGripActorProxy(longStringGrip);
                longStringActor.fetchContent().then(function (content) {
                    log.debug('Replying to sourceRequest');
                    response.body = { content: content };
                    _this.sendResponse(response);
                }, function (err) {
                    log.error("Failed sourceRequest: " + err);
                    response.success = false;
                    response.message = String(err);
                    _this.sendResponse(response);
                });
            }
        }, function (err) {
            log.error("Failed sourceRequest: " + err);
            response.success = false;
            response.message = String(err);
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.disconnectRequest = function (response, args) {
        var _this = this;
        log.debug('Received disconnectRequest');
        var detachPromises = [];
        this.threadsById.forEach(function (threadAdapter) {
            detachPromises.push(threadAdapter.detach());
        });
        Promise.all(detachPromises).then(function () {
            log.debug('Replying to disconnectRequest');
            _this.disconnect();
            _this.sendResponse(response);
        }, function (err) {
            log.warn("Failed disconnectRequest: " + err);
            _this.disconnect();
            _this.sendResponse(response);
        });
    };
    FirefoxDebugSession.prototype.disconnect = function () {
        var _this = this;
        if (this.firefoxDebugConnection) {
            this.firefoxDebugConnection.disconnect().then(function () {
                if (_this.firefoxProc) {
                    _this.firefoxProc.kill('SIGTERM');
                    _this.firefoxProc = null;
                }
            });
        }
    };
    return FirefoxDebugSession;
}(vscode_debugadapter_1.DebugSession));
exports.FirefoxDebugSession = FirefoxDebugSession;
vscode_debugadapter_1.DebugSession.run(FirefoxDebugSession);
//# sourceMappingURL=firefoxDebugSession.js.map