"use strict";
var SourceAdapter = (function () {
    function SourceAdapter(id, actor, sourcePath) {
        this.id = id;
        this.actor = actor;
        this.sourcePath = sourcePath;
        this.currentBreakpoints = Promise.resolve([]);
    }
    return SourceAdapter;
}());
exports.SourceAdapter = SourceAdapter;
var BreakpointAdapter = (function () {
    function BreakpointAdapter(requestedBreakpoint, actor) {
        this.breakpointInfo = requestedBreakpoint;
        this.actor = actor;
    }
    return BreakpointAdapter;
}());
exports.BreakpointAdapter = BreakpointAdapter;
//# sourceMappingURL=misc.js.map