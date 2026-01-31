export declare function ensureDir(dirPath: string): void;
export declare function cleanDir(dirPath: string): void;
/** Write a Contents.json with Xcode-style formatting (space before colon, trailing newline) */
export declare function writeContentsJson(filePath: string, data: unknown): void;
/** Write a buffer to a file with contextual error handling */
export declare function safeWriteFile(filePath: string, data: Buffer): void;
//# sourceMappingURL=fs.d.ts.map