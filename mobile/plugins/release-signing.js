// Release builds are signed with the upload key when ~/.gradle/gradle.properties names it
// (REPVYN_UPLOAD_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD); without it they fall back to the debug key.
// The key and its passwords stay outside the repo. Added to android/app/build.gradle on every prebuild.
const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE = `
        release {
            if (project.hasProperty('REPVYN_UPLOAD_STORE_FILE')) {
                storeFile file(REPVYN_UPLOAD_STORE_FILE)
                storePassword REPVYN_UPLOAD_STORE_PASSWORD
                keyAlias REPVYN_UPLOAD_KEY_ALIAS
                keyPassword REPVYN_UPLOAD_KEY_PASSWORD
            }
        }`;

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes("REPVYN_UPLOAD_STORE_FILE")) return c;
    g = g.replace(/(signingConfigs\s*\{\s*\n\s*debug\s*\{[^}]*\})/, `$1${RELEASE}`);
    g = g.replace(/(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/, "$1signingConfig project.hasProperty('REPVYN_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
    c.modResults.contents = g;
    return c;
  });
