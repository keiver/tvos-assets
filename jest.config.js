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
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/check-node-version.ts",
  ],
  coverageThreshold: {
    global: {
      lines: 70,
      branches: 60,
      functions: 70,
      statements: 70,
    },
  },
};
