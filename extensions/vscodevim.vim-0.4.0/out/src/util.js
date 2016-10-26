"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const vscode = require('vscode');
const range_1 = require('./motion/range');
const position_1 = require('./motion/position');
function showInfo(message) {
    return __awaiter(this, void 0, void 0, function* () {
        return vscode.window.showInformationMessage("Vim: " + message);
    });
}
exports.showInfo = showInfo;
function showError(message) {
    return __awaiter(this, void 0, void 0, function* () {
        return vscode.window.showErrorMessage("Vim: " + message);
    });
}
exports.showError = showError;
/**
 * This is certainly quite janky! The problem we're trying to solve
 * is that writing editor.selection = new Position() won't immediately
 * update the position of the cursor. So we have to wait!
 */
function waitForCursorUpdatesToHappen() {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO - dispose!
        yield new Promise((resolve, reject) => {
            setTimeout(resolve, 100);
            vscode.window.onDidChangeTextEditorSelection(x => {
                resolve();
            });
        });
    });
}
exports.waitForCursorUpdatesToHappen = waitForCursorUpdatesToHappen;
function allowVSCodeToPropagateCursorUpdatesAndReturnThem() {
    return __awaiter(this, void 0, void 0, function* () {
        yield waitForCursorUpdatesToHappen();
        return vscode.window.activeTextEditor.selections.map(x => new range_1.Range(position_1.Position.FromVSCodePosition(x.start), position_1.Position.FromVSCodePosition(x.end)));
    });
}
exports.allowVSCodeToPropagateCursorUpdatesAndReturnThem = allowVSCodeToPropagateCursorUpdatesAndReturnThem;
function wait(time) {
    return __awaiter(this, void 0, void 0, function* () {
        yield new Promise((resolve, reject) => {
            setTimeout(resolve, time);
        });
    });
}
exports.wait = wait;
//# sourceMappingURL=util.js.map