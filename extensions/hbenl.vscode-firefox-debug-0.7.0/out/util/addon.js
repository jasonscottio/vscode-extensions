"use strict";
var os = require('os');
var path = require('path');
var fs = require('fs');
var child_process_1 = require('child_process');
var uuid = require('node-uuid');
var semver = require('semver');
var FirefoxProfile = require('firefox-profile');
var getJetpackAddonId = require('jetpack-id');
var zipdir = require('zip-dir');
/**
 * Returns either true and the addonId or false and an error message
 */
function findAddonId(addonType, addonPath) {
    var manifestPath;
    var manifest;
    switch (addonType) {
        case 'legacy':
            manifestPath = path.join(addonPath, 'install.rdf');
            try {
                fs.accessSync(manifestPath, fs.R_OK);
            }
            catch (err) {
                return [false, ("Couldn't read " + manifestPath)];
            }
            return [true, getLegacyAddonId(addonPath)];
        case 'addonSdk':
            manifestPath = path.join(addonPath, 'package.json');
            try {
                fs.accessSync(manifestPath, fs.R_OK);
            }
            catch (err) {
                return [false, ("Couldn't read " + manifestPath)];
            }
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            return [true, getJetpackAddonId(manifest)];
        case 'webExtension':
            manifestPath = path.join(addonPath, 'manifest.json');
            try {
                fs.accessSync(manifestPath, fs.R_OK);
            }
            catch (err) {
                return [false, ("Couldn't read " + manifestPath)];
            }
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            var addonId = (((manifest || {}).applications || {}).gecko || {}).id;
            if (!addonId) {
                return [false, ("Please define your addonId (as applications.gecko.id) in " + manifestPath)];
            }
            return [true, addonId];
    }
}
exports.findAddonId = findAddonId;
function installAddon(addonType, addonId, addonDir, profileDir) {
    var destDir = path.join(profileDir, 'extensions');
    var destFile = path.join(destDir, addonId + ".xpi");
    try {
        fs.mkdirSync(destDir);
    }
    catch (e) { }
    switch (addonType) {
        case 'legacy':
        case 'webExtension':
            return new Promise(function (resolve, reject) {
                zipdir(addonDir, { saveTo: destFile }, function (err, buffer) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(undefined);
                    }
                });
            });
        case 'addonSdk':
            return createJetpackXpi(addonDir, destFile);
    }
}
exports.installAddon = installAddon;
function createJetpackXpi(addonDir, destFile) {
    return new Promise(function (resolve, reject) {
        try {
            var tempXpiDir = path.join(os.tmpdir(), "jpm-" + uuid.v4());
            fs.mkdirSync(tempXpiDir);
            var jpmVersion = child_process_1.execSync('jpm -V', { encoding: 'utf8' });
            jpmVersion = jpmVersion.trim();
            if (semver.lt(jpmVersion, '1.2.0')) {
                reject("Please install a newer version of jpm (You have " + jpmVersion + ", but 1.2.0 or newer is required)");
            }
            child_process_1.execSync("jpm xpi --dest-dir \"" + tempXpiDir + "\"", { cwd: addonDir });
            var tempXpiFile = path.join(tempXpiDir, fs.readdirSync(tempXpiDir)[0]);
            fs.renameSync(tempXpiFile, destFile);
            fs.rmdirSync(tempXpiDir);
            resolve();
        }
        catch (err) {
            reject("Couldn't run jpm: " + err.stderr);
        }
    });
}
exports.createJetpackXpi = createJetpackXpi;
// we perform some Voodoo tricks to extract the private _addonDetails method
// (which uses the _sanitizePref method) from FirefoxProfile
function FirefoxProfileVoodoo() { }
FirefoxProfileVoodoo.prototype._addonDetails = FirefoxProfile.prototype._addonDetails;
FirefoxProfileVoodoo.prototype._sanitizePref = FirefoxProfile.prototype._sanitizePref;
// and now more Voodoo tricks to turn the (blocking) callback-based method
// into a simple synchronous method
function getLegacyAddonId(addonPath) {
    var addonDetails;
    var voodoo = new FirefoxProfileVoodoo();
    voodoo._addonDetails(addonPath, function (result) { return addonDetails = result; });
    return addonDetails.id;
}
//# sourceMappingURL=addon.js.map