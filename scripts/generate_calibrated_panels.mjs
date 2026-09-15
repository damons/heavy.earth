#!/usr/bin/env node
// Construct one exact floor graph, illustrate it, then crop four physical boards.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PANEL, DRAFT_PROJECTION, cellPolygon } from "../game/web/grid.js";
import { validateDraft } from "../game/web/panels.js";
import {
  configs,
  buildLayout,
  localCells,
  offset,
  polygonFor,
} from "./panel-layout.mjs";
import { renderScene } from "./panel-scene.mjs";
const dir = fileURLToPath(
  new URL("../examples/calibrated-panels/", import.meta.url),
);
await mkdir(dir, { recursive: true });
const layout = buildLayout(),
  scene = renderScene(layout),
  panels = [];
const json = (name, data) =>
  writeFile(dir + name, JSON.stringify(data, null, 2) + "\n");
const ground = (cells) =>
  cells
    .filter((c) => !["wall", "blocked"].includes(c.kind))
    .map(
      (c) =>
        `<polygon points="${polygonFor(c.x, c.y)
          .map((p) => p.join(","))
          .join(
            " ",
          )}" fill="#f7f7f7" stroke="#aaa" stroke-width=".55" data-cell="${c.x},${c.y}"/>`,
    )
    .join("\n");
const render = (name, size) =>
  execFileSync("rsvg-convert", [
    "-w",
    String(size),
    "-h",
    String(size),
    "-o",
    dir + name + (size === 800 ? "-preview" : "") + ".png",
    dir + name + ".svg",
  ]);
