const expoPreset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/packages/"],
  transformIgnorePatterns: [
    expoPreset.transformIgnorePatterns[0].replace("))", "|pitchy))"),
    ...expoPreset.transformIgnorePatterns.slice(1),
  ],
};
