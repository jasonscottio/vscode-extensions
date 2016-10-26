"use strict";
var index_1 = require('./index');
var ObjectGripAdapter = (function () {
    function ObjectGripAdapter(objectGrip, threadLifetime, threadAdapter) {
        this.threadAdapter = threadAdapter;
        this._actor = threadAdapter.debugSession.getOrCreateObjectGripActorProxy(objectGrip);
        this.isThreadLifetime = threadLifetime;
        this.threadAdapter.debugSession.registerVariablesProvider(this);
    }
    Object.defineProperty(ObjectGripAdapter.prototype, "actor", {
        get: function () {
            return this._actor;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * get the referenced object's properties and its prototype as an array of Variables.
     * This method can only be called when the thread is paused.
     */
    ObjectGripAdapter.prototype.getVariables = function () {
        var _this = this;
        return this.actor.fetchPrototypeAndProperties().then(function (prototypeAndProperties) {
            var variables = [];
            for (var varname in prototypeAndProperties.ownProperties) {
                variables.push(index_1.VariableAdapter.fromPropertyDescriptor(varname, prototypeAndProperties.ownProperties[varname], _this.isThreadLifetime, _this.threadAdapter));
            }
            for (var varname in prototypeAndProperties.safeGetterValues) {
                variables.push(index_1.VariableAdapter.fromSafeGetterValueDescriptor(varname, prototypeAndProperties.safeGetterValues[varname], _this.isThreadLifetime, _this.threadAdapter));
            }
            index_1.VariableAdapter.sortVariables(variables);
            if (prototypeAndProperties.prototype !== null) {
                variables.push(index_1.VariableAdapter.fromGrip('__proto__', prototypeAndProperties.prototype, _this.isThreadLifetime, _this.threadAdapter));
            }
            return variables;
        });
    };
    ObjectGripAdapter.prototype.dispose = function () {
        this.threadAdapter.debugSession.unregisterVariablesProvider(this);
        this.actor.dispose();
    };
    return ObjectGripAdapter;
}());
exports.ObjectGripAdapter = ObjectGripAdapter;
//# sourceMappingURL=objectGrip.js.map