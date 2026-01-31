/** @type {import('jest').Config} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};