for (const config of configs) {
  const cells = localCells(layout, config),
    [ox, oy] = config.assembly.map((v) => v * 800),
    scene = renderScene(layout, [ox, oy]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8in" height="8in" viewBox="0 0 800 800"><title>${config.name} — HE8 calibrated panel, TOP up</title><desc>Exact half-inch by quarter-inch diamonds; connected 2 by 2 assembly; procedural pen, ink and scratchboard artwork.</desc><g id="grid-first"><rect width="800" height="800" fill="#111"/>${ground(cells)}</g><g id="ink-detail" transform="translate(${-ox} ${-oy})">${scene.ink}</g><g id="architecture" transform="translate(${-ox} ${-oy})">${scene.architecture}</g></svg>`;
  await writeFile(dir + config.slug + ".svg", svg);
  render(config.slug, 2400);
  render(config.slug, 800);
  const connectors = config.ports.map(({ edge, span, ...p }) => p);
  panels.push({
    id: config.slug,
    name: config.name,
    level: config.level,
    inches: PANEL.inches,
    pitch: PANEL.pitchPixels,
    origin: [...PANEL.origin],
    top: PANEL.top,
    assembly: config.assembly,
    threshold: 150,
    art:
      "data:image/png;base64," +
      (await readFile(dir + config.slug + "-preview.png")).toString("base64"),
    cells,
    connectors,
    transitions: config.markers,
  });
  await json(config.slug + "-cells.json", {
    standard: PANEL.standard,
    level: config.level,
    cells: cells.map((c) => ({ ...c, polygon: cellPolygon(c.x, c.y) })),
    connectors,
    transitions: config.markers,
    features: config.props.map(([kind, x, y, width, height]) => ({
      kind,
      x,
      y,
      width,
      height,
      classification: kind === "chest" ? "item" : "object",
    })),
    decorationPolicy:
      "Small loose bones, chips, engravings and wall-mounted details are visual decoration; large piles and fixtures have object footprints.",
  });
}
const draft = {
  format: "heavy-earth-panel-draft",
  version: 3,
  projection: DRAFT_PROJECTION,
  panels,
};
validateDraft(draft);
await json("four-panel-draft.json", draft);
const master = await readFile(
  new URL("../game/web/panel-grid.svg", import.meta.url),
  "utf8",
);
await writeFile(dir + "grid-overlay.svg", master.replace(/<rect[^>]*\/>/g, ""));
await json("geometry.json", {
  standard: PANEL.standard,
  inches: 8,
  diamondInches: [0.5, 0.25],
  previewPixels: 800,
  printPixels: 2400,
  angleDegrees: (Math.atan(0.5) * 180) / Math.PI,
  origin: [0, 0],
  top: "up",
  layers: ["grid-first", "ink-detail", "architecture"],
  groundPlaneOnly: true,
});
await json("assembly.json", {
  format: "heavy-earth-sample-assembly",
  version: 1,
  level: 1,
  boardPixels: 800,
  assemblyInches: [16, 16],
  panels: configs.map((c) => ({
    id: c.slug,
    assembly: c.assembly,
    gridOffset: offset(c.assembly),
    ports: c.ports,
  })),
  note: "Spans are distances along each physical edge in 800-unit coordinates. Reciprocal endpoints represent the same split diamond. TOP stays up. Passages are certified for this arrangement, not arbitrary permutations.",
});
const assembly = `<svg xmlns="http://www.w3.org/2000/svg" width="16in" height="16in" viewBox="0 0 1600 1600"><title>HEAVY.EARTH — connected four-board dungeon</title><rect width="1600" height="1600" fill="#111"/>${ground([...layout.cells.values()])}${scene.ink}${scene.architecture}</svg>`;
await writeFile(dir + "assembly.svg", assembly);
render("assembly", 1600);
const board = (c) =>
  `<div class="board"><picture><source media="print" srcset="${c.slug}.png"><img src="${c.slug}-preview.png" alt="${c.name}: detailed calibrated dungeon"></picture><img class="grid" src="grid-overlay.svg" alt=""></div>`;
await writeFile(
  dir + "index.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HEAVY.EARTH — connected ink panels</title><style>
*{box-sizing:border-box}body{margin:0;padding:36px;background:#171717;color:#eee;font:16px system-ui}h1{font-size:30px;margin-bottom:8px}p{max-width:900px;line-height:1.6;color:#ccc}a{color:inherit}header{margin-bottom:28px}.assembly{display:grid;grid-template-columns:1fr 1fr;gap:0;max-width:1600px;border:1px solid #555}.board{position:relative;aspect-ratio:1;background:#111;min-width:0}.board img{display:block;width:100%;height:100%}.board .grid{position:absolute;inset:0;pointer-events:none;display:none}body.show-grid .grid{display:block}body.show-seams .assembly .board{outline:1px dashed #ddd;outline-offset:-1px}label{display:inline-block;padding:12px 16px 12px 0}button{padding:8px 12px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px;margin-top:36px}figure{margin:0}h2{font-size:18px}figcaption{font-size:13px;color:#bbb;margin:10px 0}.key{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:600px;font-size:14px}.map-title{margin-top:35px}@media(max-width:700px){main{grid-template-columns:1fr}body{padding:16px}}@media print{@page{size:letter;margin:.25in}body{padding:0;background:white}header,.assembly,.key,.map-title,h2,figcaption{display:none}main{display:block;margin:0}figure{break-after:page}.board{width:8in;height:8in;margin-top:.5in}.board .grid{display:none!important}}
</style><header><h1>HEAVY.EARTH / THE CONNECTED UNDERWORLD</h1><p>Four ink-and-scratchboard panels: carved tombs, bone niches, loose rubble, urns, crates, barrels, engraved stone, and varied open doorways. Built on exact ½ × ¼ inch diamonds.</p><p>8 × 8 inches per board · TOP ↑ · ±26.565° grid lines · one connected dungeon level.</p><p><a href="four-panel-draft.json" download>Download workshop draft</a> · <a href="assembly.png">Full assembled image</a> · <a href="assembly.json">Passage coordinates</a> · <a href="README.md">Notes</a></p><label><input type="checkbox" onchange="document.body.classList.toggle('show-grid',this.checked)"> Show exact grid over artwork</label><label><input type="checkbox" onchange="document.body.classList.toggle('show-seams',this.checked)"> Show panel seams</label><button onclick="print()">Print four 8-inch panels</button><p>Print at 100% / Actual Size. Reviewed sample metadata; custom panel gameplay is still in development.</p></header><h2 class="map-title">Assembled / 16 × 16 inches</h2><div class="key"><span>↖ Entrance Hall</span><span>↗ Silent Shrine</span><span>↙ Dry Cistern</span><span>↘ Ossuary</span></div><section class="assembly" aria-label="Connected four-panel assembly">${configs.map(board).join("")}</section><main>${configs.map((c) => `<figure><h2>${c.name} / position ${c.assembly.join(", ")} / TOP ↑</h2>${board(c)}<figcaption><a href="${c.slug}.png">2400px PNG</a> · <a href="${c.slug}.svg">8-inch SVG</a> · <a href="${c.slug}-cells.json">Cells, objects and passages</a></figcaption></figure>`).join("")}</main></html>`,
);
console.log(
  "Generated four detailed panels, their continuous assembly, and reciprocal passage metadata.",
);
