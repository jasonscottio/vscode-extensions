"use strict";
function concatArrays(arrays) {
    return [].concat.apply([], arrays);
}
exports.concatArrays = concatArrays;
function urlBasename(url) {
    if (!url)
        return null;
    var lastSepIndex = url.lastIndexOf('/');
    if (lastSepIndex < 0) {
        return url;
    }
    else {
        return url.substring(lastSepIndex + 1);
    }
}
exports.urlBasename = urlBasename;
//# sourceMappingURL=misc.js.map