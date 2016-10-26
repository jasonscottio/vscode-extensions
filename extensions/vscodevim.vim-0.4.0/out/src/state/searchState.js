"use strict";
const vscode = require('vscode');
const position_1 = require('./../motion/position');
const textEditor_1 = require('./../textEditor');
const configuration_1 = require('../../src/configuration/configuration');
(function (SearchDirection) {
    SearchDirection[SearchDirection["Forward"] = 1] = "Forward";
    SearchDirection[SearchDirection["Backward"] = -1] = "Backward";
})(exports.SearchDirection || (exports.SearchDirection = {}));
var SearchDirection = exports.SearchDirection;
/**
 * State involved with beginning a search (/).
 */
class SearchState {
    constructor(direction, startPosition, searchString = "", { isRegex = false } = {}) {
        this._matchRanges = [];
        this._searchDirection = SearchDirection.Forward;
        this._searchString = "";
        this._searchDirection = direction;
        this._searchCursorStartPosition = startPosition;
        this.searchString = searchString;
        this.isRegex = isRegex;
    }
    /**
     * Every range in the document that matches the search string.
     */
    get matchRanges() {
        return this._matchRanges;
    }
    get searchCursorStartPosition() {
        return this._searchCursorStartPosition;
    }
    get searchString() {
        return this._searchString;
    }
    set searchString(search) {
        if (this._searchString !== search) {
            this._searchString = search;
            this._recalculateSearchRanges({ forceRecalc: true });
        }
    }
    _recalculateSearchRanges({ forceRecalc } = {}) {
        const search = this.searchString;
        if (search === "") {
            return;
        }
        if (this._matchesDocVersion !== textEditor_1.TextEditor.getDocumentVersion() || forceRecalc) {
            // Calculate and store all matching ranges
            this._matchesDocVersion = textEditor_1.TextEditor.getDocumentVersion();
            this._matchRanges = [];
            /*
             * Decide whether the search is case sensitive.
             * If ignorecase is false, the search is case sensitive.
             * If ignorecase is true, the search should be case insensitive.
             * If both ignorecase and smartcase are true, the search is case sensitive only when the search string contains UpperCase character.
             */
            let ignorecase = configuration_1.Configuration.getInstance().ignorecase;
            if (ignorecase && configuration_1.Configuration.getInstance().smartcase && /[A-Z]/.test(search)) {
                ignorecase = false;
            }
            let searchRE = search;
            if (!this.isRegex) {
                searchRE = search.replace(SearchState.specialCharactersRegex, "\\$&");
            }
            const regexFlags = ignorecase ? 'gi' : 'g';
            let regex;
            try {
                regex = new RegExp(searchRE, regexFlags);
            }
            catch (err) {
                // Couldn't compile the regexp, try again with special characters escaped
                searchRE = search.replace(SearchState.specialCharactersRegex, "\\$&");
                regex = new RegExp(searchRE, regexFlags);
            }
            outer: for (let lineIdx = 0; lineIdx < textEditor_1.TextEditor.getLineCount(); lineIdx++) {
                const line = textEditor_1.TextEditor.getLineAt(new position_1.Position(lineIdx, 0)).text;
                let result = regex.exec(line);
                while (result) {
                    if (this._matchRanges.length >= SearchState.MAX_SEARCH_RANGES) {
                        break outer;
                    }
                    this.matchRanges.push(new vscode.Range(new position_1.Position(lineIdx, result.index), new position_1.Position(lineIdx, result.index + result[0].length)));
                    if (result.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }
                    result = regex.exec(line);
                }
            }
        }
    }
    /**
     * The position of the next search, or undefined if there is no match.
     *
     * Pass in -1 as direction to reverse the direction we search.
     */
    getNextSearchMatchPosition(startPosition, direction = 1) {
        this._recalculateSearchRanges();
        if (this._matchRanges.length === 0) {
            // TODO(bell)
            return { pos: startPosition, match: false };
        }
        const effectiveDirection = direction * this._searchDirection;
        if (effectiveDirection === SearchDirection.Forward) {
            for (let matchRange of this._matchRanges) {
                if (matchRange.start.compareTo(startPosition) > 0) {
                    return { pos: position_1.Position.FromVSCodePosition(matchRange.start), match: true };
                }
            }
            // Wrap around
            // TODO(bell)
            return { pos: position_1.Position.FromVSCodePosition(this._matchRanges[0].start), match: true };
        }
        else {
            for (let matchRange of this._matchRanges.slice(0).reverse()) {
                if (matchRange.start.compareTo(startPosition) < 0) {
                    return { pos: position_1.Position.FromVSCodePosition(matchRange.start), match: true };
                }
            }
            // TODO(bell)
            return {
                pos: position_1.Position.FromVSCodePosition(this._matchRanges[this._matchRanges.length - 1].start),
                match: true
            };
        }
    }
}
SearchState.MAX_SEARCH_RANGES = 1000;
SearchState.specialCharactersRegex = /[\-\[\]{}()*+?.,\\\^$|#\s]/g;
exports.SearchState = SearchState;
//# sourceMappingURL=searchState.js.map