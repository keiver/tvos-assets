import { homedir } from "node:os";
import { relative } from "node:path";

/**
 * Replace a leading home directory with `~`.
 *
 * Generated artifacts get committed and shared, and an absolute path bakes the
 * machine's username into them. `~` stays readable, stays valid in a shell, and
 * says nothing about who ran the tool.
 */
export function tildify(path: string, home: string = homedir()): string {
  if (!home || !path.startsWith(home)) return path;
  const rest = path.slice(home.length);
  if (rest === "") return "~";
  // Accept either separator rather than the running platform's. A path and the
  // home directory can disagree on separator, and testing only `sep` would both
  // miss those and emit `~\...` on Windows, which shellQuote's `~/` handling
  // would then fail to recognise and quote into a literal tilde.
  if (rest[0] !== "/" && rest[0] !== "\\") return path;
  return `~${toPosix(rest)}`;
}

/** Render with posix separators, so paths read the same on every platform. */
function toPosix(path: string): string {
  return path.split(/[\\/]/).join("/");
}

/**
 * Does a `relative()` result climb out of its reference directory?
 *
 * Only a whole `..` segment escapes. A directory may legitimately be named
 * `..old`, and a plain `startsWith("..")` reads that as an escape, pushing a
 * path that is really inside the output onto the absolute form. Either
 * separator is accepted, for the reason `tildify` accepts either.
 */
export function isUpward(rel: string): boolean {
  return rel === ".." || rel.startsWith("../") || rel.startsWith("..\\");
}

/**
 * How a path should be shown on a generated page.
 *
 * Prefers a path relative to where the page lives, which is both shorter and
 * portable. `allowUpward` is for output that keeps its neighbours (a directory
 * write), where `../brand/icon.svg` is still meaningful; a zip is built in a
 * temp directory, so an upward path there would be nonsense and the tilde form
 * is used instead.
 */
export function displayPath(
  path: string,
  from: string,
  allowUpward: boolean,
  home: string = homedir(),
): string {
  const rel = relative(from, path);
  if (rel === "") return "."; // the reference directory itself
  if (!isUpward(rel)) return `./${toPosix(rel)}`;
  // An upward path is only acceptable while it cannot spell out the home
  // directory. From outside the home into it, `relative()` climbs to the root
  // and back down through /Users/<name>/... — the exact leak tildify exists to
  // stop — so the tilde form wins there. (tildify(x) !== x is the same
  // separator-safe "is under home" test tildify itself applies.)
  const targetInHome = tildify(path, home) !== path;
  const fromInHome = tildify(from, home) !== from;
  if (allowUpward && !(targetInHome && !fromInHome)) return toPosix(rel);
  return tildify(path, home);
}
