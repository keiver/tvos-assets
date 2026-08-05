const BIN_NAME = "tvos-assets";

/**
 * Characters that survive a shell unquoted. Everything else gets single quotes,
 * notably `#`, which would otherwise start a comment and silently swallow the
 * rest of a pasted command: `--color #F39C12` is the common case.
 */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

export function shellQuote(arg: string): string {
  if (arg === "") return "''";
  return SHELL_SAFE.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Reconstruct the invocation for the preview page.
 *
 * Only the arguments are used: argv[0] and argv[1] are the node binary and the
 * script path, which describe how this process happened to start rather than
 * how the user invoked the tool. Rendering the bin name instead keeps the line
 * copy-pasteable for anyone with the package installed.
 */
export function formatCommand(args: string[]): string {
  return [BIN_NAME, ...args.map(shellQuote)].join(" ");
}
