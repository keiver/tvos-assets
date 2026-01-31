import { writeContentsJson, safeWriteFile } from "../../src/utils/fs";

// Mock node:fs to simulate write errors — can't reliably trigger ENOSPC/EACCES in CI
jest.mock("node:fs", () => {
  const actual = jest.requireActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    writeFileSync: jest.fn(actual.writeFileSync),
  };
});

import { writeFileSync } from "node:fs";
const mockedWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;

afterEach(() => {
  mockedWriteFileSync.mockReset();
  // Restore real implementation for other test files sharing the process
  mockedWriteFileSync.mockImplementation(
    jest.requireActual<typeof import("node:fs")>("node:fs").writeFileSync,
  );
});

function makeErrno(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("writeContentsJson error handling", () => {
  it("maps ENOSPC to a disk-full message", () => {
    mockedWriteFileSync.mockImplementation(() => {
      throw makeErrno("ENOSPC", "no space left on device");
    });
    expect(() => writeContentsJson("/out/Contents.json", { info: {} })).toThrow(
      "Disk full — could not write: /out/Contents.json",
    );
  });

  it("maps EACCES to a permission-denied message", () => {
    mockedWriteFileSync.mockImplementation(() => {
      throw makeErrno("EACCES", "permission denied");
    });
    expect(() => writeContentsJson("/out/Contents.json", { info: {} })).toThrow(
      "Permission denied — could not write: /out/Contents.json",
    );
  });

  it("maps EPERM to a permission-denied message", () => {
    mockedWriteFileSync.mockImplementation(() => {
      throw makeErrno("EPERM", "operation not permitted");
    });
    expect(() => writeContentsJson("/out/Contents.json", { info: {} })).toThrow(
      "Permission denied — could not write: /out/Contents.json",
    );
  });

  it("preserves the original message for unknown errors", () => {
    mockedWriteFileSync.mockImplementation(() => {
      throw new Error("something unexpected");
    });
    expect(() => writeContentsJson("/out/Contents.json", { info: {} })).toThrow(
      "Failed to write /out/Contents.json: something unexpected",
    );
  });
});

describe("safeWriteFile error handling", () => {
  it("maps ENOSPC to a disk-full message for PNG writes", () => {
    mockedWriteFileSync.mockImplementation(() => {
      throw makeErrno("ENOSPC", "no space left on device");
    });
    expect(() => safeWriteFile("/out/icon.png", Buffer.from([]))).toThrow(
      "Disk full — could not write: /out/icon.png",
    );
  });
});
