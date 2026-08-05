import { homedir } from "node:os";
import { join } from "node:path";
import { formatCommand, shellQuote } from "../../src/cli/format-command";

describe("shellQuote", () => {
  it("leaves shell-safe arguments bare", () => {
    for (const arg of ["--icon", "./brand/icon.svg", "1x,2x", "a=b", "/abs/path.png", "--set", "300"]) {
      expect(shellQuote(arg)).toBe(arg);
    }
  });

  it("quotes hex colors, which would otherwise start a shell comment", () => {
    expect(shellQuote("#F39C12")).toBe("'#F39C12'");
  });

  it("quotes anything with whitespace or shell metacharacters", () => {
    expect(shellQuote("App Icon")).toBe("'App Icon'");
    expect(shellQuote("a;rm -rf b")).toBe("'a;rm -rf b'");
    expect(shellQuote("a$(b)")).toBe("'a$(b)'");
    expect(shellQuote("a|b")).toBe("'a|b'");
    expect(shellQuote("*")).toBe("'*'");
  });

  it("escapes embedded single quotes so the result stays one argument", () => {
    // Close the quote, emit an escaped quote, reopen: 'it'\''s'
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("renders an empty argument explicitly rather than dropping it", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("formatCommand", () => {
  it("renders the bin name with no arguments", () => {
    expect(formatCommand([])).toBe("tvos-assets");
  });

  it("renders a full invocation, quoting only what needs it", () => {
    expect(
      formatCommand([
        "--icon", "./brand/icon.svg",
        "--background", "./brand/background.png",
        "--color", "#F39C12",
        "--out-dir", "./out",
      ]),
    ).toBe(
      "tvos-assets --icon ./brand/icon.svg --background ./brand/background.png " +
        "--color '#F39C12' --out-dir ./out",
    );
  });

  it("tildifies home paths so a committed page carries no username", () => {
    const home = homedir();
    const rendered = formatCommand(["--icon", join(home, "app", "icon.png")]);
    expect(rendered).toBe("tvos-assets --icon ~/app/icon.png");
    expect(rendered).not.toContain(home);
  });

  it("keeps a tilde outside the quotes so the shell still expands it", () => {
    // '~/my project/icon.png' would be a literal tilde; ~/'my project/...' is not.
    expect(shellQuote("~/my project/icon.png")).toBe("~/'my project/icon.png'");
  });

  it("uses the bin name rather than the argv script path", () => {
    // argv[0]/argv[1] describe how this process started, not how the tool was
    // invoked, so they are never part of the recorded command.
    const rendered = formatCommand(["--quiet"]);
    expect(rendered).toBe("tvos-assets --quiet");
    expect(rendered).not.toContain("node");
    expect(rendered).not.toContain("index.ts");
  });
});
