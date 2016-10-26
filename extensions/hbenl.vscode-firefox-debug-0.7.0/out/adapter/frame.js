"use strict";
var log_1 = require('../util/log');
var misc_1 = require('../util/misc');
var index_1 = require('../adapter/index');
var vscode_debugadapter_1 = require('vscode-debugadapter');
var misc_2 = require('../util/misc');
var log = log_1.Log.create('FrameAdapter');
var actorIdRegex = /[0-9]+$/;
var FrameAdapter = (function () {
    function FrameAdapter(frame, threadAdapter) {
        this.frame = frame;
        this.threadAdapter = threadAdapter;
        this.threadAdapter.debugSession.registerFrameAdapter(this);
        var environmentAdapter = index_1.EnvironmentAdapter.from(this.frame.environment);
        this.scopeAdapters = environmentAdapter.getScopeAdapters(this.threadAdapter);
        this.scopeAdapters[0].addThis(this.frame.this);
    }
    FrameAdapter.prototype.getStackframe = function () {
        var firefoxSource = this.frame.where.source;
        var sourceActorName = firefoxSource.actor;
        var sourcePath = null;
        var sourceName = '';
        if (firefoxSource.url != null) {
            sourcePath = this.threadAdapter.debugSession.convertFirefoxSourceToPath(firefoxSource);
            sourceName = misc_2.urlBasename(firefoxSource.url);
        }
        if (this.frame.type === 'eval') {
            var match = actorIdRegex.exec(sourceActorName);
            if (match) {
                sourceName = "eval " + match[0];
            }
        }
        var sourceAdapter = this.threadAdapter.findSourceAdapterForActorName(sourceActorName);
        var source = new vscode_debugadapter_1.Source(sourceName, sourcePath, sourceAdapter.id);
        var name;
        switch (this.frame.type) {
            case 'call':
                var callee = this.frame.callee;
                if ((typeof callee === 'object') && (callee.type === 'object') &&
                    (callee.class === 'Function')) {
                    var calleeName = callee.name;
                    name = (calleeName !== undefined) ? calleeName : '[anonymous function]';
                }
                else {
                    log.error("Unexpected callee in call frame: " + JSON.stringify(callee));
                    name = '[unknown]';
                }
                break;
            case 'global':
                name = '[Global]';
                break;
            case 'eval':
            case 'clientEvaluate':
                name = '[eval]';
                break;
            default:
                name = "[" + this.frame.type + "]";
                log.error("Unexpected frame type " + this.frame.type);
                break;
        }
        return new vscode_debugadapter_1.StackFrame(this.id, name, source, this.frame.where.line, this.frame.where.column);
    };
    FrameAdapter.prototype.getObjectGripAdapters = function () {
        return misc_1.concatArrays(this.scopeAdapters.map(function (scopeAdapter) { return scopeAdapter.getObjectGripAdapters(); }));
    };
    FrameAdapter.prototype.dispose = function () {
        this.threadAdapter.debugSession.unregisterFrameAdapter(this);
    };
    return FrameAdapter;
}());
exports.FrameAdapter = FrameAdapter;
//# sourceMappingURL=frame.js.map