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
const _ = require('lodash');
const extension_1 = require('./../../extension');
const transformations_1 = require('./../transformations/transformations');
const mode_1 = require('./mode');
const remapper_1 = require('./remapper');
const modeNormal_1 = require('./modeNormal');
const modeInsert_1 = require('./modeInsert');
const modeVisualBlock_1 = require('./modeVisualBlock');
const modeInsertVisualBlock_1 = require('./modeInsertVisualBlock');
const modeVisual_1 = require('./modeVisual');
const taskQueue_1 = require('./../taskQueue');
const modeReplace_1 = require('./modeReplace');
const modeSearchInProgress_1 = require('./modeSearchInProgress');
const textEditor_1 = require('./../textEditor');
const modeVisualLine_1 = require('./modeVisualLine');
const historyTracker_1 = require('./../history/historyTracker');
const actions_1 = require('./../actions/actions');
const position_1 = require('./../motion/position');
const range_1 = require('./../motion/range');
const register_1 = require('./../register/register');
const main_1 = require('../../src/cmd_line/main');
const configuration_1 = require('../../src/configuration/configuration');
const matcher_1 = require('./../matching/matcher');
const globals_1 = require('../../src/globals');
const util_1 = require('./../util');
class ViewChange {
}
exports.ViewChange = ViewChange;
/**
 * The VimState class holds permanent state that carries over from action
 * to action.
 *
 * Actions defined in actions.ts are only allowed to mutate a VimState in order to
 * indicate what they want to do.
 */
class VimState {
    constructor() {
        this._id = Math.floor(Math.random() * 10000) % 10000;
        /**
         * The column the cursor wants to be at, or Number.POSITIVE_INFINITY if it should always
         * be the rightmost column.
         *
         * Example: If you go to the end of a 20 character column, this value
         * will be 20, even if you press j and the next column is only 5 characters.
         * This is because if the third column is 25 characters, the cursor will go
         * back to the 20th column.
         */
        this.desiredColumn = 0;
        /**
         * Are multiple cursors currently present?
         */
        this.isMultiCursor = false;
        this.lastMovementFailed = false;
        /**
         * The keystroke sequence that made up our last complete action (that can be
         * repeated with '.').
         */
        this.previousFullAction = undefined;
        this.alteredHistory = false;
        this.isRunningDotCommand = false;
        this.focusChanged = false;
        /**
         * Every time we invoke a VS Code command which might trigger Code's view update,
         * we should postpone its view updating phase to avoid conflicting with our internal view updating mechanism.
         * This array is used to cache every VS Code view updating event and they will be triggered once we run the inhouse `viewUpdate`.
         */
        this.postponedCodeViewChanges = [];
        /**
         * Used to prevent non-recursive remappings from looping.
         */
        this.isCurrentlyPreformingRemapping = false;
        /**
         * The current full action we are building up.
         */
        this.currentFullAction = [];
        /**
         * In Multi Cursor Mode, the position of every cursor.
         */
        this._allCursors = [new range_1.Range(new position_1.Position(0, 0), new position_1.Position(0, 0))];
        this.cursorPositionJustBeforeAnythingHappened = [new position_1.Position(0, 0)];
        this.searchState = undefined;
        this.searchStatePrevious = undefined;
        this.isRecordingMacro = false;
        this.replaceState = undefined;
        /**
         * The mode Vim will be in once this action finishes.
         */
        this._currentMode = mode_1.ModeName.Normal;
        this.currentRegisterMode = register_1.RegisterMode.FigureItOutFromCurrentMode;
        this.registerName = '"';
        this.commandInitialText = "";
        this.recordedState = new RecordedState();
        this.recordedMacro = new RecordedState();
    }
    get id() { return this._id; }
    /**
     * The position the cursor will be when this action finishes.
     */
    get cursorPosition() {
        return this.allCursors[0].stop;
    }
    set cursorPosition(value) {
        this.allCursors[0] = this.allCursors[0].withNewStop(value);
    }
    /**
     * The effective starting position of the movement, used along with cursorPosition to determine
     * the range over which to run an Operator. May rarely be different than where the cursor
     * actually starts e.g. if you use the "aw" text motion in the middle of a word.
     */
    get cursorStartPosition() {
        return this.allCursors[0].start;
    }
    set cursorStartPosition(value) {
        this.allCursors[0] = this.allCursors[0].withNewStart(value);
    }
    get allCursors() {
        return this._allCursors;
    }
    set allCursors(value) {
        for (const cursor of value) {
            if (!cursor.start.isValid() || !cursor.stop.isValid()) {
                console.log("invalid value for set cursor position. This is probably bad?");
            }
        }
        this._allCursors = value;
        this.isMultiCursor = this._allCursors.length > 1;
    }
    get currentMode() {
        return this._currentMode;
    }
    set currentMode(value) {
        this._currentMode = value;
    }
    getModeObject(modeHandler) {
        return modeHandler.modeList.find(mode => mode.isActive);
    }
    effectiveRegisterMode() {
        if (this.currentRegisterMode === register_1.RegisterMode.FigureItOutFromCurrentMode) {
            if (this.currentMode === mode_1.ModeName.VisualLine) {
                return register_1.RegisterMode.LineWise;
            }
            else if (this.currentMode === mode_1.ModeName.VisualBlock || this.currentMode === mode_1.ModeName.VisualBlockInsertMode) {
                return register_1.RegisterMode.BlockWise;
            }
            else {
                return register_1.RegisterMode.CharacterWise;
            }
        }
        else {
            return this.currentRegisterMode;
        }
    }
    /**
     * The top left of a selected block of text. Useful for Visual Block mode.
     */
    get topLeft() {
        return modeVisualBlock_1.VisualBlockMode.getTopLeftPosition(this.cursorStartPosition, this.cursorPosition);
    }
    /**
     * The bottom right of a selected block of text. Useful for Visual Block mode.
     */
    get bottomRight() {
        return modeVisualBlock_1.VisualBlockMode.getBottomRightPosition(this.cursorStartPosition, this.cursorPosition);
    }
}
/**
 * Tracks movements that can be repeated with ; and , (namely t, T, f, and F).
 */
