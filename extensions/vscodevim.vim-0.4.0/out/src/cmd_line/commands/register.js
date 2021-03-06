"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const vscode = require("vscode");
const node = require("../node");
const modeHandler_1 = require("../../mode/modeHandler");
const register_1 = require('../../register/register');
class RegisterCommand extends node.CommandBase {
    constructor(args) {
        super();
        this._name = 'register';
        this._shortName = 'reg';
        this._arguments = args;
    }
    get arguments() {
        return this._arguments;
    }
    getRegisterDisplayValue(register) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = (yield register_1.Register.getByKey(register)).text;
            if (result instanceof Array) {
                result = result.join("\n").substr(0, 100);
            }
            else if (result instanceof modeHandler_1.RecordedState) {
            }
            return result;
        });
    }
    displayRegisterValue(register) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = this.getRegisterDisplayValue(register);
            vscode.window.showInformationMessage(`${register} ${result}`);
        });
    }
    execute(modeHandler) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.arguments.arg !== undefined && this.arguments.arg.length > 0) {
                yield this.displayRegisterValue(this.arguments.arg);
            }
            else {
                const currentRegisterKeys = register_1.Register.getKeys();
                const registerKeyAndContent = new Array();
                for (let registerKey of currentRegisterKeys) {
                    registerKeyAndContent.push({
                        label: registerKey,
                        description: yield this.getRegisterDisplayValue(registerKey)
                    });
                }
                vscode.window.showQuickPick(registerKeyAndContent).then((val) => __awaiter(this, void 0, void 0, function* () {
                    if (val) {
                        let result = val.description;
                        vscode.window.showInformationMessage(`${val.label} ${result}`);
                    }
                }));
            }
        });
    }
}
exports.RegisterCommand = RegisterCommand;
//# sourceMappingURL=register.js.map