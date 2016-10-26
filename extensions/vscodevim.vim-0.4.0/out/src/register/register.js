"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const clipboard = require('copy-paste');
/**
 * There are two different modes of copy/paste in Vim - copy by character
 * and copy by line. Copy by line typically happens in Visual Line mode, but
 * also shows up in some other actions that work over lines (most noteably dd,
 * yy).
 */
(function (RegisterMode) {
    RegisterMode[RegisterMode["FigureItOutFromCurrentMode"] = 0] = "FigureItOutFromCurrentMode";
    RegisterMode[RegisterMode["CharacterWise"] = 1] = "CharacterWise";
    RegisterMode[RegisterMode["LineWise"] = 2] = "LineWise";
    RegisterMode[RegisterMode["BlockWise"] = 3] = "BlockWise";
})(exports.RegisterMode || (exports.RegisterMode = {}));
var RegisterMode = exports.RegisterMode;
;
class Register {
    static isClipboardRegister(registerName) {
        const register = Register.registers[registerName];
        return register && register.isClipboardRegister;
    }
    static isValidRegister(register) {
        return register in Register.registers || /^[a-z0-9]+$/i.test(register) || /\./.test(register);
    }
    static isValidRegisterForMacro(register) {
        return /^[a-zA-Z0-9]+$/i.test(register);
    }
    /**
     * Puts content in a register. If none is specified, uses the default
     * register ".
     */
    static put(content, vimState) {
        const register = vimState.recordedState.registerName;
        if (!Register.isValidRegister(register)) {
            throw new Error(`Invalid register ${register}`);
        }
        if (Register.isClipboardRegister(register)) {
            clipboard.copy(content);
        }
        Register.registers[register] = {
            text: content,
            registerMode: vimState.effectiveRegisterMode(),
            isClipboardRegister: Register.isClipboardRegister(register),
        };
    }
    static putByKey(content, register = '"', registerMode = RegisterMode.FigureItOutFromCurrentMode) {
        if (!Register.isValidRegister(register)) {
            throw new Error(`Invalid register ${register}`);
        }
        if (Register.isClipboardRegister(register)) {
            clipboard.copy(content);
        }
        Register.registers[register] = {
            text: content,
            registerMode: registerMode || RegisterMode.FigureItOutFromCurrentMode,
            isClipboardRegister: Register.isClipboardRegister(register),
        };
    }
    static add(content, vimState) {
        const register = vimState.recordedState.registerName;
        if (!Register.isValidRegister(register)) {
            throw new Error(`Invalid register ${register}`);
        }
        if (typeof Register.registers[register].text !== "string") {
            // TODO - I don't know why this cast is necessary!
            Register.registers[register].text.push(content);
        }
    }
    /**
     * Gets content from a register. If none is specified, uses the default
     * register ".
     */
    static get(vimState) {
        return __awaiter(this, void 0, void 0, function* () {
            const register = vimState.recordedState.registerName;
            return Register.getByKey(register);
        });
    }
    static getByKey(register) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Register.isValidRegister(register)) {
                throw new Error(`Invalid register ${register}`);
            }
            // Clipboard registers are always defined, so if a register doesn't already
            // exist we can be sure it's not a clipboard one
            if (!Register.registers[register]) {
                Register.registers[register] = {
                    text: "",
                    registerMode: RegisterMode.CharacterWise,
                    isClipboardRegister: false
                };
            }
            /* Read from system clipboard */
            if (Register.isClipboardRegister(register)) {
                const text = yield new Promise((resolve, reject) => clipboard.paste((err, text) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(text);
                    }
                }));
                Register.registers[register].text = text;
            }
            return Register.registers[register];
        });
    }
    static has(register) {
        return Register.registers[register] !== undefined;
    }
    static getKeys() {
        return Object.keys(Register.registers);
    }
}
/**
 * The '"' is the unnamed register.
 * The '*' and '+' are special registers for accessing the system clipboard.
 * TODO: Read-Only registers
 *  '.' register has the last inserted text.
 *  '%' register has the current file path.
 *  ':' is the most recently executed command.
 *  '#' is the name of last edited file. (low priority)
 */
Register.registers = {
    '"': { text: "", registerMode: RegisterMode.CharacterWise, isClipboardRegister: false },
    '*': { text: "", registerMode: RegisterMode.CharacterWise, isClipboardRegister: true },
    '+': { text: "", registerMode: RegisterMode.CharacterWise, isClipboardRegister: true }
};
exports.Register = Register;
//# sourceMappingURL=register.js.map