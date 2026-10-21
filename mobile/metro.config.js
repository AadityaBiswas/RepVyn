// The app imports the shared engine and screen logic from the repo root (../src, ../shared, ../catalog, ../params).
// Real paths, so a build run from a short mapped drive (subst R:, for Windows' path limit) resolves the same files.
const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const here = fs.realpathSync.native(__dirname);
const root = path.resolve(here, "..");
const config = getDefaultConfig(here);
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(here, "node_modules"), path.resolve(root, "node_modules")];
module.exports = config;
