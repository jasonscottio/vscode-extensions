"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var log_1 = require('../util/log');
var scope_1 = require('./scope');
var log = log_1.Log.create('EnvironmentAdapter');
var EnvironmentAdapter = (function () {
    function EnvironmentAdapter(environment) {
        this.environment = environment;
        if (environment.parent !== undefined) {
            this.parent = EnvironmentAdapter.from(environment.parent);
        }
    }
    EnvironmentAdapter.from = function (environment) {
        switch (environment.type) {
            case 'object':
                return new ObjectEnvironmentAdapter(environment);
            case 'function':
                return new FunctionEnvironmentAdapter(environment);
            case 'with':
                return new WithEnvironmentAdapter(environment);
            case 'block':
                return new BlockEnvironmentAdapter(environment);
            default:
                return null;
        }
    };
    EnvironmentAdapter.prototype.getScopeAdapters = function (threadAdapter) {
        var scopes = this.getAllScopeAdapters(threadAdapter);
        return scopes;
    };
    EnvironmentAdapter.prototype.getAllScopeAdapters = function (threadAdapter) {
        var scopes;
        if (this.parent !== undefined) {
            scopes = this.parent.getAllScopeAdapters(threadAdapter);
        }
        else {
            scopes = [];
        }
        var ownScope = this.getOwnScopeAdapter(threadAdapter);
        if (ownScope != null) {
            scopes.unshift(ownScope);
        }
        return scopes;
    };
    return EnvironmentAdapter;
}());
exports.EnvironmentAdapter = EnvironmentAdapter;
var ObjectEnvironmentAdapter = (function (_super) {
    __extends(ObjectEnvironmentAdapter, _super);
    function ObjectEnvironmentAdapter(environment) {
        _super.call(this, environment);
    }
    ObjectEnvironmentAdapter.prototype.getOwnScopeAdapter = function (threadAdapter) {
        var grip = this.environment.object;
        if ((typeof grip === 'boolean') || (typeof grip === 'number') || (typeof grip === 'string')) {
            log.error("Object environment with unexpected grip of type " + typeof grip);
            return null;
        }
        else if (grip.type !== 'object') {
            log.error("Object environment with unexpected grip of type " + grip.type);
            return null;
        }
        else {
            var objectGrip = grip;
            var name_1 = "Object: " + objectGrip.class;
            return new scope_1.ObjectScopeAdapter(name_1, objectGrip, threadAdapter);
        }
    };
    return ObjectEnvironmentAdapter;
}(EnvironmentAdapter));
exports.ObjectEnvironmentAdapter = ObjectEnvironmentAdapter;
var FunctionEnvironmentAdapter = (function (_super) {
    __extends(FunctionEnvironmentAdapter, _super);
    function FunctionEnvironmentAdapter(environment) {
        _super.call(this, environment);
    }
    FunctionEnvironmentAdapter.prototype.getOwnScopeAdapter = function (threadAdapter) {
        var func = this.environment.function;
        var scopeName;
        if ((typeof func === 'object') && (func.type === 'object') &&
            (func.class === 'Function')) {
            var funcName = func.name;
            scopeName = (funcName !== undefined) ? "Local: " + funcName : 'Local';
        }
        else {
            log.error("Unexpected function grip in function environment: " + JSON.stringify(func));
            scopeName = '[unknown]';
        }
        return new scope_1.FunctionScopeAdapter(scopeName, this.environment.bindings, threadAdapter);
    };
    return FunctionEnvironmentAdapter;
}(EnvironmentAdapter));
exports.FunctionEnvironmentAdapter = FunctionEnvironmentAdapter;
var WithEnvironmentAdapter = (function (_super) {
    __extends(WithEnvironmentAdapter, _super);
    function WithEnvironmentAdapter(environment) {
        _super.call(this, environment);
    }
    WithEnvironmentAdapter.prototype.getOwnScopeAdapter = function (threadAdapter) {
        var grip = this.environment.object;
        if ((typeof grip === 'boolean') || (typeof grip === 'number') || (typeof grip === 'string')) {
            log.error("\"with\" environment with unexpected grip of type " + typeof grip);
            return null;
        }
        else if (grip.type !== 'object') {
            log.error("\"with\" environment with unexpected grip of type " + grip.type);
            return null;
        }
        else {
            var objectGrip = grip;
            var name_2 = "With: " + objectGrip.class;
            return new scope_1.ObjectScopeAdapter(name_2, objectGrip, threadAdapter);
        }
    };
    return WithEnvironmentAdapter;
}(EnvironmentAdapter));
exports.WithEnvironmentAdapter = WithEnvironmentAdapter;
var BlockEnvironmentAdapter = (function (_super) {
    __extends(BlockEnvironmentAdapter, _super);
    function BlockEnvironmentAdapter(environment) {
        _super.call(this, environment);
    }
    BlockEnvironmentAdapter.prototype.getOwnScopeAdapter = function (threadAdapter) {
        return new scope_1.LocalVariablesScopeAdapter('Block', this.environment.bindings.variables, threadAdapter);
    };
    return BlockEnvironmentAdapter;
}(EnvironmentAdapter));
exports.BlockEnvironmentAdapter = BlockEnvironmentAdapter;
//# sourceMappingURL=environment.js.map