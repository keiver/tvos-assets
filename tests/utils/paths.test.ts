import { tildify, displayPath } from "../../src/utils/paths";

const HOME = "/Users/someone";

describe("tildify", () => {
  it("replaces a leading home directory", () => {
    expect(tildify("/Users/someone/projects/app/icon.png", HOME)).toBe("~/projects/app/icon.png");
  });

  it("collapses the home directory itself", () => {
    expect(tildify("/Users/someone", HOME)).toBe("~");
  });

  it("leaves unrelated absolute paths alone", () => {
    expect(tildify("/opt/assets/icon.png", HOME)).toBe("/opt/assets/icon.png");
    expect(tildify("/var/tmp/x.png", HOME)).toBe("/var/tmp/x.png");
  });

  it("does not match a sibling directory that merely shares the prefix", () => {
    // /Users/someone-else must not become ~-else
    expect(tildify("/Users/someone-else/icon.png", HOME)).toBe("/Users/someone-else/icon.png");
  });

  it("leaves relative paths alone", () => {
    expect(tildify("./brand/icon.svg", HOME)).toBe("./brand/icon.svg");
  });

  it("accepts a backslash boundary and normalises it, so Windows paths still yield ~/", () => {
    // shellQuote only leaves a tilde unquoted when it sees "~/", so emitting
    // "~\..." would end up a literal tilde in the recorded command.
    expect(tildify("C:\\Users\\someone\\app\\icon.png", "C:\\Users\\someone")).toBe("~/app/icon.png");
  });

  it("tildifies when the path and the home directory disagree on separator", () => {
    expect(tildify("/Users/someone\\app\\icon.png", HOME)).toBe("~/app/icon.png");
  });

  it("still refuses a prefix match that is not a path boundary, on either separator", () => {
    expect(tildify("C:\\Users\\someone-else\\icon.png", "C:\\Users\\someone")).toBe(
      "C:\\Users\\someone-else\\icon.png",
    );
  });
});

describe("displayPath", () => {
  const from = "/Users/someone/app/output";

  it("shows files under the reference directory as ./", () => {
    expect(displayPath("/Users/someone/app/output/icon.png", from, false)).toBe("./icon.png");
    expect(displayPath("/Users/someone/app/output/Images.xcassets/a.png", from, false)).toBe(
      "./Images.xcassets/a.png",
    );
  });

  it("shows the reference directory itself as a dot", () => {
    expect(displayPath(from, from, false)).toBe(".");
  });

  it("walks upward only when that stays meaningful", () => {
    const source = "/Users/someone/app/brand/icon.svg";
    // Directory output keeps its neighbours, so ../ is still correct.
    expect(displayPath(source, from, true)).toBe("../brand/icon.svg");
    // Zip output is built in a temp dir, where ../ would be nonsense.
    expect(displayPath(source, from, false, HOME)).toBe("~/app/brand/icon.svg");
  });

  it("never emits the home directory", () => {
    for (const allowUpward of [true, false]) {
      const rendered = displayPath("/Users/someone/elsewhere/icon.png", from, allowUpward, HOME);
      expect(rendered).not.toContain("/Users/someone");
    }
  });
});
