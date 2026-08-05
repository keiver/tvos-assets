import { homedir } from "node:os";
import { relative, sep } from "node:path";

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
  return rest.startsWith(sep) ? `~${rest}` : path;
}

/** Render with posix separators, so paths read the same on every platform. */
function toPosix(path: string): string {
  return path.split(sep).join("/");
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
  if (!rel.startsWith("..")) return `./${toPosix(rel)}`;
  if (allowUpward) return toPosix(rel);
  return tildify(path, home);
}
