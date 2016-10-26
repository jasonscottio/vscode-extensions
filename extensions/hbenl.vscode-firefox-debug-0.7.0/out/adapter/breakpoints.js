"use strict";
var log_1 = require('../util/log');
var index_1 = require('../adapter/index');
var log = log_1.Log.create('BreakpointsAdapter');
var BreakpointsAdapter = (function () {
    function BreakpointsAdapter() {
    }
    BreakpointsAdapter.setBreakpointsOnSourceActor = function (breakpointsToSet, sourceAdapter, threadCoordinator) {
        var _this = this;
        return threadCoordinator.runOnPausedThread(function (finished) {
            return _this.setBreakpointsOnPausedSourceActor(breakpointsToSet, sourceAdapter, finished);
        }, false);
    };
    BreakpointsAdapter.setBreakpointsOnPausedSourceActor = function (origBreakpointsToSet, sourceAdapter, finished) {
        // we will modify this array, so we make a (shallow) copy and work with that
        var breakpointsToSet = origBreakpointsToSet.slice();
        log.debug("Setting " + breakpointsToSet.length + " breakpoints for " + sourceAdapter.actor.url);
        var result = new Promise(function (resolve, reject) {
            sourceAdapter.currentBreakpoints.then(function (oldBreakpoints) {
                log.debug(oldBreakpoints.length + " breakpoints were previously set for " + sourceAdapter.actor.url);
                var newBreakpoints = [];
                var breakpointsBeingRemoved = [];
                var breakpointsBeingSet = [];
                oldBreakpoints.forEach(function (breakpointAdapter) {
                    var breakpointIndex = -1;
                    for (var i = 0; i < breakpointsToSet.length; i++) {
                        if ((breakpointsToSet[i] !== undefined) &&
                            (breakpointsToSet[i].requestedLine === breakpointAdapter.breakpointInfo.requestedLine)) {
                            breakpointIndex = i;
                            break;
                        }
                    }
                    if (breakpointIndex >= 0) {
                        newBreakpoints[breakpointIndex] = breakpointAdapter;
                        breakpointsToSet[breakpointIndex] = undefined;
                    }
                    else {
                        breakpointsBeingRemoved.push(breakpointAdapter.actor.delete().catch(function (err) {
                            log.error("Failed removing breakpoint: " + err);
                        }));
                    }
                });
                breakpointsToSet.map(function (requestedBreakpoint, index) {
                    if (requestedBreakpoint !== undefined) {
                        breakpointsBeingSet.push(sourceAdapter.actor.setBreakpoint({ line: requestedBreakpoint.requestedLine }, requestedBreakpoint.condition).then(function (setBreakpointResult) {
                            requestedBreakpoint.actualLine =
                                (setBreakpointResult.actualLocation === undefined) ?
                                    requestedBreakpoint.requestedLine :
                                    setBreakpointResult.actualLocation.line;
                            newBreakpoints[index] = new index_1.BreakpointAdapter(requestedBreakpoint, setBreakpointResult.breakpointActor);
                        }, function (err) {
                            log.error("Failed setting breakpoint: " + err);
                        }));
                    }
                });
                log.debug("Adding " + breakpointsBeingSet.length + " and removing " + breakpointsBeingRemoved.length + " breakpoints");
                Promise.all(breakpointsBeingRemoved).then(function () {
                    return Promise.all(breakpointsBeingSet);
                }).then(function () {
                    resolve(newBreakpoints);
                    finished();
                });
            }, function (err) {
                finished();
                throw err;
            });
        });
        sourceAdapter.currentBreakpoints = result;
        return result;
    };
    return BreakpointsAdapter;
}());
exports.BreakpointsAdapter = BreakpointsAdapter;
var BreakpointInfo = (function () {
    function BreakpointInfo() {
    }
    return BreakpointInfo;
}());
exports.BreakpointInfo = BreakpointInfo;
//# sourceMappingURL=breakpoints.js.map