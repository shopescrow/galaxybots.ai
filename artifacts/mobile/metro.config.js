const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.cacheVersion = "gb-mobile-v1";

config.maxWorkers = 2;

module.exports = config;
