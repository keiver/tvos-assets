import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SceneAnimation } from "../../src/types";
import { animateTag, expandScene, markCrop, parseSelect, parseViewBox, placeMark, sceneDocument, sceneElements, sceneRules, scenePhase, selectElements } from "../../src/utils/svg-scene";

const EXAMPLE = readFileSync(join(__dirname, "../../examples/scene-artwork/fireflies.svg"), "utf8");

// Two lights in a group, a moon on its own, and a circle in defs that no tag selector may reach.
const SMALL = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
<defs><circle id="tpl" r="1"/></defs>
<rect width="200" height="100" fill="#000"/>
<g id="lights"><g opacity=".5"><circle cx="50" cy="50" r="10" fill="#fff"/></g><g opacity=".5"><circle cx="150" cy="50" r="10" fill="#fff"/></g></g>
<circle id="moon" cx="100" cy="20" r="8" fill="#ff0"/>
</svg>`;

const breathe: SceneAnimation = { select: "#lights g", attributeName: "opacity", values: "0.35;1;0.35", dur: 4, stagger: true };

describe("parseSelect", () => {
  it("reads the three forms", () => {
    expect(parseSelect("#lights")).toEqual({ id: "lights", tag: undefined });
    expect(parseSelect("circle")).toEqual({ id: undefined, tag: "circle" });
    expect(parseSelect("#lights  g")).toEqual({ id: "lights", tag: "g" });
  });

  it("rejects anything else, naming the forms", () => {
    for (const bad of ["g > circle", ".light", "#a #b", "", "#", 5]) {
      expect(() => parseSelect(bad)).toThrow(/not one of #id, tag or #id tag/);
    }
  });
});

describe("sceneElements", () => {
  it("lists every element in document order with its span and ancestry", () => {
    const all = sceneElements(SMALL);
    expect(all.map((e) => e.name)).toEqual(["svg", "defs", "circle", "rect", "g", "g", "circle", "g", "circle", "circle"]);
    const lights = all.find((e) => e.id === "lights") as (typeof all)[number];
    expect(SMALL.slice(lights.start, lights.end)).toMatch(/^<g id="lights">.*<\/g><\/g>$/);
    const moon = all.find((e) => e.id === "moon") as (typeof all)[number];
    expect(moon.selfClosing).toBe(true);
    expect(moon.ancestors).toEqual([0]);
    expect(all[6].ancestors).toEqual([0, 4, 5]);
  });
});

describe("selectElements", () => {
  it("finds an id, a tag outside defs, mask and clipPath, and a tag inside an id", () => {
    expect(selectElements(SMALL, "#moon")).toHaveLength(1);
    expect(selectElements(SMALL, "circle").map((e) => SMALL.slice(e.start, e.start + 12))).toEqual(['<circle cx="', '<circle cx="', '<circle id="']);
    expect(selectElements(SMALL, "#lights g")).toHaveLength(2);
    expect(selectElements(SMALL, "#lights circle")).toHaveLength(2);
    expect(selectElements(EXAMPLE, "#lights g")).toHaveLength(6);
  });

  it("throws when nothing matches, naming the missing id when there is one", () => {
    expect(() => selectElements(SMALL, "#nope g")).toThrow('no element has id="nope"');
    expect(() => selectElements(SMALL, "#moon g")).toThrow("matches nothing");
    expect(() => selectElements(SMALL, "ellipse")).toThrow("matches nothing");
  });
});

describe("scenePhase and animateTag", () => {
  it("spreads staggered matches across dur by the golden ratio, from begin", () => {
    expect(scenePhase(breathe, 0)).toBeCloseTo(0.44, 6);
    expect(scenePhase(breathe, 1)).toBeCloseTo(2.912136, 5);
    expect(scenePhase({ ...breathe, stagger: false }, 3)).toBe(0);
    expect(scenePhase({ ...breathe, begin: 1 }, 0)).toBeCloseTo(1.44, 6);
  });

  it("writes SMIL's own attributes and a negative begin for the phase", () => {
    expect(animateTag({ ...breathe, stagger: false }, 0)).toBe('<animate attributeName="opacity" values="0.35;1;0.35" dur="4s" repeatCount="indefinite"/>');
    expect(animateTag(breathe, 1)).toContain('begin="-2.9121s"');
    const full = animateTag({ select: "g", attributeName: "cy", values: "0;-10;0", dur: 10, keyTimes: "0;0.5;1", calcMode: "spline", keySplines: "0.4 0 0.6 1;0.4 0 0.6 1", additive: "sum" }, 0);
    expect(full).toBe('<animate attributeName="cy" values="0;-10;0" dur="10s" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" additive="sum" repeatCount="indefinite"/>');
  });
});

describe("expandScene", () => {
  it("writes each rule's animate as the first child of every match, opening self-closing elements", () => {
    const out = expandScene(SMALL, [breathe, { select: "#moon", attributeName: "r", values: "8;10;8", dur: 2 }]);
    expect(out).toContain('<g opacity=".5"><animate attributeName="opacity" values="0.35;1;0.35" dur="4s" begin="-0.44s" repeatCount="indefinite"/><circle cx="50"');
    expect(out).toContain('<g opacity=".5"><animate attributeName="opacity" values="0.35;1;0.35" dur="4s" begin="-2.9121s" repeatCount="indefinite"/><circle cx="150"');
    expect(out).toContain('<circle id="moon" cx="100" cy="20" r="8" fill="#ff0"><animate attributeName="r" values="8;10;8" dur="2s" repeatCount="indefinite"/></circle>');
    expect(out.match(/<animate /g)).toHaveLength(3);
  });

  it("stacks several rules on one element and leaves a file alone without rules", () => {
    const out = expandScene(SMALL, [breathe, { ...breathe, attributeName: "transform" }]);
    expect(out.match(/<g opacity="\.5"><animate [^>]*opacity[^>]*\/><animate [^>]*transform/g)).toHaveLength(2);
    expect(expandScene(SMALL)).toBe(SMALL);
    expect(expandScene(SMALL, [])).toBe(SMALL);
  });
});

describe("sceneRules", () => {
  const svg = (inner: string, root = 'width="200" height="100" viewBox="0 0 200 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${inner}</svg>`;

  it("reads the viewBox, or makes one from width and height", () => {
    expect(sceneRules(SMALL).viewBox).toBe("0 0 200 100");
    expect(sceneRules(svg("", 'width="640" height="360"')).viewBox).toBe("0 0 640 360");
    expect(() => sceneRules(svg("", 'width="100%" height="100%"'))).toThrow("needs a viewBox");
  });

  it("lists every animation's period and checks each divides the loop", () => {
    const two = svg('<circle r="1"><animate attributeName="r" values="1;2" dur="4s"/></circle><g><animateTransform attributeName="transform" type="rotate" values="0;360" dur="500ms"/></g>');
    expect(sceneRules(two).periods).toEqual([4, 0.5]);
    expect(sceneRules(two, 20).periods).toEqual([4, 0.5]);
    expect(() => sceneRules(two, 6)).toThrow("lasts 4 s, which does not divide the 6 s loop");
    expect(() => sceneRules(svg('<circle r="1"><animate attributeName="r" values="1;2"/></circle>'))).toThrow("has no dur");
  });

  it("refuses text, scripts, outside images and CSS keyframes", () => {
    expect(() => sceneRules(svg("<text>Hi</text>"))).toThrow("<text>");
    expect(() => sceneRules(svg("<script>1</script>"))).toThrow("<script>");
    expect(() => sceneRules(svg('<image href="https://example.com/a.png"/>'))).toThrow("outside the file");
    expect(sceneRules(svg('<image href="data:image/png;base64,AAAA"/>')).periods).toEqual([]);
    expect(() => sceneRules(svg("<style>@keyframes a{}</style>"))).toThrow("@keyframes");
  });
});

