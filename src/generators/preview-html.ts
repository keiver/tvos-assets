import type { TvOSImageCreatorConfig } from "../types.js";
import type { PreviewGroup, PreviewInput } from "./preview.js";

export interface RenderPreviewOptions {
  groups: PreviewGroup[];
  inputs: PreviewInput[];
  images: Map<string, string>;
  config: TvOSImageCreatorConfig;
  platforms: string[];
  toolVersion?: string;
  command?: string;
  configPath?: string;
  generatedAt: string;
  totals: { files: number; images: number };
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep a data URI safe to drop inside a CSS url("...") token. */
function cssUrl(dataUri: string): string {
  return `url("${dataUri.replace(/["\\]/g, "")}")`;
}

/** Hex is validated upstream, but never inline anything unvetted into a stylesheet. */
function safeHex(hex: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
}

const STYLES = `
*, *::before, *::after { box-sizing: border-box; }
:root {
  color-scheme: light dark;
  --paper: #f7f6f3;
  --ink: #16161a;
  --ink-dim: #6d6d78;
  --rule: rgba(20, 20, 26, 0.16);
  --checker: rgba(20, 20, 26, 0.07);
  --sunken: rgba(20, 20, 26, 0.045);
}
:root[data-theme="dark"] {
  --paper: #0b0b0d;
  --ink: #eceae4;
  --ink-dim: #85858f;
  --rule: rgba(236, 234, 228, 0.18);
  --checker: rgba(236, 234, 228, 0.09);
  --sunken: rgba(236, 234, 228, 0.055);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #0b0b0d;
    --ink: #eceae4;
    --ink-dim: #85858f;
    --rule: rgba(236, 234, 228, 0.18);
    --checker: rgba(236, 234, 228, 0.09);
    --sunken: rgba(236, 234, 228, 0.055);
  }
}
body {
  margin: 0;
  padding: 0 clamp(20px, 5vw, 64px) 96px;
  background: var(--paper);
  color: var(--ink);
  font: 400 13px/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  -webkit-font-smoothing: antialiased;
}
.sheet { max-width: 1180px; margin: 0 auto; }

/* ---- masthead ---- */
.masthead {
  display: flex; flex-wrap: wrap; gap: 24px;
  align-items: flex-end; justify-content: space-between;
  padding: 56px 0 20px;
  border-bottom: 2px solid var(--ink);
}
.wordmark { font-size: 28px; letter-spacing: -0.03em; font-weight: 600; }
.wordmark b { color: var(--accent); font-weight: 600; }
.tagline { color: var(--ink-dim); margin-top: 6px; font-size: 12px; }
.theme-toggle {
  font: inherit; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink); background: none; border: 1px solid var(--rule);
  padding: 7px 13px; cursor: pointer;
}
.theme-toggle:hover { border-color: var(--ink); }

/* ---- run metadata ---- */
.meta {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 2px 32px; padding: 20px 0 40px; border-bottom: 1px solid var(--rule);
  font-size: 12px;
}
.meta div { display: flex; gap: 10px; padding: 3px 0; min-width: 0; }
.meta dt { color: var(--ink-dim); flex: 0 0 88px; }
.meta dd { margin: 0; overflow-wrap: anywhere; }
.chip {
  display: inline-block; width: 10px; height: 10px;
  vertical-align: -1px; margin-right: 6px; border: 1px solid var(--rule);
}

/* ---- how this was made ---- */
.provenance { padding: 34px 0 4px; }
.provenance h2 {
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-dim); margin: 0 0 12px; font-weight: 400;
}
.provenance + .provenance { padding-top: 26px; }
.inputs {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 22px 20px;
}
.inputs .frame { height: 116px; }
.inputs .role { display: block; color: var(--accent); }
pre.cmd {
  margin: 0; padding: 14px 16px; overflow-x: auto;
  background: var(--sunken); border-left: 2px solid var(--accent);
  font: inherit; font-size: 12px; line-height: 1.6;
}
details.config { margin-top: 18px; }
details.config > summary {
  cursor: pointer; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-dim); padding: 6px 0;
}
details.config > summary:hover { color: var(--ink); }
details.config pre {
  margin: 10px 0 0; padding: 14px 16px; max-height: 420px; overflow: auto;
  background: var(--sunken); font: inherit; font-size: 11px; line-height: 1.55;
}

/* ---- sections ---- */
section { padding-top: 44px; }
.section-head {
  display: flex; align-items: baseline; gap: 12px;
  padding-bottom: 12px; border-bottom: 1px solid var(--rule);
}
.section-index { color: var(--accent); font-size: 11px; }
.section-title { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; }
.section-path { color: var(--ink-dim); font-size: 11px; margin-left: auto; overflow-wrap: anywhere; }

/* ---- contact sheet ----
   A uniform grid rather than intrinsically sized figures. Letting each asset
   size itself gave ragged rows, orphaned tiles, and captions at a dozen
   different heights. Equal cells keep captions on a shared line and reflow
   cleanly at any width; the true dimensions live in the caption, and the
   aspect ratio stays visible because the image is contained in its cell. */
.row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(184px, 1fr));
  gap: 26px 22px;
  padding: 26px 0 4px;
}
figure { margin: 0; min-width: 0; }
.frame {
  width: 100%; height: 148px;
  background-color: var(--paper);
  background-repeat: no-repeat; background-position: center; background-size: contain;
  outline: 1px solid var(--rule);
}
/* Image layer is declared first so it paints above the checkerboard revealing its alpha. */
.frame.alpha {
  background-repeat: no-repeat, repeat;
  background-size: contain, 16px 16px;
  background-position: center, 0 0;
}
/* Thumbnails are downscaled WebP; the link opens the real file on disk. */
a.open { display: block; text-decoration: none; color: inherit; position: relative; }
a.open:hover .frame, a.open:focus-visible .frame { outline-color: var(--accent); outline-width: 2px; }
a.open:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
a.open::after {
  content: "open";
  position: absolute; right: 6px; bottom: 6px;
  padding: 2px 6px; font-size: 10px; letter-spacing: 0.06em;
  background: var(--accent); color: #16161a;
  opacity: 0; transition: opacity 120ms;
}
a.open:hover::after, a.open:focus-visible::after { opacity: 1; }
@media (hover: none) { a.open::after { opacity: 1; } }

figcaption { padding-top: 9px; font-size: 11px; }
figcaption .name { display: block; overflow-wrap: anywhere; }
figcaption .dims { display: block; color: var(--ink-dim); }
figcaption .note { color: var(--accent); }

/* ---- parallax ---- */
.parallax-block {
  display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
  align-items: start; gap: 26px; padding: 26px 0 0;
}
.parallax {
  position: relative; overflow: hidden; outline: 1px solid var(--rule);
  perspective: 900px; touch-action: none; width: 100%;
}
.parallax .layer {
  position: absolute; inset: 0;
  background-repeat: no-repeat; background-position: center; background-size: cover;
  transition: transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: transform;
}
.parallax[data-active="1"] .layer { transition: transform 90ms linear; }
.hint { margin: 0; font-size: 11px; color: var(--ink-dim); }
.hint b { color: var(--ink); font-weight: 400; }

/* ---- colorset ---- */
.swatches {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 26px 22px; padding: 26px 0 4px;
}
.swatch-chip { width: 100%; height: 84px; outline: 1px solid var(--rule); }

footer {
  margin-top: 64px; padding-top: 16px; border-top: 1px solid var(--rule);
  color: var(--ink-dim); font-size: 11px;
  display: flex; flex-wrap: wrap; gap: 8px 24px;
}
footer a { color: var(--ink); }

@media (prefers-reduced-motion: reduce) {
  .parallax .layer { transition: none; }
}

/* ---- narrow screens ----
   One full-width column, still left aligned. Centring was tried and read badly:
   ragged right edges in monospace are hard to scan, and it broke the flush left
   margin the rest of the sheet is built on. Section headers wrap so the catalog
   path sits under its title instead of being squeezed against it, and the
   parallax caption moves below its stack rather than into a sliver. */
@media (max-width: 640px) {
  body { padding: 0 18px 64px; }
  .masthead { padding-top: 36px; }
  .meta { grid-template-columns: 1fr; gap: 0; }
  .section-head { flex-wrap: wrap; }
  .section-path { margin-left: 0; width: 100%; }
  .row, .swatches, .parallax-block { grid-template-columns: minmax(0, 1fr); }
  /* A full-width tile needs more height or the image floats in a letterbox. */
  .frame { height: 200px; }
}
`;

const SCRIPT = `
(function () {
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  function current() {
    return root.dataset.theme ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function label() { toggle.textContent = current() === "dark" ? "Light" : "Dark"; }
  toggle.addEventListener("click", function () {
    root.dataset.theme = current() === "dark" ? "light" : "dark";
    label();
  });
  label();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Depth grows front to back of the DOM, matching how tvOS lifts the top layer.
  Array.prototype.forEach.call(document.querySelectorAll(".parallax"), function (stack) {
    var layers = Array.prototype.slice.call(stack.querySelectorAll(".layer"));
    function move(event) {
      var box = stack.getBoundingClientRect();
      var x = (event.clientX - box.left) / box.width - 0.5;
      var y = (event.clientY - box.top) / box.height - 0.5;
      stack.dataset.active = "1";
      layers.forEach(function (layer, index) {
        var depth = index / Math.max(1, layers.length - 1);
        var shift = depth * 22;
        var scale = 1 + depth * 0.04;
        layer.style.transform =
          "translate3d(" + (-x * shift).toFixed(2) + "px," + (-y * shift).toFixed(2) + "px,0)" +
          " rotateX(" + (y * -5).toFixed(2) + "deg) rotateY(" + (x * 5).toFixed(2) + "deg)" +
          " scale(" + scale.toFixed(3) + ")";
      });
    }
    function reset() {
      stack.dataset.active = "0";
      layers.forEach(function (layer) { layer.style.transform = ""; });
    }
    stack.addEventListener("pointermove", move);
    stack.addEventListener("pointerleave", reset);
    stack.addEventListener("pointercancel", reset);
  });
})();
`;

/** CSS aspect-ratio for an asset, so it scales with its column instead of being pinned to pixels. */
function aspectRatio(width: number, height: number): string {
  return width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
}

/**
 * The inputs, the command, and the resolved config: enough for someone holding
 * only this file to see what went in and reproduce the run.
 */
/** Wrap a frame in a link to the real file, when we know where it lives. */
function linked(href: string | undefined, label: string, frame: string): string {
  if (!href) return frame;
  return `<a class="open" href="${esc(href)}" target="_blank" rel="noopener"
        title="Open ${esc(label)}">${frame}</a>`;
}

function renderProvenance(options: RenderPreviewOptions): string {
  const parts: string[] = [];

  if (options.inputs.length > 0) {
    const figures = options.inputs
      .map(
        (input) => `<figure>
      ${linked(
        input.href,
        input.filename,
        `<div class="frame${input.hasAlpha ? " alpha" : ""}" role="img" aria-label="${esc(input.filename)}"
           style="background-image:${
             input.hasAlpha ? `var(--${input.imageKey}),var(--checkers)` : `var(--${input.imageKey})`
           }"></div>`,
      )}
      <figcaption><span class="role">${esc(input.role)}</span>
        <span class="name">${esc(input.filename)}</span>
        <span class="dims">${input.vector ? "vector" : `${input.width} x ${input.height}`}</span>
      </figcaption>
    </figure>`,
      )
      .join("\n    ");
    parts.push(`  <div class="provenance">
    <h2>Inputs</h2>
    <div class="inputs">
    ${figures}
    </div>
  </div>`);
  }

  if (options.command) {
    parts.push(`  <div class="provenance">
    <h2>Command</h2>
    <pre class="cmd">${esc(options.command)}</pre>
  </div>`);
  }

  const configJson = JSON.stringify(options.config, null, 2);
  const source = options.configPath
    ? `Resolved from ${esc(options.configPath)} plus any flags.`
    : "Resolved from flags and built-in defaults.";
  parts.push(`  <div class="provenance">
    <h2>Config</h2>
    <p class="hint">${source} This is the fully merged config the run used, the same output as <b>--print-config</b>.</p>
    <details class="config">
      <summary>Show resolved config</summary>
      <pre>${esc(configJson)}</pre>
    </details>
  </div>`);

  return parts.join("\n");
}

function renderGroup(group: PreviewGroup, index: number): string {
  const parts: string[] = [];

  parts.push(`<section>
  <div class="section-head">
    <span class="section-index">${String(index + 1).padStart(2, "0")}</span>
    <h2 class="section-title">${esc(group.title)}</h2>
    <span class="section-path">${esc(group.location)}</span>
  </div>`);

  if (group.parallax) {
    const layers = group.parallax.layers
      .map((layer) => `<div class="layer" style="background-image:var(--${layer.imageKey})"></div>`)
      .join("");
    parts.push(`  <div class="parallax-block">
    <div class="parallax" style="aspect-ratio:${aspectRatio(group.parallax.width, group.parallax.height)}"
         role="img" aria-label="${esc(group.title)} parallax preview">${layers}</div>
    <p class="hint">Point at the stack to move the layers.<br><b>${esc(group.parallax.label)}</b>, the same three
      layers tvOS separates on focus.</p>
  </div>`);
  }

  if (group.swatches && group.swatches.length > 0) {
    const swatches = group.swatches
      .map(
        (swatch) => `<figure>
      <div class="swatch-chip" style="background:${safeHex(swatch.hex, "#000000")}"></div>
      <figcaption><span class="name">${esc(swatch.hex)}</span>
        <span class="dims">${esc(swatch.idiom)} <span class="note">${esc(swatch.appearance)}</span></span>
      </figcaption>
    </figure>`,
      )
      .join("\n    ");
    parts.push(`  <div class="swatches">\n    ${swatches}\n  </div>`);
  }

  if (group.assets.length > 0) {
    const figures = group.assets
      .map((asset) => {
        const note = asset.note ? ` <span class="note">${esc(asset.note)}</span>` : "";
        return `<figure>
      ${linked(
        asset.href,
        asset.filename,
        `<div class="frame${asset.hasAlpha ? " alpha" : ""}" role="img" aria-label="${esc(asset.filename)}"
           style="background-image:${
             asset.hasAlpha ? `var(--${asset.imageKey}),var(--checkers)` : `var(--${asset.imageKey})`
           }"></div>`,
      )}
      <figcaption><span class="name">${esc(asset.filename)}</span>
        <span class="dims">${asset.width} x ${asset.height}${note}</span>
      </figcaption>
    </figure>`;
      })
      .join("\n    ");
    parts.push(`  <div class="row">\n    ${figures}\n  </div>`);
  }

  parts.push("</section>");
  return parts.join("\n");
}

export function renderPreviewHtml(options: RenderPreviewOptions): string {
  const { config } = options;
  const accent = safeHex(config.inputs.backgroundColor, "#B43939");
  const darkAccent = safeHex(config.inputs.darkBackgroundColor, "#5A1C1C");

  // Every image is declared once here and referenced by custom property, so a
  // file used by both a thumbnail and the parallax is embedded a single time.
  const imageVars = [...options.images.entries()]
    .map(([key, dataUri]) => `  --${key}: ${cssUrl(dataUri)};`)
    .join("\n");

  const checkers =
    "repeating-conic-gradient(var(--checker) 0% 25%, transparent 0% 50%)";

  // config here is already the display copy: paths rewritten relative or tildified.
  const meta: [string, string][] = [
    ["Icon", esc(config.inputs.iconImage)],
    ["Background", esc(config.inputs.backgroundImage)],
    ["Color", `<span class="chip" style="background:${accent}"></span>${esc(config.inputs.backgroundColor)}`],
    [
      "Dark color",
      `<span class="chip" style="background:${darkAccent}"></span>${esc(config.inputs.darkBackgroundColor)}`,
    ],
    ["Radius", `${config.inputs.iconBorderRadius}px`],
    ["Platforms", esc(options.platforms.join(", "))],
    ["Files", `${options.totals.files}`],
    ["Generated", esc(options.generatedAt)],
  ];

  const metaRows = meta
    .map(([label, value]) => `    <div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("\n");

  const sections = options.groups.map((group, index) => renderGroup(group, index)).join("\n");
  const version = options.toolVersion ? `v${esc(options.toolVersion)}` : "tvos-assets";
  const provenance = renderProvenance(options);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>tvos-assets preview</title>
<style>
:root {
  --accent: ${accent};
  --checkers: ${checkers};
${imageVars}
}
${STYLES}
</style>
</head>
<body>
<div class="sheet">
  <header class="masthead">
    <div>
      <div class="wordmark">tvos<b>-</b>assets</div>
      <div class="tagline">Generated asset catalog, ${options.totals.files} files, ${options.totals.images} images.</div>
    </div>
    <button class="theme-toggle" id="theme-toggle" type="button">Dark</button>
  </header>

  <dl class="meta">
${metaRows}
  </dl>

${provenance}
${sections}

  <footer>
    <span>${version}</span>
    <span>Every image on this page is embedded in this file. It works offline.</span>
  </footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
