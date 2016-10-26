"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var events_1 = require('events');
/**
 * Implements the Remote Debugging Protocol Stream Transport
 * as defined in https://wiki.mozilla.org/Remote_Debugging_Protocol_Stream_Transport
 * Currently bulk data packets are unsupported and error handling is nonexistent
 */
var DebugProtocolTransport = (function (_super) {
    __extends(DebugProtocolTransport, _super);
    function DebugProtocolTransport(socket) {
        var _this = this;
        _super.call(this);
        this.socket = socket;
        this.buffer = new Buffer(DebugProtocolTransport.initialBufferLength);
        this.bufferedLength = 0;
        this.receivingHeader = true;
        this.socket.on('data', function (chunk) {
            var processedLength = 0;
            while (processedLength < chunk.length) {
                // copy the maximum number of bytes possible into this.buffer
                var copyLength = Math.min(chunk.length - processedLength, _this.buffer.length - _this.bufferedLength);
                chunk.copy(_this.buffer, _this.bufferedLength, processedLength, processedLength + copyLength);
                processedLength += copyLength;
                _this.bufferedLength += copyLength;
                if (_this.receivingHeader) {
                    // did we receive a complete header yet?
                    for (var i = 0; i < _this.bufferedLength; i++) {
                        if (_this.buffer[i] === 58) {
                            // header is complete: parse it
                            var bodyLength = +_this.buffer.toString('ascii', 0, i);
                            // create a buffer for the message body
                            var bodyBuffer = new Buffer(bodyLength);
                            // copy the start of the body from this.buffer
                            _this.buffer.copy(bodyBuffer, 0, i + 1);
                            // replace this.buffer with bodyBuffer
                            _this.buffer = bodyBuffer;
                            _this.bufferedLength = _this.bufferedLength - (i + 1);
                            _this.receivingHeader = false;
                            break;
                        }
                    }
                }
                else {
                    // did we receive the complete body yet?
                    if (_this.bufferedLength === _this.buffer.length) {
                        // body is complete: parse and emit it
                        var msgString = _this.buffer.toString('utf8');
                        _this.emit('message', JSON.parse(msgString));
                        // get ready to receive the next header
                        _this.buffer = new Buffer(DebugProtocolTransport.initialBufferLength);
                        _this.bufferedLength = 0;
                        _this.receivingHeader = true;
                    }
                }
            }
        });
    }
    DebugProtocolTransport.prototype.sendMessage = function (msg) {
        var msgBuf = new Buffer(JSON.stringify(msg), 'utf8');
        this.socket.write(msgBuf.length + ':', 'ascii');
        this.socket.write(msgBuf);
    };
    DebugProtocolTransport.prototype.disconnect = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.socket.on('close', function () { return resolve(); });
            _this.socket.end();
        });
    };
    DebugProtocolTransport.initialBufferLength = 11; // must be large enough to receive a complete header
    return DebugProtocolTransport;
}(events_1.EventEmitter));
exports.DebugProtocolTransport = DebugProtocolTransport;
//# sourceMappingURL=transport.js.map