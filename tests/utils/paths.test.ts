import { tildify, displayPath, isUpward } from "../../src/utils/paths";

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

  it("prefers the tilde form when an upward path would spell out the home directory", () => {
    // Directory output written outside the home (a temp scratch dir): relative()
    // climbs to the root and back down through /Users/<name>/..., leaking the
    // username even though every segment is technically relative.
    const tempFrom = "/private/tmp/scratch/out";
    expect(displayPath("/Users/someone/app/brand/icon.svg", tempFrom, true, HOME)).toBe(
      "~/app/brand/icon.svg",
    );
    // With both ends outside the home there is nothing to leak, upward stays upward.
    expect(displayPath("/opt/art/icon.svg", "/opt/out", true, HOME)).toBe("../art/icon.svg");
  });

  it("keeps a directory named like a dotdot segment inside", () => {
    // relative() gives "..old/icon.svg" here: a leading ".." that is part of a
    // real directory name, not an escape. The path is inside, so it must stay
    // relative in both modes rather than fall back to the absolute form.
    const source = "/Users/someone/app/out/..old/icon.svg";
    expect(displayPath(source, "/Users/someone/app/out", true, HOME)).toBe("./..old/icon.svg");
    expect(displayPath(source, "/Users/someone/app/out", false, HOME)).toBe("./..old/icon.svg");
  });
});

describe("isUpward", () => {
  it("counts only a whole dotdot segment as an escape", () => {
    expect(isUpward("..")).toBe(true);
    expect(isUpward("../art/icon.svg")).toBe(true);
    expect(isUpward("..\\art\\icon.svg")).toBe(true);
    expect(isUpward("..old/icon.svg")).toBe(false);
    expect(isUpward("...hidden/icon.svg")).toBe(false);
    expect(isUpward("art/icon.svg")).toBe(false);
  });
});
