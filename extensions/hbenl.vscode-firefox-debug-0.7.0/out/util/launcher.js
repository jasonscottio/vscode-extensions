"use strict";
var os = require('os');
var path = require('path');
var fs = require('fs-extra');
var net = require('net');
var child_process_1 = require('child_process');
var uuid = require('node-uuid');
var ProfileFinder = require('firefox-profile/lib/profile_finder');
var addon_1 = require('./addon');
/**
 * Tries to launch Firefox with the given launch configuration.
 * The returned promise resolves to the spawned child process.
 */
function launchFirefox(config, addonId) {
    var firefoxPath = getFirefoxExecutablePath(config);
    if (!firefoxPath) {
        var errorMsg = 'Couldn\'t find the Firefox executable. ';
        if (config.firefoxExecutable) {
            errorMsg += 'Please correct the path given in your launch configuration.';
        }
        else {
            errorMsg += 'Please specify the path in your launch configuration.';
        }
        return Promise.reject(errorMsg);
    }
    var port = config.port || 6000;
    var firefoxArgs = ['-start-debugger-server', String(port), '-no-remote'];
    if (Array.isArray(config.firefoxArgs)) {
        firefoxArgs = firefoxArgs.concat(config.firefoxArgs);
    }
    if (config.file) {
        if (!path.isAbsolute(config.file)) {
            return Promise.reject('The "file" property in the launch configuration has to be an absolute path');
        }
        var fileUrl = config.file;
        if (os.platform() === 'win32') {
            fileUrl = 'file:///' + fileUrl.replace(/\\/g, '/');
        }
        else {
            fileUrl = 'file://' + fileUrl;
        }
        firefoxArgs.push(fileUrl);
    }
    else if (config.url) {
        firefoxArgs.push(config.url);
    }
    else if (config.addonType) {
        firefoxArgs.push('about:blank');
    }
    else {
        return Promise.reject('You need to set either "file" or "url" in the launch configuration');
    }
    return createDebugProfile(config, addonId).then(function (debugProfileDir) {
        firefoxArgs.push('-profile', debugProfileDir);
        var childProc = child_process_1.spawn(firefoxPath, firefoxArgs, { detached: true, stdio: 'ignore' });
        childProc.on('exit', function () {
            fs.removeSync(debugProfileDir);
        });
        childProc.unref();
        return childProc;
    });
}
exports.launchFirefox = launchFirefox;
function waitForSocket(config) {
    var port = config.port || 6000;
    return new Promise(function (resolve, reject) {
        tryConnect(port, 200, 25, resolve, reject);
    });
}
exports.waitForSocket = waitForSocket;
function getFirefoxExecutablePath(config) {
    if (config.firefoxExecutable) {
        if (isExecutable(config.firefoxExecutable)) {
            return config.firefoxExecutable;
        }
        else {
            return null;
        }
    }
    var candidates = [];
    switch (os.platform()) {
        case 'linux':
        case 'freebsd':
        case 'sunos':
            candidates = [
                '/usr/bin/firefox-developer',
                '/usr/bin/firefox'
            ];
            break;
        case 'darwin':
            candidates = [
                '/Applications/FirefoxDeveloperEdition.app/Contents/MacOS/firefox',
                '/Applications/Firefox.app/Contents/MacOS/firefox'
            ];
            break;
        case 'win32':
            candidates = [
                'C:\\Program Files (x86)\\Firefox Developer Edition\\firefox.exe',
                'C:\\Program Files\\Firefox Developer Edition\\firefox.exe',
                'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
                'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
            ];
            break;
    }
    for (var i = 0; i < candidates.length; i++) {
        if (isExecutable(candidates[i])) {
            return candidates[i];
        }
    }
    return null;
}
function createDebugProfile(config, addonId) {
    var debugProfileDir = path.join(os.tmpdir(), "vscode-firefox-debug-profile-" + uuid.v4());
    var createProfilePromise;
    if (config.profileDir) {
        if (!isReadableDirectory(config.profileDir)) {
            return Promise.reject("Couldn't access profile directory " + config.profileDir);
        }
        fs.copySync(config.profileDir, debugProfileDir, {
            clobber: true,
            filter: isNotLockFile
        });
        createProfilePromise = Promise.resolve(undefined);
    }
    else if (config.profile) {
        createProfilePromise = new Promise(function (resolve, reject) {
            var finder = new ProfileFinder();
            finder.getPath(config.profile, function (err, profileDir) {
                if (err) {
                    reject("Couldn't find profile '" + config.profile + "'");
                }
                else if (!isReadableDirectory(profileDir)) {
                    reject("Couldn't access profile '" + config.profile + "'");
                }
                else {
                    fs.copySync(profileDir, debugProfileDir, {
                        clobber: true,
                        filter: isNotLockFile
                    });
                    resolve(undefined);
                }
            });
        });
    }
    else {
        fs.mkdirSync(debugProfileDir);
        createProfilePromise = Promise.resolve(undefined);
    }
    return createProfilePromise.then(function () {
        fs.writeFileSync(path.join(debugProfileDir, 'user.js'), firefoxUserPrefs);
        if (addonId) {
            return addon_1.installAddon(config.addonType, addonId, config.addonPath, debugProfileDir)
                .then(function () { return debugProfileDir; });
        }
        else {
            return debugProfileDir;
        }
    });
}
function isNotLockFile(filePath) {
    var file = path.basename(filePath);
    return !/^(parent\.lock|lock|\.parentlock)$/.test(file);
}
var firefoxUserPrefs = "\nuser_pref(\"browser.shell.checkDefaultBrowser\", false);\nuser_pref(\"devtools.chrome.enabled\", true);\nuser_pref(\"devtools.debugger.prompt-connection\", false);\nuser_pref(\"devtools.debugger.remote-enabled\", true);\nuser_pref(\"devtools.debugger.workers\", true);\nuser_pref(\"extensions.autoDisableScopes\", 10);\nuser_pref(\"xpinstall.signatures.required\", false);\n";
function isExecutable(path) {
    try {
        fs.accessSync(path, fs.X_OK);
        return true;
    }
    catch (e) {
        return false;
    }
}
function isReadableDirectory(path) {
    try {
        var stat = fs.statSync(path);
        if (!stat.isDirectory) {
            return false;
        }
        fs.accessSync(path, fs.X_OK);
        return true;
    }
    catch (e) {
        return false;
    }
}
function tryConnect(port, retryAfter, tries, resolve, reject) {
    var socket = net.connect(port);
    socket.on('connect', function () { return resolve(socket); });
    socket.on('error', function (err) {
        if (tries > 0) {
            setTimeout(function () { return tryConnect(port, retryAfter, tries - 1, resolve, reject); }, retryAfter);
        }
        else {
            reject(err);
        }
    });
}
//# sourceMappingURL=launcher.js.map