"use strict";
var log_1 = require('../../util/log');
var log = log_1.Log.create('PendingRequests');
var PendingRequest = (function () {
    function PendingRequest() {
    }
    return PendingRequest;
}());
exports.PendingRequest = PendingRequest;
var PendingRequests = (function () {
    function PendingRequests() {
        this.pendingRequests = [];
    }
    PendingRequests.prototype.enqueue = function (req) {
        this.pendingRequests.push(req);
    };
    PendingRequests.prototype.resolveOne = function (t) {
        if (this.pendingRequests.length > 0) {
            var request = this.pendingRequests.shift();
            request.resolve(t);
        }
        else {
            log.error("Received response without corresponding request!?");
        }
    };
    PendingRequests.prototype.rejectOne = function (err) {
        if (this.pendingRequests.length > 0) {
            var request = this.pendingRequests.shift();
            request.reject(err);
        }
        else {
            log.error("Received error response without corresponding request!?");
        }
    };
    PendingRequests.prototype.resolveAll = function (t) {
        this.pendingRequests.forEach(function (req) { return req.resolve(t); });
        this.pendingRequests = [];
    };
    PendingRequests.prototype.rejectAll = function (err) {
        this.pendingRequests.forEach(function (req) { return req.reject(err); });
        this.pendingRequests = [];
    };
    return PendingRequests;
}());
exports.PendingRequests = PendingRequests;
//# sourceMappingURL=pendingRequests.js.map