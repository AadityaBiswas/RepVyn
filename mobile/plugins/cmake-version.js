// The native build on Windows needs CMake 3.31+: its ninja (1.12) honours Windows long paths, and the generated sources of
// react-native-safe-area-context sit past the 260-character limit. The Android SDK's default, 3.22, fails there.
// Install it once with: sdkmanager "cmake;3.31.6". Added to android/app/build.gradle on every prebuild.
const { withAppBuildGradle } = require("expo/config-plugins");

const CMAKE = "3.31.6";

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(`version "${CMAKE}"`)) {
      c.modResults.contents = c.modResults.contents.replace(/\n(\s*)namespace /, (m, pad) => `\n${pad}externalNativeBuild { cmake { version "${CMAKE}" } }${m}`);
    }
    return c;
  });
