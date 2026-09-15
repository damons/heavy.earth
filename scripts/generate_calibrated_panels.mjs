#!/usr/bin/env node
// Grid-first vector artwork: no inferred or AI-painted floor geometry.
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PANEL,
  DRAFT_PROJECTION,
  project,
  cellPolygon,
} from "../game/web/grid.js";
import { validateDraft } from "../game/web/panels.js";
const dir = fileURLToPath(
  new URL("../examples/calibrated-panels/", import.meta.url),
);
await mkdir(dir, { recursive: true });
const pt = (u, v, z = 0) => {
  const p = project(u, v, PANEL.pitchPixels);
  return [p.x, p.y - z];
};
const fmt = (points) => points.map((p) => p.join(",")).join(" ");
const poly = (points, fill, extra = "") =>
  `<polygon points="${fmt(points)}" fill="${fill}" ${extra}/>`;
const line = (a, b, stroke = "#555", width = 0.6) =>
  `<path d="M${a}L${b}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const key = (x, y) => `${x},${y}`;
const inRect = (x, y, r) =>
  x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
const outlines = 'stroke="#111" stroke-width="1" stroke-linejoin="round"';
function box(x, y, w, h, z) {
  const b = rect(x, y, w, h).map(([u, v]) => pt(u, v)),
    t = rect(x, y, w, h).map(([u, v]) => pt(u, v, z));
  let s =
    poly([t[1], t[2], b[2], b[1]], "#aaa", outlines) +
    poly([t[2], t[3], b[3], b[2]], "#ddd", outlines) +
    poly(t, "#f8f8f8", outlines);
  // Sparse ink hatching on the sides; exact edges stay fixed.
  for (let f = 0.12; f < 0.95; f += 0.16) {
    for (const i of [1, 2]) {
      const j = i + 1;
      const a = [
        t[i][0] * (1 - f) + t[j][0] * f,
        t[i][1] * (1 - f) + t[j][1] * f,
      ];
      s += line(a, [a[0], a[1] + z], "#555", 0.4);
    }
  }
  return s;
}
function wall(x, y, axis) {
  const a = pt(x, y),
    b = axis === "u" ? pt(x + 1, y) : pt(x, y + 1),
    z = 34;
  const top = [
    [a[0], a[1] - z],
    [b[0], b[1] - z],
  ];
  let s = poly(
    [top[0], top[1], b, a],
    axis === "u" ? "#d8d8d8" : "#eee",
    outlines,
  );
  for (const h of [10, 20])
    s += line([a[0], a[1] - h], [b[0], b[1] - h], "#666", 0.5);
  for (let h = 0; h < 30; h += 10) {
    const f = h === 10 ? 0.3 : 0.65;
    const q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - h];
    s += line(q, [q[0], q[1] - 10], "#666", 0.5);
  }
  s += line(top[0], top[1], "#111", 1.5);
  return s;
}
const configs = [
  {
    slug: "01-entrance-hall",
    name: "Entrance Hall",
    level: 1,
    assembly: [0, 0],
    objects: [
      [20, 4, 1, 1],
      [26, 4, 1, 1],
      [20, 11, 1, 1],
      [26, 11, 1, 1],
    ],
    items: [[23, 6]],
    markers: [
      {
        id: "hall-down",
        x: 29,
        y: 8,
        kind: "stairs-down",
        destination: { marker: "crypt-up" },
      },
      {
        id: "hall-transporter",
        x: 18,
        y: 8,
        kind: "transporter",
        destination: "engine",
      },
    ],
  },
  {
    slug: "02-silent-shrine",
    name: "Silent Shrine",
    level: 1,
    assembly: [1, 0],
    objects: [[20, 3, 5, 2]],
    items: [[27, 11]],
    markers: [
      { id: "shrine-steps", x: 24, y: 6, kind: "steps", destination: null },
      {
        id: "shrine-pit",
        x: 28,
        y: 11,
        kind: "pit",
        destination: { marker: "cistern-landing" },
      },
    ],
  },
  {
    slug: "03-dry-cistern",
    name: "Dry Cistern",
    level: 2,
    assembly: [1, 0],
    objects: [],
    items: [[19, 4]],
    markers: [
      {
        id: "cistern-landing",
        x: 28,
        y: 11,
        kind: "landing",
        destination: null,
      },
      {
        id: "cistern-elevator",
        x: 18,
        y: 8,
        kind: "elevator",
        destination: "engine",
      },
    ],
  },
  {
    slug: "04-ossuary",
    name: "Ossuary",
    level: 2,
    assembly: [0, 0],
    objects: [
      [20, 4, 3, 1],
      [24, 7, 3, 1],
      [20, 10, 3, 1],
    ],
    items: [[27, 12]],
    markers: [
      {
        id: "crypt-up",
        x: 29,
        y: 8,
        kind: "stairs-up",
        destination: { marker: "hall-down" },
      },
      {
        id: "crypt-teleporter",
        x: 18,
        y: 8,
        kind: "teleporter",
        destination: "engine",
      },
    ],
  },
];
const panels = [];
for (const config of configs) {
  const cells = [],
    floor = new Set(),
    walls = new Set();
  // The graph and all polygons exist before illustration is added.
  for (let x = -2; x <= 50; x++)
    for (let y = -18; y <= 34; y++) {
      const c = pt(x + 0.5, y + 0.5);
      if (c[0] < 0 || c[0] >= 800 || c[1] < 0 || c[1] >= 800) continue;
      const room = inRect(x, y, [17, 1, 14, 14]);
      const corridor = (y >= 7 && y < 9) || (x >= 23 && x < 25);
      if (!room && !corridor) continue;
      const pit =
        config.slug === "03-dry-cistern" &&
        inRect(x, y, [21, 4, 6, 8]) &&
        !(y >= 7 && y < 9);
      const shrinePit =
        config.slug === "02-silent-shrine" && x === 28 && y === 11;
      let kind = pit || shrinePit ? "blocked" : "open";
      if (config.objects.some((r) => inRect(x, y, r))) kind = "object";
      if (config.items.some(([u, v]) => x === u && y === v)) kind = "item";
      cells.push({ x, y, kind });
      if (!pit && !shrinePit) floor.add(key(x, y));
    }
  // Wall occupancy is explicit in adjacent solid cells; foreground cutaway has no raised face.
  for (const c of cells)
    if (floor.has(key(c.x, c.y)))
      for (const [dx, dy] of [
        [-1, 0],
        [0, -1],
      ]) {
        const x = c.x + dx,
          y = c.y + dy,
          q = pt(x + 0.5, y + 0.5);
        if (
          !floor.has(key(x, y)) &&
          !cells.some((c) => c.x === x && c.y === y) &&
          q[0] >= 0 &&
          q[0] < 800 &&
          q[1] >= 0 &&
          q[1] < 800
        )
          walls.add(key(x, y));
      }
  for (const k of walls) {
    const [x, y] = k.split(",").map(Number);
    cells.push({ x, y, kind: "wall" });
  }
  const ground = cells
    .filter((c) => floor.has(key(c.x, c.y)))
    .map((c) =>
      poly(
        cellPolygon(c.x, c.y).map((p) => [p.x, p.y]),
        "#fafafa",
        `stroke="#aaa" stroke-width="0.55" data-cell="${c.x},${c.y}"`,
      ),
    )
    .join("\n");
  let details = "";
  // Tiny chips and speckles confined to their floor cell, not a competing grid.
  for (const c of cells.filter((c) => c.kind === "open")) {
    const n = Math.abs(c.x * 73 + c.y * 19);
    if (n % 5 === 0) {
      const a = pt(c.x + 0.2, c.y + 0.2),
        b = pt(c.x + 0.36, c.y + 0.21),
        d = pt(c.x + 0.4, c.y + 0.33);
      details += `<path d="M${a}L${b}L${d}" fill="none" stroke="#888" stroke-width=".5"/>`;
    }
    if (n % 3 === 0) {
      const q = pt(c.x + 0.72, c.y + 0.55);
      details += `<circle cx="${q[0]}" cy="${q[1]}" r=".55" fill="#999"/>`;
    }
  }
  let architecture = "";
  for (const c of cells
    .filter((c) => floor.has(key(c.x, c.y)))
    .sort((a, b) => a.x + a.y - (b.x + b.y))) {
    if (
      !floor.has(key(c.x, c.y - 1)) &&
      !cells.some((q) => q.x === c.x && q.y === c.y - 1 && q.kind === "blocked")
    )
      architecture += wall(c.x, c.y, "u");
    if (
      !floor.has(key(c.x - 1, c.y)) &&
      !cells.some((q) => q.x === c.x - 1 && q.y === c.y && q.kind === "blocked")
    )
      architecture += wall(c.x, c.y, "v");
  }
  // Recessed pit faces are clipped to the exact hole footprint, below floor height.
  const holes = cells.filter((c) => c.kind === "blocked");
  if (holes.length) {
    const mask = holes
      .map((c) =>
        poly(
          cellPolygon(c.x, c.y).map((p) => [p.x, p.y]),
          "white",
        ),
      )
      .join("");
    architecture += `<defs><clipPath id="pit-clip">${mask}</clipPath></defs><g clip-path="url(#pit-clip)">`;
    for (const c of holes)
      for (const axis of ["u", "v"]) {
        const dx = axis === "v" ? -1 : 0,
          dy = axis === "u" ? -1 : 0;
        if (holes.some((q) => q.x === c.x + dx && q.y === c.y + dy)) continue;
        const a = pt(c.x, c.y),
          b = axis === "u" ? pt(c.x + 1, c.y) : pt(c.x, c.y + 1);
        architecture += poly(
          [a, b, [b[0], b[1] + 26], [a[0], a[1] + 26]],
          "#777",
          outlines,
        );
        for (const h of [8, 16, 24])
          architecture += line([a[0], a[1] + h], [b[0], b[1] + h], "#222", 0.6);
      }
    architecture += "</g>";
  }
  for (const [x, y, w, h] of config.objects) {
    if (config.slug === "01-entrance-hall") {
      architecture += box(x + 0.08, y + 0.08, 0.84, 0.84, 36);
      architecture += box(x, y, 1, 1, 40);
    } else if (config.slug === "02-silent-shrine") {
      architecture +=
        box(x, y, w, h, 6) + box(x + 0.5, y + 0.35, w - 1, h - 0.7, 18);
    } else {
      architecture += box(x + 0.05, y + 0.06, w - 0.1, h - 0.12, 12);
      const a = pt(x + 0.5, y + 0.5, 13),
        b = pt(x + w - 0.5, y + 0.5, 13);
      architecture += line(a, b, "#555", 1);
    }
  }
  for (const [x, y] of config.items) {
    architecture += box(x + 0.3, y + 0.3, 0.4, 0.4, 5);
  }
  for (const t of config.markers) {
    const x = t.x,
      y = t.y;
    if (t.kind.startsWith("stairs") || t.kind === "steps") {
      for (let i = 0; i < 5; i++) {
        const a = pt(x + i / 5, y),
          b = pt(x + i / 5, y + 1);
        architecture += line(a, b, "#111", 1);
      }
    } else if (
      ["transporter", "teleporter", "elevator", "landing"].includes(t.kind)
    ) {
      architecture += poly(
        rect(x + 0.08, y + 0.08, 0.84, 0.84).map(([u, v]) => pt(u, v)),
        "none",
        'stroke="#111" stroke-width="1.4"',
      );
      architecture += poly(
        rect(x + 0.22, y + 0.22, 0.56, 0.56).map(([u, v]) => pt(u, v)),
        "none",
        'stroke="#555" stroke-width=".7"',
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8in" height="8in" viewBox="0 0 800 800"><title>${config.name} — HE8 calibrated panel, TOP up</title><desc>Exact 0.5 by 0.25 inch floor diamonds. Grid first, vector ink artwork second. Physical origin is top left.</desc><g id="grid-first"><rect width="800" height="800" fill="#111"/>${ground}</g><g id="ink-detail">${details}</g><g id="architecture">${architecture}</g></svg>`;
  await writeFile(dir + config.slug + ".svg", svg);
  // Render new SVG artwork, not an edit/warp of the earlier generated raster art.
  execFileSync("rsvg-convert", [
    "-w",
    "2400",
    "-h",
    "2400",
    "-o",
    dir + config.slug + ".png",
    dir + config.slug + ".svg",
  ]);
  execFileSync("rsvg-convert", [
    "-w",
    "800",
    "-h",
    "800",
    "-o",
    dir + config.slug + "-preview.png",
    dir + config.slug + ".svg",
  ]);
  const png = await readFile(dir + config.slug + "-preview.png");
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
    art: "data:image/png;base64," + png.toString("base64"),
    cells,
    connectors: [],
    transitions: config.markers,
  });
  await writeFile(
    dir + config.slug + "-cells.json",
    JSON.stringify(
      {
        standard: PANEL.standard,
        level: config.level,
        cells: cells.map((c) => ({ ...c, polygon: cellPolygon(c.x, c.y) })),
        transitions: config.markers,
      },
      null,
      2,
    ) + "\n",
  );
}
const draft = {
  format: "heavy-earth-panel-draft",
  version: 3,
  projection: DRAFT_PROJECTION,
  panels,
};
validateDraft(draft);
await writeFile(
  dir + "four-panel-draft.json",
  JSON.stringify(draft, null, 2) + "\n",
);
const master = await readFile(
  new URL("../game/web/panel-grid.svg", import.meta.url),
  "utf8",
);
await writeFile(dir + "grid-overlay.svg", master.replace(/<rect[^>]*\/>/g, ""));
await writeFile(
  dir + "geometry.json",
  JSON.stringify(
    {
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
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Generated four grid-first SVG/PNG panels, cell polygons, shared overlay, and v3 navigation draft.",
);

const gallery = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HEAVY.EARTH — calibrated panel samples</title><style>
*{box-sizing:border-box}body{margin:0;padding:36px;background:#171717;color:#eee;font:16px system-ui}h1{font-size:30px;margin-bottom:8px}p{max-width:850px;line-height:1.6;color:#ccc}a{color:inherit}header{margin-bottom:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}figure{margin:0}h2{font-size:18px} .board{position:relative;aspect-ratio:1;background:#111}.board img{display:block;width:100%;height:100%}.board .grid{position:absolute;inset:0;pointer-events:none;display:none}body.show-grid .grid{display:block}label{display:inline-block;padding:12px 0}figcaption{font-size:13px;color:#bbb;margin:10px 0}button{margin-left:20px;padding:8px 12px} @media(max-width:700px){main{grid-template-columns:1fr}body{padding:20px}} @media print{@page{size:letter;margin:.25in}body{padding:0;background:white}header,h2,figcaption{display:none}main{display:block}figure{break-after:page}.board{width:8in;height:8in;margin-top:.5in}.board .grid{display:none!important}}
</style><header><h1>HEAVY.EARTH / GRID FIRST</h1><p>8 × 8 inch panels · ½ × ¼ inch diamonds · TOP ↑ · exact 2:1 projection.<br>Floor geometry is authored on the grid; raised architecture and ink detail sit above it.</p><p><a href="four-panel-draft.json" download>Download workshop draft</a> · <a href="README.md">Layer and navigation notes</a></p><label><input type="checkbox" onchange="document.body.classList.toggle('show-grid',this.checked)"> Show exact grid over artwork</label><button onclick="print()">Print four 8-inch panels</button><p>Print at 100% / Actual Size; measure 8 inches on each side. Floor cells and marker destinations are test data, not playable custom levels.</p></header><main>${configs.map((c) => `<figure><h2>${c.name} / level ${c.level} / TOP ↑</h2><div class="board"><img src="${c.slug}.svg" alt="${c.name}: calibrated isometric dungeon"><img class="grid" src="grid-overlay.svg" alt=""></div><figcaption><a href="${c.slug}.png">2400px PNG</a> · <a href="${c.slug}.svg">8-inch layered SVG</a> · <a href="${c.slug}-cells.json">Cell polygons and markers</a></figcaption></figure>`).join("")}</main></html>`;
await writeFile(dir + "index.html", gallery);
