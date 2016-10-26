"use strict";
var fs = require('fs');
var NumericLogLevel;
(function (NumericLogLevel) {
    NumericLogLevel[NumericLogLevel["Debug"] = 0] = "Debug";
    NumericLogLevel[NumericLogLevel["Info"] = 1] = "Info";
    NumericLogLevel[NumericLogLevel["Warn"] = 2] = "Warn";
    NumericLogLevel[NumericLogLevel["Error"] = 3] = "Error";
})(NumericLogLevel || (NumericLogLevel = {}));
var Log = (function () {
    function Log(name) {
        this.name = name;
        this.configure();
        Log.logs.set(name, this);
    }
    Object.defineProperty(Log, "config", {
        set: function (newConfig) {
            if (Log.fileDescriptor !== undefined) {
                fs.closeSync(Log.fileDescriptor);
                Log.fileDescriptor = undefined;
            }
            Log._config = newConfig;
            if (Log._config.fileName) {
                try {
                    Log.fileDescriptor = fs.openSync(Log._config.fileName, 'w');
                }
                catch (e) { }
            }
            Log.logs.forEach(function (log) { return log.configure(); });
        },
        enumerable: true,
        configurable: true
    });
    Log.create = function (name) {
        return new Log(name);
    };
    Log.prototype.debug = function (msg) {
        this.log(msg, NumericLogLevel.Debug, 'DEBUG');
    };
    Log.prototype.info = function (msg) {
        this.log(msg, NumericLogLevel.Info, 'INFO ');
    };
    Log.prototype.warn = function (msg) {
        this.log(msg, NumericLogLevel.Warn, 'WARN ');
    };
    Log.prototype.error = function (msg) {
        this.log(msg, NumericLogLevel.Error, 'ERROR');
    };
    Log.prototype.configure = function () {
        this.fileLevel = undefined;
        if (Log._config.fileName && Log._config.fileLevel) {
            this.fileLevel = this.convertLogLevel(Log._config.fileLevel[this.name]);
            if (this.fileLevel === undefined) {
                this.fileLevel = this.convertLogLevel(Log._config.fileLevel['default']);
            }
        }
        if (Log._config.consoleLevel) {
            this.consoleLevel = this.convertLogLevel(Log._config.consoleLevel[this.name]);
            if (this.consoleLevel === undefined) {
                this.consoleLevel = this.convertLogLevel(Log._config.consoleLevel['default']);
            }
        }
        this.minLevel = this.fileLevel;
        if ((this.consoleLevel !== undefined) && !(this.consoleLevel >= this.minLevel)) {
            this.minLevel = this.consoleLevel;
        }
    };
    Log.prototype.convertLogLevel = function (logLevel) {
        if (!logLevel) {
            return undefined;
        }
        switch (logLevel) {
            case 'Debug':
                return NumericLogLevel.Debug;
            case 'Info':
                return NumericLogLevel.Info;
            case 'Warn':
                return NumericLogLevel.Warn;
            case 'Error':
                return NumericLogLevel.Error;
        }
    };
    Log.prototype.log = function (msg, level, displayLevel) {
        if (level >= this.minLevel) {
            var elapsedTime = (Date.now() - Log.startTime) / 1000;
            var elapsedTimeString = elapsedTime.toFixed(3);
            while (elapsedTimeString.length < 7) {
                elapsedTimeString = '0' + elapsedTimeString;
            }
            var logMsg = displayLevel + '|' + elapsedTimeString + '|' + this.name + ': ' + msg;
            if ((Log.fileDescriptor !== undefined) && (level >= this.fileLevel)) {
                fs.write(Log.fileDescriptor, logMsg + '\n');
            }
            if (level >= this.consoleLevel) {
                Log.consoleLog(logMsg);
            }
        }
    };
    Log.startTime = Date.now();
    Log._config = {};
    Log.logs = new Map();
    Log.consoleLog = console.log;
    return Log;
}());
exports.Log = Log;
//# sourceMappingURL=log.js.map