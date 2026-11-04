const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// npm workspaces: allow Metro to watch and resolve files outside the app root
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(projectRoot, "packages", "hmp", "node_modules"),
];

// The bundled SpessaSynth script + its AudioWorklet processor ship as `.txt`
// assets (copied verbatim, read at runtime) rather than parsed as source.
config.resolver.assetExts = [...config.resolver.assetExts, "txt"];
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== "txt");

module.exports = config;
