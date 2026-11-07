const expoPreset = require("jest-expo/jest-preset");

module.exports = {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/packages/"],
  transformIgnorePatterns: [
    expoPreset.transformIgnorePatterns[0].replace("))", "|pitchy))"),
    ...expoPreset.transformIgnorePatterns.slice(1),
  ],
  // RNTL v14 render tests are heavy; cap workers + raise the timeout so they
  // don't starve and trip the default budget on low-core / CI machines.
  maxWorkers: 2,
  testTimeout: 30000,
};
