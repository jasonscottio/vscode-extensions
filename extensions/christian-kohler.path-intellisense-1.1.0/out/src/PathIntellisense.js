"use strict";
var vscode_1 = require('vscode');
var text_parser_1 = require('./text-parser');
var fs_functions_1 = require('./fs-functions');
var PathCompletionItem_1 = require('./PathCompletionItem');
var UpCompletionItem_1 = require('./UpCompletionItem');
var PathIntellisense = (function () {
    function PathIntellisense(getChildrenOfPath) {
        this.getChildrenOfPath = getChildrenOfPath;
    }
    PathIntellisense.prototype.provideCompletionItems = function (document, position) {
        var textCurrentLine = document.getText(document.lineAt(position).range);
        var textWithinString = text_parser_1.getTextWithinString(textCurrentLine, position.character);
        var isImport = text_parser_1.isImportOrRequire(textCurrentLine);
        var documentExtension = fs_functions_1.extractExtension(document);
        var mappings = this.getMappings();
        if (!this.shouldProvide(textWithinString, isImport, mappings)) {
            return Promise.resolve([]);
        }
        return this.provide(document.fileName, textWithinString, mappings, isImport, documentExtension);
    };
    PathIntellisense.prototype.shouldProvide = function (textWithinString, isImport, mappings) {
        var typedAnything = textWithinString && textWithinString.length > 0;
        var startsWithDot = typedAnything && textWithinString[0] === '.';
        var startsWithMapping = mappings && mappings.some(function (mapping) { return textWithinString.indexOf(mapping.key) === 0; });
        if (isImport && (startsWithDot || startsWithMapping)) {
            return true;
        }
        if (!isImport && typedAnything) {
            return true;
        }
        return false;
    };
    PathIntellisense.prototype.provide = function (fileName, textWithinString, mappings, isImport, documentExtension) {
        var path = fs_functions_1.getPath(fileName, textWithinString, mappings);
        return this.getChildrenOfPath(path).then(function (children) { return ([
            new UpCompletionItem_1.UpCompletionItem()
        ].concat(children.map(function (child) { return new PathCompletionItem_1.PathCompletionItem(child, isImport, documentExtension); }))); });
    };
    PathIntellisense.prototype.getMappings = function () {
        var mappings = vscode_1.workspace.getConfiguration('path-intellisense')['mappings'];
        return Object.keys(mappings)
            .map(function (key) { return ({ key: key, value: mappings[key] }); })
            .filter(function (mapping) { return !!vscode_1.workspace.rootPath || mapping.value.indexOf('${workspaceRoot}') === -1; })
            .map(function (mapping) { return ({ key: mapping.key, value: mapping.value.replace('${workspaceRoot}', vscode_1.workspace.rootPath) }); });
    };
    return PathIntellisense;
}());
exports.PathIntellisense = PathIntellisense;
//# sourceMappingURL=PathIntellisense.js.map