"use strict";
var vscode_debugadapter_1 = require('vscode-debugadapter');
var VariableAdapter = (function () {
    function VariableAdapter(varname, value, objectGripAdapter) {
        this.varname = varname;
        this.value = value;
        this.objectGripAdapter = objectGripAdapter;
    }
    VariableAdapter.prototype.getVariable = function () {
        return new vscode_debugadapter_1.Variable(this.varname, this.value, this.objectGripAdapter ? this.objectGripAdapter.variablesProviderId : undefined);
    };
    VariableAdapter.prototype.getObjectGripAdapter = function () {
        return this.objectGripAdapter;
    };
    VariableAdapter.fromGrip = function (varname, grip, threadLifetime, threadAdapter) {
        if ((typeof grip === 'boolean') || (typeof grip === 'number')) {
            return new VariableAdapter(varname, grip.toString());
        }
        else if (typeof grip === 'string') {
            return new VariableAdapter(varname, "\"" + grip + "\"");
        }
        else {
            switch (grip.type) {
                case 'null':
                case 'undefined':
                case 'Infinity':
                case '-Infinity':
                case 'NaN':
                case '-0':
                    return new VariableAdapter(varname, grip.type);
                case 'longString':
                    return new VariableAdapter(varname, grip.initial);
                case 'object':
                    var objectGrip = grip;
                    var vartype = objectGrip.class;
                    var objectGripAdapter = threadAdapter.getOrCreateObjectGripAdapter(objectGrip, threadLifetime);
                    return new VariableAdapter(varname, vartype, objectGripAdapter);
            }
        }
    };
    VariableAdapter.fromPropertyDescriptor = function (varname, propertyDescriptor, threadLifetime, threadAdapter) {
        if (propertyDescriptor.value !== undefined) {
            return VariableAdapter.fromGrip(varname, propertyDescriptor.value, threadLifetime, threadAdapter);
        }
        else {
            return new VariableAdapter(varname, 'undefined');
        }
    };
    VariableAdapter.fromSafeGetterValueDescriptor = function (varname, safeGetterValueDescriptor, threadLifetime, threadAdapter) {
        return VariableAdapter.fromGrip(varname, safeGetterValueDescriptor.getterValue, threadLifetime, threadAdapter);
    };
    VariableAdapter.sortVariables = function (variables) {
        variables.sort(function (var1, var2) { return VariableAdapter.compareStrings(var1.varname, var2.varname); });
    };
    VariableAdapter.compareStrings = function (s1, s2) {
        if (s1 < s2) {
            return -1;
        }
        else if (s1 === s2) {
            return 0;
        }
        else {
            return 1;
        }
    };
    return VariableAdapter;
}());
exports.VariableAdapter = VariableAdapter;
//# sourceMappingURL=variable.js.map