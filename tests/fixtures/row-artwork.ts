// A Figma-style export in miniature: full-canvas fills, three staggered rows of one card in a mask,
// a fixed red mark on top. Cards are 60x40 rounded rects, 100 apart; rows 80 apart.
const card = (cx: number, cy: number) =>
  `<path d="M${cx + 30} ${cy}V${cy + 10}C${cx + 30} ${cy + 20} ${cx + 20} ${cy + 20} ${cx + 10} ${cy + 20}H${cx - 10}C${cx - 20} ${cy + 20} ${cx - 30} ${cy + 20} ${cx - 30} ${cy + 10}V${cy - 10}C${cx - 30} ${cy - 20} ${cx - 20} ${cy - 20} ${cx - 10} ${cy - 20}H${cx + 10}C${cx + 20} ${cy - 20} ${cx + 30} ${cy - 20} ${cx + 30} ${cy - 10}V${cy}Z" fill="white"/>`;
// Rows run past both edges, as a wall exported from a design tool does.
const rowAt = (cy: number, offset: number) => [0, 1, 2, 3, 4].map((i) => card(offset + i * 100, cy)).join("");

export const ROW_SVG = `<svg width="400" height="200" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#c)">
<path d="M400 0H0V200H400V0Z" fill="#000000"/>
<mask id="m" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="-50" y="-50" width="500" height="300">
${rowAt(20, 50)}${rowAt(100, 0)}${rowAt(180, 50)}
</mask>
<g mask="url(#m)"><path d="M400 0H0V200H400V0Z" fill="#FFC312"/></g>
<rect x="190" y="90" width="20" height="20" fill="#FF0000"/>
</g>
<defs><clipPath id="c"><rect width="400" height="200" fill="white"/></clipPath></defs>
</svg>`;