VimState.lastRepeatableMovement = undefined;
exports.VimState = VimState;
/**
 * The RecordedState class holds the current action that the user is
 * doing. Example: Imagine that the user types:
 *
 * 5"qdw
 *
 * Then the relevent state would be
 *   * count of 5
 *   * copy into q register
 *   * delete operator
 *   * word movement
 *
 *
 * Or imagine the user types:
 *
 * vw$}}d
 *
 * Then the state would be
 *   * Visual mode action
 *   * (a list of all the motions you ran)
 *   * delete operator
 */
class RecordedState {
    constructor() {
        /**
         * Keeps track of keys pressed for the next action. Comes in handy when parsing
         * multiple length movements, e.g. gg.
         */
        this.actionKeys = [];
        /**
         * Every action that has been run.
         */
        this.actionsRun = [];
        this.hasRunOperator = false;
        this.isInsertion = false;
        /**
         * If we're in Visual Block mode, the way in which we're inserting characters (either inserting
         * at the beginning or appending at the end).
         */
        this.visualBlockInsertionType = modeVisualBlock_1.VisualBlockInsertionType.Insert;
        /**
         * The text transformations that we want to run. They will all be run after the action has been processed.
         *
         * Running an individual action will generally queue up to one of these, but if you're in
         * multi-cursor mode, you'll queue one per cursor, or more.
         *
         * Note that the text transformations are run in parallel. This is useful in most cases,
         * but will get you in trouble in others.
         */
        this.transformations = [];
        /**
         * The number of times the user wants to repeat this action.
         */
        this.count = 0;
        const useClipboard = configuration_1.Configuration.getInstance().useSystemClipboard;
        this.registerName = useClipboard ? '*' : '"';
    }
    /**
     * The operator (e.g. d, y, >) the user wants to run, if there is one.
     */
    get operator() {
        const list = _.filter(this.actionsRun, a => a instanceof actions_1.BaseOperator);
        if (list.length > 1) {
            throw "Too many operators!";
        }
        return list[0];
    }
    /**
     * The command (e.g. i, ., R, /) the user wants to run, if there is one.
     */
    get command() {
        const list = _.filter(this.actionsRun, a => a instanceof actions_1.BaseCommand);
        // TODO - disregard <Esc>, then assert this is of length 1.
        return list[0];
    }
    get hasRunAMovement() {
        return _.filter(this.actionsRun, a => a.isMotion).length > 0;
    }
    clone() {
        const res = new RecordedState();
        // TODO: Actual clone.
        res.actionKeys = this.actionKeys.slice(0);
        res.actionsRun = this.actionsRun.slice(0);
        res.hasRunOperator = this.hasRunOperator;
        return res;
    }
    operatorReadyToExecute(mode) {
        // Visual modes do not require a motion -- they ARE the motion.
        return this.operator &&
            !this.hasRunOperator &&
            mode !== mode_1.ModeName.SearchInProgressMode &&
            (this.hasRunAMovement || (mode === mode_1.ModeName.Visual ||
                mode === mode_1.ModeName.VisualLine));
    }
    get isInInitialState() {
        return this.operator === undefined &&
            this.actionsRun.length === 0 &&
            this.count === 1;
    }
    toString() {
        let res = "";
        for (const action of this.actionsRun) {
            res += action.toString();
        }
        return res;
    }
}
exports.RecordedState = RecordedState;
class ModeHandler {
    /**
     * isTesting speeds up tests drastically by turning off our checks for
     * mouse events.
     */
    constructor(filename = "") {
        this._toBeDisposed = [];
        this._caretDecoration = vscode.window.createTextEditorDecorationType({
            dark: {
                // used for dark colored themes
                backgroundColor: 'rgba(224, 224, 224, 0.4)',
                borderColor: 'rgba(224, 224, 224, 0.4)'
            },
            light: {
                // used for light colored themes
                backgroundColor: 'rgba(32, 32, 32, 0.4)',
                borderColor: 'rgba(32, 32, 32, 0.4)'
            },
            borderStyle: 'solid',
            borderWidth: '1px'
        });
        ModeHandler.IsTesting = globals_1.Globals.isTesting;
        this.fileName = filename;
        this._vimState = new VimState();
        this._insertModeRemapper = new remapper_1.InsertModeRemapper(true);
        this._otherModesRemapper = new remapper_1.OtherModesRemapper(true);
        this._insertModeNonRecursive = new remapper_1.InsertModeRemapper(false);
        this._otherModesNonRecursive = new remapper_1.OtherModesRemapper(false);
        this._modes = [
            new modeNormal_1.NormalMode(this),
            new modeInsert_1.InsertMode(),
            new modeVisual_1.VisualMode(),
            new modeVisualBlock_1.VisualBlockMode(),
            new modeInsertVisualBlock_1.InsertVisualBlockMode(),
            new modeVisualLine_1.VisualLineMode(),
            new modeSearchInProgress_1.SearchInProgressMode(),
            new modeReplace_1.ReplaceMode(),
        ];
        this.vimState.historyTracker = new historyTracker_1.HistoryTracker();
        this._vimState.currentMode = mode_1.ModeName.Normal;
        this.setCurrentModeByName(this._vimState);
        // Sometimes, Visual Studio Code will start the cursor in a position which
        // is not (0, 0) - e.g., if you previously edited the file and left the cursor
        // somewhere else when you closed it. This will set our cursor's position to the position
        // that VSC set it to.
        if (vscode.window.activeTextEditor) {
            this._vimState.cursorStartPosition = position_1.Position.FromVSCodePosition(vscode.window.activeTextEditor.selection.start);
            this._vimState.cursorPosition = position_1.Position.FromVSCodePosition(vscode.window.activeTextEditor.selection.start);
            this._vimState.whatILastSetTheSelectionTo = vscode.window.activeTextEditor.selection;
        }
        // Handle scenarios where mouse used to change current position.
        const disposer = vscode.window.onDidChangeTextEditorSelection((e) => {
            taskQueue_1.taskQueue.enqueueTask({
                promise: () => this.handleSelectionChange(e),
                isRunning: false,
            });
        });
        this._toBeDisposed.push(disposer);
    }
    get vimState() {
        return this._vimState;
    }
    get currentModeName() {
        return this.currentMode.name;
    }
    get modeList() {
        return this._modes;
    }
    /**
     * Anyone who wants to change the behavior of this method should make sure all selection related test cases pass.
     * Follow this spec https://gist.github.com/rebornix/d21d1cc060c009d4430d3904030bd4c1 to perform the manual testing.
     */
    handleSelectionChange(e) {
        return __awaiter(this, void 0, void 0, function* () {
            let selection = e.selections[0];
            if (ModeHandler.IsTesting) {
                return;
            }
            if (e.textEditor.document.fileName !== this.fileName) {
                return;
            }
            if (this._vimState.focusChanged) {
                this._vimState.focusChanged = false;
                return;
            }
            if (this.currentModeName === mode_1.ModeName.VisualBlock ||
                this.currentModeName === mode_1.ModeName.VisualBlockInsertMode) {
                // AArrgghhhh - johnfn
                return;
            }
            if (this.vimState.isMultiCursor) {
                // AAAAAARGGHHHHH - johnfn
                return;
            }
            /**
             * We only trigger our view updating process if it's a mouse selection.
             * Otherwise we only update our internal cursor postions accordingly.
             */
            if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
                if (selection) {
                    if (this._vimState.getModeObject(this).isVisualMode) {
                        /**
                         * In Visual Mode, our `cursorPosition` and `cursorStartPosition` can not refect `active`,
                         * `start`, `end` and `anchor` information in a selection.
                         * See `Fake block cursor with text decoration` section of `updateView` method.
                         */
                        return;
                    }
                    this._vimState.cursorPosition = position_1.Position.FromVSCodePosition(selection.active);
                    this._vimState.cursorStartPosition = position_1.Position.FromVSCodePosition(selection.start);
                    this._vimState.desiredColumn = this._vimState.cursorPosition.character;
                }
                return;
            }
            if (this._vimState.isMultiCursor && e.selections.length === 1) {
                this._vimState.isMultiCursor = false;
            }
            if (this._vimState.isMultiCursor) {
                return;
            }
            // See comment about whatILastSetTheSelectionTo.
            if (this._vimState.whatILastSetTheSelectionTo.isEqual(selection)) {
                return;
            }
            if (this._vimState.currentMode === mode_1.ModeName.SearchInProgressMode ||
                this._vimState.currentMode === mode_1.ModeName.VisualBlockInsertMode) {
                return;
            }
            if (selection) {
                let newPosition = new position_1.Position(selection.active.line, selection.active.character);
                if (newPosition.character >= newPosition.getLineEnd().character) {
                    if (this._vimState.currentMode !== mode_1.ModeName.Insert) {
                        // This prevents you from mouse clicking past the EOL
                        newPosition = new position_1.Position(newPosition.line, Math.max(newPosition.getLineEnd().character - 1, 0));
                    }
                }
                this._vimState.cursorPosition = newPosition;
                this._vimState.cursorStartPosition = newPosition;
                this._vimState.desiredColumn = newPosition.character;
                // start visual mode?
                if (!selection.anchor.isEqual(selection.active)) {
                    var selectionStart = new position_1.Position(selection.anchor.line, selection.anchor.character);
                    if (selectionStart.character > selectionStart.getLineEnd().character) {
                        selectionStart = new position_1.Position(selectionStart.line, selectionStart.getLineEnd().character);
                    }
                    this._vimState.cursorStartPosition = selectionStart;
                    if (selectionStart.compareTo(newPosition) > 0) {
                        this._vimState.cursorStartPosition = this._vimState.cursorStartPosition.getLeft();
                    }
                    if (!this._vimState.getModeObject(this).isVisualMode &&
                        this._vimState.getModeObject(this).name !== mode_1.ModeName.Insert) {
                        this._vimState.currentMode = mode_1.ModeName.Visual;
                        this.setCurrentModeByName(this._vimState);
                        // double click mouse selection causes an extra character to be selected so take one less character
                        this._vimState.cursorPosition = this._vimState.cursorPosition.getLeft();
                    }
                }
                else {
                    if (this._vimState.currentMode !== mode_1.ModeName.Insert) {
                        this._vimState.currentMode = mode_1.ModeName.Normal;
                        this.setCurrentModeByName(this._vimState);
                    }
                }
                yield this.updateView(this._vimState, { drawSelection: false, revealRange: true });
            }
        });
    }
    /**
     * The active mode.
     */
    get currentMode() {
        return this._modes.find(mode => mode.isActive);
    }
    setCurrentModeByName(vimState) {
        let activeMode;
        this._vimState.currentMode = vimState.currentMode;
        for (let mode of this._modes) {
            if (mode.name === vimState.currentMode) {
                activeMode = mode;
            }
            mode.isActive = (mode.name === vimState.currentMode);
        }
    }
    handleKeyEvent(key) {
        return __awaiter(this, void 0, void 0, function* () {
            this._vimState.cursorPositionJustBeforeAnythingHappened = this._vimState.allCursors.map(x => x.stop);
            try {
                let handled = false;
                if (!this._vimState.isCurrentlyPreformingRemapping) {
                    // Non-recursive remapping do not allow for further mappings
                    handled = handled || (yield this._insertModeRemapper.sendKey(key, this, this.vimState));
                    handled = handled || (yield this._otherModesRemapper.sendKey(key, this, this.vimState));
                    handled = handled || (yield this._insertModeNonRecursive.sendKey(key, this, this.vimState));
                    handled = handled || (yield this._otherModesNonRecursive.sendKey(key, this, this.vimState));
                }
                if (!handled) {
                    this._vimState = yield this.handleKeyEventHelper(key, this._vimState);
                }
            }
            catch (e) {
                console.log('error.stack');
                console.log(e);
                console.log(e.stack);
            }
            if (this._vimState.focusChanged) {
                yield extension_1.getAndUpdateModeHandler();
            }
            return true;
        });
    }
    handleKeyEventHelper(key, vimState) {
        return __awaiter(this, void 0, void 0, function* () {
            // Catch any text change not triggered by us (example: tab completion).
            vimState.historyTracker.addChange(this._vimState.cursorPositionJustBeforeAnythingHappened);
            let recordedState = vimState.recordedState;
            recordedState.actionKeys.push(key);
            vimState.currentFullAction.push(key);
            let result = actions_1.Actions.getRelevantAction(recordedState.actionKeys, vimState);
            if (result === actions_1.KeypressState.NoPossibleMatch) {
                vimState.recordedState = new RecordedState();
                return vimState;
            }
            else if (result === actions_1.KeypressState.WaitingOnKeys) {
                return vimState;
            }
            let action = result;
            let actionToRecord = action;
            if (recordedState.actionsRun.length === 0) {
                recordedState.actionsRun.push(action);
            }
            else {
                let lastAction = recordedState.actionsRun[recordedState.actionsRun.length - 1];
                if (lastAction instanceof actions_1.DocumentContentChangeAction) {
                    lastAction.keysPressed.push(key);
                    if (action instanceof actions_1.CommandInsertInInsertMode || action instanceof actions_1.CommandInsertPreviousText) {
                        // delay the macro recording
                        actionToRecord = undefined;
                    }
                    else {
                        // Push real document content change to the stack
                        lastAction.contentChanges = lastAction.contentChanges.concat(vimState.historyTracker.currentContentChanges);
                        vimState.historyTracker.currentContentChanges = [];
                        recordedState.actionsRun.push(action);
                    }
                }
                else {
                    if (action instanceof actions_1.CommandInsertInInsertMode || action instanceof actions_1.CommandInsertPreviousText) {
                        // This means we are already in Insert Mode but there is still not DocumentContentChangeAction in stack
                        vimState.historyTracker.currentContentChanges = [];
                        let newContentChange = new actions_1.DocumentContentChangeAction();
                        newContentChange.keysPressed.push(key);
                        recordedState.actionsRun.push(newContentChange);
                        actionToRecord = newContentChange;
                    }
                    else {
                        recordedState.actionsRun.push(action);
                    }
                }
            }
            if (vimState.isRecordingMacro && actionToRecord && !(actionToRecord instanceof actions_1.CommandQuitRecordMacro)) {
                vimState.recordedMacro.actionsRun.push(actionToRecord);
            }
            vimState = yield this.runAction(vimState, recordedState, action);
            if (vimState.currentMode === mode_1.ModeName.Insert) {
                recordedState.isInsertion = true;
            }
            // Update view
            yield this.updateView(vimState);
            return vimState;
        });
    }
    runAction(vimState, recordedState, action) {
        return __awaiter(this, void 0, void 0, function* () {
            let ranRepeatableAction = false;
            let ranAction = false;
            // If arrow keys or mouse was used prior to entering characters while in insert mode, create an undo point
            // this needs to happen before any changes are made
            /*
            TODO
        
            // If arrow keys or mouse were in insert mode, create an undo point.
            // This needs to happen before any changes are made
        
            let prevPos = vimState.historyTracker.getLastHistoryEndPosition();
            if (prevPos !== undefined && !vimState.isRunningDotCommand) {
              if (vimState.cursorPositionJustBeforeAnythingHappened.line !== prevPos.line ||
                  vimState.cursorPositionJustBeforeAnythingHappened.character !== prevPos.character) {
        
                vimState.previousFullAction = recordedState;
                vimState.historyTracker.finishCurrentStep();
              }
            }
            */
            if (action instanceof actions_1.BaseMovement) {
                ({ vimState, recordedState } = yield this.executeMovement(vimState, action));
                ranAction = true;
            }
            if (action instanceof actions_1.BaseCommand) {
                vimState = yield action.execCount(vimState.cursorPosition, vimState);
                yield this.executeCommand(vimState);
                if (action.isCompleteAction) {
                    ranAction = true;
                }
                if (action.canBeRepeatedWithDot) {
                    ranRepeatableAction = true;
                }
            }
            if (action instanceof actions_1.DocumentContentChangeAction) {
                vimState = yield action.exec(vimState.cursorPosition, vimState);
            }
            // Update mode (note the ordering allows you to go into search mode,
            // then return and have the motion immediately applied to an operator).
            if (vimState.currentMode !== this.currentModeName) {
                this.setCurrentModeByName(vimState);
                if (vimState.currentMode === mode_1.ModeName.Normal) {
                    ranRepeatableAction = true;
                }
            }
            if (recordedState.operatorReadyToExecute(vimState.currentMode)) {
                vimState = yield this.executeOperator(vimState);
                vimState.recordedState.hasRunOperator = true;
                ranRepeatableAction = vimState.recordedState.operator.canBeRepeatedWithDot;
                ranAction = true;
            }
            // And then we have to do it again because an operator could
            // have changed it as well. (TODO: do you even decomposition bro)
            if (vimState.currentMode !== this.currentModeName) {
                this.setCurrentModeByName(vimState);
                if (vimState.currentMode === mode_1.ModeName.Normal) {
                    ranRepeatableAction = true;
                }
            }
            ranRepeatableAction = (ranRepeatableAction && vimState.currentMode === mode_1.ModeName.Normal) || this.createUndoPointForBrackets(vimState);
            ranAction = ranAction && vimState.currentMode === mode_1.ModeName.Normal;
            // Record down previous action and flush temporary state
            if (ranRepeatableAction) {
                vimState.previousFullAction = vimState.recordedState;
                if (recordedState.isInsertion) {
                    register_1.Register.putByKey(recordedState, '.');
                }
            }
            if (ranAction) {
                vimState.recordedState = new RecordedState();
            }
            // track undo history
            if (!this.vimState.focusChanged) {
                // important to ensure that focus didn't change, otherwise
                // we'll grab the text of the incorrect active window and assume the
                // whole document changed!
                if (this._vimState.alteredHistory) {
                    this._vimState.alteredHistory = false;
                    vimState.historyTracker.ignoreChange();
                }
                else {
                    vimState.historyTracker.addChange(this._vimState.cursorPositionJustBeforeAnythingHappened);
                }
            }
            if (ranRepeatableAction) {
                vimState.historyTracker.finishCurrentStep();
            }
            recordedState.actionKeys = [];
            vimState.currentRegisterMode = register_1.RegisterMode.FigureItOutFromCurrentMode;
            if (this.currentModeName === mode_1.ModeName.Normal) {
                vimState.cursorStartPosition = vimState.cursorPosition;
            }
            // Ensure cursor is within bounds
            for (const { stop, i } of range_1.Range.IterateRanges(vimState.allCursors)) {
                if (stop.line >= textEditor_1.TextEditor.getLineCount()) {
                    vimState.allCursors[i] = vimState.allCursors[i].withNewStop(vimState.cursorPosition.getDocumentEnd());
                }
                const currentLineLength = textEditor_1.TextEditor.getLineAt(stop).text.length;
                if (vimState.currentMode === mode_1.ModeName.Normal &&
                    stop.character >= currentLineLength && currentLineLength > 0) {
                    vimState.allCursors[i] = vimState.allCursors[i].withNewStop(stop.getLineEnd().getLeft());
                }
            }
            // Update the current history step to have the latest cursor position
            vimState.historyTracker.setLastHistoryEndPosition(vimState.allCursors.map(x => x.stop));
            // Updated desired column
            const movement = action instanceof actions_1.BaseMovement ? action : undefined;
            if ((movement && !movement.doesntChangeDesiredColumn) ||
                (recordedState.command &&
                    vimState.currentMode !== mode_1.ModeName.VisualBlock &&
                    vimState.currentMode !== mode_1.ModeName.VisualBlockInsertMode)) {
                // We check !operator here because e.g. d$ should NOT set the desired column to EOL.
                if (movement && movement.setsDesiredColumnToEOL && !recordedState.operator) {
                    vimState.desiredColumn = Number.POSITIVE_INFINITY;
                }
                else {
                    vimState.desiredColumn = vimState.cursorPosition.character;
                }
            }
            // Make sure no two cursors are at the same location.
            // This is a consequence of the fact that allCursors is not a Set.
            // TODO: It should be a set.
            const resultingList = [];
            for (const cursor of vimState.allCursors) {
                let shouldAddToList = true;
                for (const alreadyAddedCursor of resultingList) {
                    if (cursor.equals(alreadyAddedCursor)) {
                        shouldAddToList = false;
                        break;
                    }
                }
                if (shouldAddToList) {
                    resultingList.push(cursor);
                }
            }
            vimState.allCursors = resultingList;
            return vimState;
        });
    }
    executeMovement(vimState, movement) {
        return __awaiter(this, void 0, void 0, function* () {
            vimState.lastMovementFailed = false;
            let recordedState = vimState.recordedState;
            for (let i = 0; i < vimState.allCursors.length; i++) {
                /**
                 * Essentially what we're doing here is pretending like the
                 * current VimState only has one cursor (the cursor that we just
                 * iterated to).
                 *
                 * We set the cursor position to be equal to the iterated one,
                 * and then set it back immediately after we're done.
                 *
                 * The slightly more complicated logic here allows us to write
                 * Action definitions without having to think about multiple
                 * cursors in almost all cases.
                 */
                const cursorPosition = vimState.allCursors[i].stop;
                const old = vimState.cursorPosition;
                vimState.cursorPosition = cursorPosition;
                const result = yield movement.execActionWithCount(cursorPosition, vimState, recordedState.count);
                vimState.cursorPosition = old;
                if (result instanceof position_1.Position) {
                    vimState.allCursors[i] = vimState.allCursors[i].withNewStop(result);
                    if (!vimState.getModeObject(this).isVisualMode &&
                        !vimState.recordedState.operator) {
                        vimState.allCursors[i] = vimState.allCursors[i].withNewStart(result);
                    }
                }
                else if (actions_1.isIMovement(result)) {
                    if (result.failed) {
                        vimState.recordedState = new RecordedState();
                        vimState.lastMovementFailed = true;
                    }
                    vimState.allCursors[i] = range_1.Range.FromIMovement(result);
                    if (result.registerMode) {
                        vimState.currentRegisterMode = result.registerMode;
                    }
                }
                if (movement.canBeRepeatedWithSemicolon(vimState, result)) {
                    VimState.lastRepeatableMovement = movement;
                }
            }
            vimState.recordedState.count = 0;
            // Keep the cursor within bounds
            if (vimState.currentMode === mode_1.ModeName.Normal && !recordedState.operator) {
                for (const { stop, i } of range_1.Range.IterateRanges(vimState.allCursors)) {
                    if (stop.character >= position_1.Position.getLineLength(stop.line)) {
                        vimState.allCursors[i].withNewStop(stop.getLineEnd().getLeft());
                    }
                }
            }
            else {
                let stop = vimState.cursorPosition;
                // Vim does this weird thing where it allows you to select and delete
                // the newline character, which it places 1 past the last character
                // in the line. This is why we use > instead of >=.
                if (stop.character > position_1.Position.getLineLength(stop.line)) {
                    vimState.cursorPosition = stop.getLineEnd();
                }
            }
            return { vimState, recordedState };
        });
    }
    executeOperator(vimState) {
        return __awaiter(this, void 0, void 0, function* () {
            let recordedState = vimState.recordedState;
            if (!recordedState.operator) {
                throw new Error("what in god's name");
            }
            let resultVimState = vimState;
            // TODO - if actions were more pure, this would be unnecessary.
            const cachedMode = this._vimState.getModeObject(this);
            const cachedRegister = vimState.currentRegisterMode;
            const resultingCursors = [];
            let i = 0;
            let resultingModeName;
            let startingModeName = vimState.currentMode;
            for (let { start, stop } of vimState.allCursors) {
                if (start.compareTo(stop) > 0) {
                    [start, stop] = [stop, start];
                }
                if (!cachedMode.isVisualMode && cachedRegister !== register_1.RegisterMode.LineWise) {
                    if (position_1.Position.EarlierOf(start, stop) === start) {
                        stop = stop.getLeft();
                    }
                    else {
                        stop = stop.getRight();
                    }
                }
                if (this.currentModeName === mode_1.ModeName.VisualLine) {
                    start = start.getLineBegin();
                    stop = stop.getLineEnd();
                    vimState.currentRegisterMode = register_1.RegisterMode.LineWise;
                }
                recordedState.operator.multicursorIndex = i++;
                resultVimState.currentMode = startingModeName;
                resultVimState = yield recordedState.operator.run(resultVimState, start, stop);
                for (const transformation of resultVimState.recordedState.transformations) {
                    if (transformations_1.isTextTransformation(transformation) && transformation.cursorIndex === undefined) {
                        transformation.cursorIndex = recordedState.operator.multicursorIndex;
                    }
                }
                resultingModeName = resultVimState.currentMode;
                let resultingRange = new range_1.Range(resultVimState.cursorStartPosition, resultVimState.cursorPosition);
                resultingCursors.push(resultingRange);
            }
            if (vimState.recordedState.transformations.length > 0) {
                yield this.executeCommand(vimState);
            }
            else {
                // Keep track of all cursors (in the case of multi-cursor).
                resultVimState.allCursors = resultingCursors;
                const selections = [];
                for (const cursor of vimState.allCursors) {
                    selections.push(new vscode.Selection(cursor.start, cursor.stop));
                }
                vscode.window.activeTextEditor.selections = selections;
            }
            return resultVimState;
        });
    }
    executeCommand(vimState) {
        return __awaiter(this, void 0, void 0, function* () {
            const transformations = vimState.recordedState.transformations;
            if (transformations.length === 0) {
                return vimState;
            }
            const textTransformations = transformations.filter(x => transformations_1.isTextTransformation(x));
            const otherTransformations = transformations.filter(x => !transformations_1.isTextTransformation(x));
            let accumulatedPositionDifferences = {};
            if (textTransformations.length > 0) {
                if (transformations_1.areAnyTransformationsOverlapping(textTransformations)) {
                    // TODO: Select one transformation for every cursor and run them all
                    // in parallel. Repeat till there are no more transformations.
                    for (const command of textTransformations) {
                        yield vscode.window.activeTextEditor.edit(edit => {
                            switch (command.type) {
                                case "insertText":
                                    edit.insert(command.position, command.text);
                                    break;
                                case "replaceText":
                                    edit.replace(new vscode.Selection(command.end, command.start), command.text);
                                    break;
                                case "deleteText":
                                    edit.delete(new vscode.Range(command.position, command.position.getLeftThroughLineBreaks()));
                                    break;
                                case "deleteRange":
                                    edit.delete(new vscode.Selection(command.range.start, command.range.stop));
                                    break;
                            }
                            if (command.cursorIndex === undefined) {
                                throw new Error("No cursor index - this should never ever happen!");
                            }
                            if (command.diff) {
                                if (!accumulatedPositionDifferences[command.cursorIndex]) {
                                    accumulatedPositionDifferences[command.cursorIndex] = [];
                                }
                                accumulatedPositionDifferences[command.cursorIndex].push(command.diff);
                            }
                        });
                    }
                    ;
                }
                else {
                    // This is the common case!
                    /**
                     * batch all text operations together as a single operation
                     * (this is primarily necessary for multi-cursor mode, since most
                     * actions will trigger at most one text operation).
                     */
                    yield vscode.window.activeTextEditor.edit(edit => {
                        for (const command of textTransformations) {
                            switch (command.type) {
                                case "insertText":
                                    edit.insert(command.position, command.text);
                                    break;
                                case "replaceText":
                                    edit.replace(new vscode.Selection(command.end, command.start), command.text);
                                    break;
                                case "deleteText":
                                    edit.delete(new vscode.Range(command.position, command.position.getLeftThroughLineBreaks()));
                                    break;
                                case "deleteRange":
                                    edit.delete(new vscode.Selection(command.range.start, command.range.stop));
                                    break;
                            }
                            if (command.cursorIndex === undefined) {
                                throw new Error("No cursor index - this should never ever happen!");
                            }
                            if (command.diff) {
                                if (!accumulatedPositionDifferences[command.cursorIndex]) {
                                    accumulatedPositionDifferences[command.cursorIndex] = [];
                                }
                                accumulatedPositionDifferences[command.cursorIndex].push(command.diff);
                            }
                        }
                    });
                }
            }
            for (const command of otherTransformations) {
                switch (command.type) {
                    case "insertTextVSCode":
                        yield textEditor_1.TextEditor.insert(command.text);
                        vimState.cursorStartPosition = position_1.Position.FromVSCodePosition(vscode.window.activeTextEditor.selection.start);
                        vimState.cursorPosition = position_1.Position.FromVSCodePosition(vscode.window.activeTextEditor.selection.end);
                        break;
                    case "showCommandLine":
                        yield main_1.showCmdLine(vimState.commandInitialText, this);
                        break;
                    case "dot":
                        if (!vimState.previousFullAction) {
                            return vimState; // TODO(bell)
                        }
                        const clonedAction = vimState.previousFullAction.clone();
                        yield this.rerunRecordedState(vimState, vimState.previousFullAction);
                        vimState.previousFullAction = clonedAction;
                        break;
                    case "macro":
                        let recordedMacro = (yield register_1.Register.getByKey(command.register)).text;
                        if (command.replay === "contentChange") {
                            vimState = yield this.runMacro(vimState, recordedMacro);
                        }
                        else {
                            let keyStrokes = [];
                            for (let action of recordedMacro.actionsRun) {
                                keyStrokes = keyStrokes.concat(action.keysPressed);
                            }
                            this.vimState.recordedState = new RecordedState();
                            yield this.handleMultipleKeyEvents(keyStrokes);
                        }
                        vimState.historyTracker.lastInvokedMacro = recordedMacro;
                        if (vimState.lastMovementFailed) {
                            // movement in last invoked macro failed then we should stop all following repeating macros.
                            // Besides, we should reset `lastMovementFailed`.
                            vimState.lastMovementFailed = false;
                            return vimState;
                        }
                        break;
                }
            }
            const selections = vscode.window.activeTextEditor.selections;
            const firstTransformation = transformations[0];
            const manuallySetCursorPositions = firstTransformation.type === "deleteRange" &&
                firstTransformation.manuallySetCursorPositions;
            // We handle multiple cursors in a different way in visual block mode, unfortunately.
            // TODO - refactor that out!
            if (vimState.currentMode !== mode_1.ModeName.VisualBlockInsertMode &&
                vimState.currentMode !== mode_1.ModeName.VisualBlock &&
                !manuallySetCursorPositions) {
                vimState.allCursors = [];
                const resultingCursors = [];
                for (let i = 0; i < selections.length; i++) {
                    let sel = range_1.Range.FromVSCodeSelection(selections[i]);
                    let resultStart = position_1.Position.FromVSCodePosition(sel.start);
                    let resultEnd = position_1.Position.FromVSCodePosition(sel.stop);
                    if (accumulatedPositionDifferences[i] && accumulatedPositionDifferences[i].length > 0) {
                        for (const diff of accumulatedPositionDifferences[i]) {
                            resultStart = resultStart.add(diff);
                            resultEnd = resultEnd.add(diff);
                        }
                        sel = new range_1.Range(resultStart, resultEnd);
                    }
                    else {
                        sel = new range_1.Range(position_1.Position.FromVSCodePosition(sel.start), position_1.Position.FromVSCodePosition(sel.stop));
                    }
                    if (vimState.recordedState.operatorPositionDiff) {
                        sel = sel.add(vimState.recordedState.operatorPositionDiff);
                    }
                    resultingCursors.push(sel);
                }
                vimState.recordedState.operatorPositionDiff = undefined;
                vimState.allCursors = resultingCursors;
            }
            else {
                if (accumulatedPositionDifferences[0] !== undefined) {
                    if (accumulatedPositionDifferences[0].length > 0) {
                        vimState.cursorPosition = vimState.cursorPosition.add(accumulatedPositionDifferences[0][0]);
                        vimState.cursorStartPosition = vimState.cursorStartPosition.add(accumulatedPositionDifferences[0][0]);
                    }
                }
            }
            /**
             * This is a bit of a hack because Visual Block Mode isn't fully on board with
             * the new text transformation style yet.
             *
             * (TODO)
             */
            if (firstTransformation.type === 'deleteRange') {
                if (firstTransformation.collapseRange) {
                    vimState.cursorPosition = new position_1.Position(vimState.cursorPosition.line, vimState.cursorStartPosition.character);
                }
            }
            vimState.recordedState.transformations = [];
            return vimState;
        });
    }
    rerunRecordedState(vimState, recordedState) {
        return __awaiter(this, void 0, void 0, function* () {
            const actions = recordedState.actionsRun.slice(0);
            recordedState = new RecordedState();
            vimState.recordedState = recordedState;
            vimState.isRunningDotCommand = true;
            let i = 0;
            for (let action of actions) {
                recordedState.actionsRun = actions.slice(0, ++i);
                vimState = yield this.runAction(vimState, recordedState, action);
                if (vimState.lastMovementFailed) {
                    return vimState;
                }
                yield this.updateView(vimState);
            }
            vimState.isRunningDotCommand = false;
            recordedState.actionsRun = actions;
            return vimState;
        });
    }
    runMacro(vimState, recordedMacro) {
        return __awaiter(this, void 0, void 0, function* () {
            const actions = recordedMacro.actionsRun.slice(0);
            let recordedState = new RecordedState();
            vimState.recordedState = recordedState;
            vimState.isRunningDotCommand = true;
            let i = 0;
            for (let action of actions) {
                recordedState.actionsRun = actions.slice(0, ++i);
                vimState = yield this.runAction(vimState, recordedState, action);
                if (vimState.lastMovementFailed) {
                    break;
                }
                yield this.updateView(vimState);
            }
            vimState.isRunningDotCommand = false;
            vimState.cursorPositionJustBeforeAnythingHappened = vimState.allCursors.map(x => x.stop);
            return vimState;
        });
    }
    updateView(vimState, args = { drawSelection: true, revealRange: true }) {
        return __awaiter(this, void 0, void 0, function* () {
            // Draw selection (or cursor)
            if (args.drawSelection) {
                let selections;
                if (!vimState.isMultiCursor) {
                    let start = vimState.cursorStartPosition;
                    let stop = vimState.cursorPosition;
                    if (vimState.currentMode === mode_1.ModeName.Visual) {
                        /**
                         * Always select the letter that we started visual mode on, no matter
                         * if we are in front or behind it. Imagine that we started visual mode
                         * with some text like this:
                         *
                         *   abc|def
                         *
                         * (The | represents the cursor.) If we now press w, we'll select def,
                         * but if we hit b we expect to select abcd, so we need to getRight() on the
                         * start of the selection when it precedes where we started visual mode.
                         */
                        if (start.compareTo(stop) > 0) {
                            start = start.getRight();
                        }
                        selections = [new vscode.Selection(start, stop)];
                    }
                    else if (vimState.currentMode === mode_1.ModeName.VisualLine) {
                        selections = [new vscode.Selection(position_1.Position.EarlierOf(start, stop).getLineBegin(), position_1.Position.LaterOf(start, stop).getLineEnd())];
                    }
                    else if (vimState.currentMode === mode_1.ModeName.VisualBlock) {
                        selections = [];
                        for (const { start: lineStart, end } of position_1.Position.IterateLine(vimState)) {
                            selections.push(new vscode.Selection(lineStart, end));
                        }
                    }
                    else {
                        selections = [new vscode.Selection(stop, stop)];
                    }
                }
                else {
                    // MultiCursor mode is active.
                    if (vimState.currentMode === mode_1.ModeName.Visual) {
                        selections = [];
                        for (let { start: cursorStart, stop: cursorStop } of vimState.allCursors) {
                            if (cursorStart.compareTo(cursorStop) > 0) {
                                cursorStart = cursorStart.getRight();
                            }
                            selections.push(new vscode.Selection(cursorStart, cursorStop));
                        }
                    }
                    else if (vimState.currentMode === mode_1.ModeName.Normal ||
                        vimState.currentMode === mode_1.ModeName.Insert ||
                        vimState.currentMode === mode_1.ModeName.SearchInProgressMode) {
                        selections = [];
                        for (const { stop: cursorStop } of vimState.allCursors) {
                            selections.push(new vscode.Selection(cursorStop, cursorStop));
                        }
                    }
                    else {
                        console.error("This is pretty bad!");
                        selections = [];
                    }
                }
                this._vimState.whatILastSetTheSelectionTo = selections[0];
                vscode.window.activeTextEditor.selections = selections;
            }
            // Scroll to position of cursor
            if (this._vimState.currentMode === mode_1.ModeName.SearchInProgressMode) {
                const nextMatch = vimState.searchState.getNextSearchMatchPosition(vimState.cursorPosition).pos;
                vscode.window.activeTextEditor.revealRange(new vscode.Range(nextMatch, nextMatch));
            }
            else {
                if (args.revealRange) {
                    vscode.window.activeTextEditor.revealRange(new vscode.Range(vimState.cursorPosition, vimState.cursorPosition));
                }
            }
            let rangesToDraw = [];
            // Draw block cursor.
            if (configuration_1.Configuration.getInstance().useSolidBlockCursor) {
                if (this.currentMode.name !== mode_1.ModeName.Insert) {
                    for (const { stop: cursorStop } of vimState.allCursors) {
                        rangesToDraw.push(new vscode.Range(cursorStop, cursorStop.getRight()));
                    }
                }
            }
            else {
                // Use native block cursor if possible.
                const options = vscode.window.activeTextEditor.options;
                options.cursorStyle = this.currentMode.cursorType === mode_1.VSCodeVimCursorType.Native &&
                    this.currentMode.name !== mode_1.ModeName.VisualBlockInsertMode &&
                    this.currentMode.name !== mode_1.ModeName.Insert ?
                    vscode.TextEditorCursorStyle.Block : vscode.TextEditorCursorStyle.Line;
                vscode.window.activeTextEditor.options = options;
            }
            if (this.currentMode.cursorType === mode_1.VSCodeVimCursorType.TextDecoration &&
                this.currentMode.name !== mode_1.ModeName.Insert) {
                // Fake block cursor with text decoration. Unfortunately we can't have a cursor
                // in the middle of a selection natively, which is what we need for Visual Mode.
                for (const { stop: cursorStop } of vimState.allCursors) {
                    rangesToDraw.push(new vscode.Range(cursorStop, cursorStop.getRight()));
                }
            }
            // Draw marks
            // I should re-enable this with a config setting at some point
            /*
        
            for (const mark of this.vimState.historyTracker.getMarks()) {
              rangesToDraw.push(new vscode.Range(mark.position, mark.position.getRight()));
            }
        
            */
            // Draw search highlight
            if (this.currentMode.name === mode_1.ModeName.SearchInProgressMode ||
                (configuration_1.Configuration.getInstance().hlsearch && vimState.searchState)) {
                const searchState = vimState.searchState;
                rangesToDraw.push.apply(rangesToDraw, searchState.matchRanges);
                const { pos, match } = searchState.getNextSearchMatchPosition(vimState.cursorPosition);
                if (match) {
                    rangesToDraw.push(new vscode.Range(pos, pos.getRight(searchState.searchString.length)));
                }
            }
            vscode.window.activeTextEditor.setDecorations(this._caretDecoration, rangesToDraw);
            for (let i = 0; i < this.vimState.postponedCodeViewChanges.length; i++) {
                let viewChange = this.vimState.postponedCodeViewChanges[i];
                yield vscode.commands.executeCommand(viewChange.command, viewChange.args);
            }
            if (this.vimState.postponedCodeViewChanges.length > 0) {
                vimState.allCursors = yield util_1.allowVSCodeToPropagateCursorUpdatesAndReturnThem();
                this.vimState.postponedCodeViewChanges = [];
            }
            if (this.currentMode.name === mode_1.ModeName.SearchInProgressMode) {
                this.setupStatusBarItem(`Searching for: ${this.vimState.searchState.searchString}`);
            }
            else {
                this.setupStatusBarItem(`-- ${this.currentMode.text.toUpperCase()} ${this._vimState.isMultiCursor ? 'MULTI CURSOR' : ''} -- ` +
                    `${this._vimState.isRecordingMacro ? 'Recording @' + this._vimState.recordedMacro.registerName : ''}`);
            }
            vscode.commands.executeCommand('setContext', 'vim.mode', this.currentMode.text);
            vscode.commands.executeCommand('setContext', 'vim.useCtrlKeys', configuration_1.Configuration.getInstance().useCtrlKeys);
            vscode.commands.executeCommand('setContext', 'vim.platform', process.platform);
        });
    }
    handleMultipleKeyEvents(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const key of keys) {
                yield this.handleKeyEvent(key);
            }
        });
    }
    setupStatusBarItem(text) {
        if (!ModeHandler._statusBarItem) {
            ModeHandler._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        }
        ModeHandler._statusBarItem.text = text || '';
        ModeHandler._statusBarItem.show();
    }
    // Return true if a new undo point should be created based on brackets and parenthesis
    createUndoPointForBrackets(vimState) {
        // }])> keys all start a new undo state when directly next to an {[(< opening character
        const key = vimState.recordedState.actionKeys[vimState.recordedState.actionKeys.length - 1];
        if (key === undefined) {
            return false;
        }
        if (vimState.currentMode === mode_1.ModeName.Insert) {
            // Check if the keypress is a closing bracket to a corresponding opening bracket right next to it
            let result = matcher_1.PairMatcher.nextPairedChar(vimState.cursorPosition, key, false);
            if (result !== undefined) {
                if (vimState.cursorPosition.compareTo(result) === 0) {
                    return true;
                }
            }
            result = matcher_1.PairMatcher.nextPairedChar(vimState.cursorPosition.getLeft(), key, true);
            if (result !== undefined) {
                if (vimState.cursorPosition.getLeftByCount(2).compareTo(result) === 0) {
                    return true;
                }
            }
        }
        return false;
    }
    dispose() {
        for (const disposable of this._toBeDisposed) {
            disposable.dispose();
        }
    }
}
ModeHandler.IsTesting = false;
exports.ModeHandler = ModeHandler;
//# sourceMappingURL=modeHandler.js.map