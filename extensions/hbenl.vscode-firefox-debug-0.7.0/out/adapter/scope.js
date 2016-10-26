"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var index_1 = require('./index');
var vscode_debugadapter_1 = require('vscode-debugadapter');
var ScopeAdapter = (function () {
    function ScopeAdapter(name, threadAdapter) {
        this.threadAdapter = threadAdapter;
        this.name = name;
        this.threadAdapter.registerScopeAdapter(this);
        this.threadAdapter.debugSession.registerVariablesProvider(this);
    }
    ScopeAdapter.prototype.addThis = function (thisGrip) {
        this.thisVariable = index_1.VariableAdapter.fromGrip('this', thisGrip, false, this.threadAdapter);
    };
    ScopeAdapter.prototype.addCompletionValue = function (completionValue) {
        if (completionValue) {
            if (completionValue.return) {
                this.completionVariable = index_1.VariableAdapter.fromGrip('<return>', completionValue.return, false, this.threadAdapter);
            }
            else if (completionValue.throw) {
                this.completionVariable = index_1.VariableAdapter.fromGrip('<exception>', completionValue.throw, false, this.threadAdapter);
            }
        }
    };
    ScopeAdapter.prototype.getScope = function () {
        return new vscode_debugadapter_1.Scope(this.name, this.variablesProviderId);
    };
    ScopeAdapter.prototype.getVariables = function () {
        var _this = this;
        var variablesPromise = this.getVariablesInt();
        if (this.thisVariable) {
            variablesPromise = variablesPromise.then(function (vars) {
                vars.unshift(_this.thisVariable);
                return vars;
            });
        }
        if (this.completionVariable) {
            variablesPromise = variablesPromise.then(function (vars) {
                vars.unshift(_this.completionVariable);
                return vars;
            });
        }
        return variablesPromise;
    };
    ScopeAdapter.prototype.getObjectGripAdapters = function () {
        var objectGripadapters = this.getObjectGripAdaptersInt();
        if (this.thisVariable && this.thisVariable.getObjectGripAdapter()) {
            objectGripadapters.push(this.thisVariable.getObjectGripAdapter());
        }
        if (this.completionVariable && this.completionVariable.getObjectGripAdapter()) {
            objectGripadapters.push(this.completionVariable.getObjectGripAdapter());
        }
        return objectGripadapters;
    };
    ScopeAdapter.prototype.dispose = function () {
        this.threadAdapter.debugSession.unregisterVariablesProvider(this);
    };
    return ScopeAdapter;
}());
exports.ScopeAdapter = ScopeAdapter;
var ObjectScopeAdapter = (function (_super) {
    __extends(ObjectScopeAdapter, _super);
    function ObjectScopeAdapter(name, object, threadAdapter) {
        _super.call(this, name, threadAdapter);
        this.objectGripAdapter = threadAdapter.getOrCreateObjectGripAdapter(object, false);
    }
    ObjectScopeAdapter.prototype.getVariablesInt = function () {
        return this.objectGripAdapter.getVariables();
    };
    ObjectScopeAdapter.prototype.getObjectGripAdaptersInt = function () {
        return [this.objectGripAdapter];
    };
    return ObjectScopeAdapter;
}(ScopeAdapter));
exports.ObjectScopeAdapter = ObjectScopeAdapter;
var LocalVariablesScopeAdapter = (function (_super) {
    __extends(LocalVariablesScopeAdapter, _super);
    function LocalVariablesScopeAdapter(name, variableDescriptors, threadAdapter) {
        _super.call(this, name, threadAdapter);
        this.variables = [];
        this.variableDescriptors = variableDescriptors;
        for (var varname in this.variableDescriptors) {
            this.variables.push(index_1.VariableAdapter.fromPropertyDescriptor(varname, this.variableDescriptors[varname], false, this.threadAdapter));
        }
        index_1.VariableAdapter.sortVariables(this.variables);
    }
    LocalVariablesScopeAdapter.prototype.getVariablesInt = function () {
        return Promise.resolve(this.variables);
    };
    LocalVariablesScopeAdapter.prototype.getObjectGripAdaptersInt = function () {
        return this.variables
            .map(function (variableAdapter) { return variableAdapter.getObjectGripAdapter(); })
            .filter(function (objectGripAdapter) { return (objectGripAdapter != null); });
    };
    return LocalVariablesScopeAdapter;
}(ScopeAdapter));
exports.LocalVariablesScopeAdapter = LocalVariablesScopeAdapter;
var FunctionScopeAdapter = (function (_super) {
    __extends(FunctionScopeAdapter, _super);
    function FunctionScopeAdapter(name, bindings, threadAdapter) {
        var _this = this;
        _super.call(this, name, threadAdapter);
        this.variables = [];
        this.bindings = bindings;
        this.bindings.arguments.forEach(function (arg) {
            for (var varname in arg) {
                _this.variables.push(index_1.VariableAdapter.fromPropertyDescriptor(varname, arg[varname], false, _this.threadAdapter));
            }
        });
        for (var varname in this.bindings.variables) {
            this.variables.push(index_1.VariableAdapter.fromPropertyDescriptor(varname, this.bindings.variables[varname], false, this.threadAdapter));
        }
        index_1.VariableAdapter.sortVariables(this.variables);
    }
    FunctionScopeAdapter.prototype.getVariablesInt = function () {
        return Promise.resolve(this.variables);
    };
    FunctionScopeAdapter.prototype.getObjectGripAdaptersInt = function () {
        return this.variables
            .map(function (variableAdapter) { return variableAdapter.getObjectGripAdapter(); })
            .filter(function (objectGripAdapter) { return (objectGripAdapter != null); });
    };
    return FunctionScopeAdapter;
}(ScopeAdapter));
exports.FunctionScopeAdapter = FunctionScopeAdapter;
//# sourceMappingURL=scope.js.map