describe("placeMark", () => {
  // A 10x10 mark with ids a scene could also use, a gradient reference and a <use>.
  const MARK = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none" role="img">
<defs><radialGradient id="halo"><stop stop-color="#fff"/></radialGradient><circle id="dot" r="1"/></defs>
<circle cx="5" cy="5" r="5" fill="url(#halo)"/><use href="#dot" x="5" y="5"/>
</svg>`;
  const art = { svg: MARK, viewBox: { x: 0, y: 0, width: 10, height: 10 }, borderRadius: 0 };

  it("maps the canvas box into the scene's units through the cover fit and fits the mark into it", () => {
    // SMALL is 200x100 units on a 400x400 canvas: scale 4 (the height fills), 200 px of the scene cut off each side.
    const out = placeMark(SMALL, art, { x: 80, y: 30, width: 40, height: 40 }, { width: 400, height: 400 });
    // Box in units: x = (80 + 200) / 4 = 70, y = 30 / 4 = 7.5, 10 wide; the 10 unit mark fits it at scale 1.
    expect(out).toContain('<g id="mark" fill="none" transform="translate(70 7.5) scale(1)" clip-path="url(#mark-clip)">');
    expect(out).toContain('<clipPath id="mark-clip"><rect x="0" y="0" width="10" height="10"/></clipPath>');
    expect(out.indexOf('<g id="mark"')).toBeLessThan(out.lastIndexOf("</svg>"));
    // The mark's prolog goes; the scene keeps its own.
    expect(out.match(/<\?xml/g)).toHaveLength(1);
  });

  it("prefixes the mark's ids and references so they cannot collide with the scene's", () => {
    const out = placeMark(SMALL, art, { x: 80, y: 30, width: 40, height: 40 }, { width: 400, height: 400 });
    expect(out).toContain('<radialGradient id="mark-halo">');
    expect(out).toContain('fill="url(#mark-halo)"');
    expect(out).toContain('<use href="#mark-dot"');
    expect(out).toContain('<circle id="moon"');
  });

  it("crops to the content box, rounds by the icon's radius and draws a PNG mark as an image", () => {
    // A content box of 512 of 1024 centred: the middle half of the mark, 5 units wide from (2.5, 2.5).
    const crop = markCrop({ ...art, content: { left: 256, top: 256, size: 512 } });
    expect(crop).toEqual({ x: 2.5, y: 2.5, width: 5, height: 5 });
    const png = { png: Buffer.from("png"), viewBox: { x: 0, y: 0, width: 100, height: 50 }, content: { left: 0, top: 256, size: 512 }, sourceSize: 50, borderRadius: 10 };
    const out = placeMark(SMALL, png, { x: 0, y: 0, width: 200, height: 200 }, { width: 200, height: 100 });
    // The canvas is the scene's own size, so the 200 px box is 200 units; the 50 unit crop scales by 4 from the origin; rx = 10/50 * 50.
    expect(markCrop(png)).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(out).toContain('transform="translate(0 0) scale(4)"');
    expect(out).toContain('<rect x="0" y="0" width="50" height="50" rx="10"/>');
    expect(out).toContain('<image href="data:image/png;base64,cG5n" x="0" y="0" width="100" height="50"/>');
  });

  it("reads a viewBox", () => {
    expect(parseViewBox(" 0 0 1920 823 ")).toEqual({ x: 0, y: 0, width: 1920, height: 823 });
    expect(parseViewBox("-5,10,20,30")).toEqual({ x: -5, y: 10, width: 20, height: 30 });
  });
});

describe("sceneDocument", () => {
  it("inlines the SVG at the canvas size, cover-fitted, with the prolog gone", () => {
    const html = sceneDocument(SMALL, 400, 400);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("<?xml");
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice">');
    expect(html).toContain('<circle id="moon"');
  });
});
