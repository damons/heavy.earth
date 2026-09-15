import { face, polygon, stroke, random } from "./panel-ink.mjs";
import { pt, rect, key, configs, offset, polygonFor } from "./panel-layout.mjs";
import {
  box,
  skull,
  bone,
  debris,
  rosette,
  prop,
  doorway,
} from "./panel-props.mjs";
function wall(x, y, axis, z, theme) {
  const a = pt(x, y),
    b = axis === "u" ? pt(x + 1, y) : pt(x, y + 1),
    top = [
      [a[0], a[1] - z],
      [b[0], b[1] - z],
    ],
    seed = x * 819 + y * 331 + (axis === "u" ? 19 : 0),
    r = random(seed);
  let s = face([top[0], top[1], b, a], seed, {
    rows: Math.ceil(z / 10),
    columns: 1.5,
    dark: axis === "u",
    base: axis === "u" ? "#bcbcbc" : "#dedede",
  });
  const outside = axis === "u" ? pt(0, -0.24) : pt(-0.24, 0);
  for (let i = 0; i < 2; i++) {
    const at = (t) => [
      top[0][0] + (top[1][0] - top[0][0]) * t,
      top[0][1] + (top[1][1] - top[0][1]) * t,
    ];
    const p = at(i / 2),
      q = at((i + 1) / 2);
    s += face(
      [
        p,
        [p[0] + outside[0], p[1] + outside[1]],
        [q[0] + outside[0], q[1] + outside[1]],
        q,
      ],
      seed + i,
      { base: "#eee" },
    );
    s += stroke(
      [
        [p[0] + outside[0] * 0.4, p[1] + outside[1] * 0.4],
        [p[0] + 2, p[1] + 2],
        [p[0] + 1, p[1] + 5],
      ],
      "#444",
      0.65,
    );
  }
  const at = (t, h) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - h];
  if (z > 40 && (x + y) % 3 === 0) {
    if (theme === "04-ossuary" || theme === "02-silent-shrine") {
      for (const bottom of theme === "04-ossuary" ? [12, 37] : [19]) {
        let arch = [at(0.12, bottom), at(0.12, bottom + 12)];
        for (let i = 0; i <= 12; i++) {
          const t = Math.PI - (i * Math.PI) / 12;
          arch.push(
            at(0.5 + 0.38 * Math.cos(t), bottom + 12 + 8 * Math.sin(t)),
          );
        }
        arch.push(at(0.88, bottom));
        s +=
          polygon(arch, "#151515", "#444", 1.6) +
          stroke([at(0.09, bottom), at(0.91, bottom)], "#eee", 1.4);
        if (theme === "04-ossuary") {
          for (const t of [0.3, 0.65]) {
            const p = at(t, bottom + 4);
            s += skull(...p, 2.7);
          }
          s += bone(at(0.2, bottom + 1), at(0.7, bottom + 2));
        } else {
          s += propAtUrn(at(0.5, bottom));
        }
        // Fine cobweb fan, anchored to this actual recess.
        const corner = at(0.12, bottom + 16);
        for (const t of [0.3, 0.55, 0.8])
          s += stroke([corner, at(t, bottom + 3)], "#777", 0.25);
        for (const h of [5, 9])
          s += stroke(
            [
              at(0.14, bottom + h),
              at(0.35, bottom + h - 2),
              at(0.6, bottom + h - 1),
            ],
            "#888",
            0.25,
          );
      }
    } else {
      const p = at(0.5, 36);
      s += `<path d="M${p[0]} ${p[1] + 12}v-18m-3 0h6l-2 5h-2Z" fill="#333" stroke="#111" stroke-width="1.1"/>`;
      s += polygon(
        [
          [p[0] - 2, p[1] - 9],
          [p[0], p[1] - 17],
          [p[0] + 2, p[1] - 9],
        ],
        "#ddd",
        "#333",
        0.6,
      );
    }
  }
  if (z > 40 && r() < 0.4)
    s += stroke(
      [at(0.65, z), at(0.56, z - 8), at(0.7, z - 14), at(0.6, z - 22)],
      "#222",
      0.7,
    );
  return s;
}
function propAtUrn([x, y]) {
  return `<path d="M${x - 3} ${y - 12}h6l-1 3q4 7 0 9h-4q-4-2 0-9Z" fill="#ccc" stroke="#777" stroke-width=".7"/>`;
}
export function renderScene(layout, clip = null) {
  const visible = (x, y) => {
    if (!clip) return true;
    const p = pt(x, y);
    return (
      p[0] > clip[0] - 160 &&
      p[0] < clip[0] + 960 &&
      p[1] > clip[1] - 100 &&
      p[1] < clip[1] + 1000
    );
  };
  const { cells, floor } = layout,
    ordered = [...cells.values()]
      .filter((c) => visible(c.x, c.y))
      .sort((a, b) => a.x + a.y - b.x - b.y || a.x - b.x);
  let detail = "",
    earth = "",
    architecture = [];
  const floorMask = ordered
    .filter((c) => floor.has(key(c.x, c.y)))
    .map((c) => polygon(polygonFor(c.x, c.y), "black", "none"))
    .join("");
  for (const c of ordered) {
    const { x, y } = c,
      seed = x * 701 + y * 1899,
      r = random(seed);
    if (c.kind === "wall") {
      const p = pt(x + 0.5, y + 0.5);
      for (let cluster = 0; cluster < 16; cluster++) {
        const a = [p[0] + (r() - 0.5) * 62, p[1] - 25 + (r() - 0.5) * 82],
          len = 2 + r() * 14;
        for (let n = 0; n < 5; n++) {
          const jitter = r() * 4,
            dir = cluster % 3 === 0 ? -1 : 1;
          earth += stroke(
            [
              [a[0] + n * 0.7 + jitter, a[1] + n * 0.55],
              [a[0] + n * 0.7 + len, a[1] + n * 0.55 - len * 0.7 * dir],
            ],
            r() < 0.2 ? "#aaa" : "#555",
            0.18 + r() * 0.23,
          );
        }
      }
      continue;
    }
    if (!floor.has(key(x, y))) continue;
    if (r() < 0.45) {
      const u = x + 0.15 + r() * 0.45,
        v = y + 0.12 + r() * 0.4;
      detail += stroke(
        [
          pt(u, v),
          pt(u + 0.16, v + 0.02),
          pt(u + 0.23, v + 0.19),
          pt(u + 0.32, v + 0.22),
        ],
        "#777",
        0.45,
      );
    }
    for (let i = 0; i < 4; i++) {
      const p = pt(x + r(), y + r());
      detail += `<circle cx="${p[0]}" cy="${p[1]}" r="${0.12 + r() * 0.22}" fill="#777"/>`;
    }
    const nearWall = [
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ].some(([u, v]) => cells.get(key(x + u, y + v))?.kind === "wall");
    if (c.kind === "open" && nearWall && r() < 0.7)
      architecture.push({
        depth: x + y + 0.7,
        svg: debris(x, y, seed, c.theme === "04-ossuary" && r() < 0.65),
      });
    for (const [dx, dy, axis, ex, ey, z] of [
      [0, -1, "u", 0, 0, 64],
      [-1, 0, "v", 0, 0, 64],
      [0, 1, "u", 0, 1, 10],
      [1, 0, "v", 1, 0, 10],
    ]) {
      if (
        floor.has(key(x + dx, y + dy)) ||
        cells.get(key(x + dx, y + dy))?.kind === "blocked"
      )
        continue;
      architecture.push({
        depth: x + y + (z === 10 ? 1.9 : 0),
        svg: wall(x + ex, y + ey, axis, z, c.theme),
      });
    }
  }
  const holes = ordered.filter((c) => c.kind === "blocked");
  let pits =
    '<defs><clipPath id="pit-clip">' +
    holes.map((c) => polygon(polygonFor(c.x, c.y), "white", "none")).join("") +
    '</clipPath></defs><g clip-path="url(#pit-clip)">';
  for (const c of holes)
    for (const [dx, dy, axis] of [
      [0, -1, "u"],
      [-1, 0, "v"],
    ]) {
      if (cells.get(key(c.x + dx, c.y + dy))?.kind === "blocked") continue;
      const a = pt(c.x, c.y),
        b = axis === "u" ? pt(c.x + 1, c.y) : pt(c.x, c.y + 1);
      pits += face(
        [a, b, [b[0], b[1] + 38], [a[0], a[1] + 38]],
        c.x * 333 + c.y * 199,
        { rows: 4, columns: 1.5, dark: true, base: "#888" },
      );
    }
  pits += "</g>";
  for (const config of configs) {
    const [ox, oy] = offset(config.assembly);
    for (const [kind, u, v, w, h] of config.props)
      if (visible(u + ox, v + oy))
        architecture.push({
          depth: u + v + ox + oy + w + h - 0.4,
          svg: prop(kind, u + ox, v + oy, w, h),
        });
    for (const [u, v, axis, kind] of config.doors)
      if (visible(u + ox, v + oy))
        architecture.push({
          depth: u + v + ox + oy + 2,
          svg: doorway(u + ox, v + oy, axis, kind),
        });
    if (config.slug === "02-silent-shrine")
      detail += rosette(24 + ox, 9 + oy, 2.2);
    // Remains and rubble are passable visual clutter unless an object footprint says otherwise.
    for (const [u, v] of [
      [18, 5],
      [29, 13],
      [24, 13],
    ]) {
      const x = u + ox,
        y = v + oy;
      if (cells.get(key(x, y))?.kind === "open")
        architecture.push({
          depth: x + y + 1,
          svg: debris(x, y, x * 199 + y * 333, true),
        });
    }
    for (const t of config.markers) {
      const x = t.x + ox,
        y = t.y + oy;
      let s = "";
      if (t.kind.startsWith("stairs") || t.kind === "steps")
        for (let i = 0; i < 6; i++)
          s += face(
            rect(x + i / 6, y, 1 / 6, 1).map(([u, v]) => pt(u, v)),
            x * 83 + y * 41 + i,
            { base: `rgb(${235 - i * 20},${235 - i * 20},${235 - i * 20})` },
          );
      else if (t.kind !== "pit") s = rosette(x + 0.5, y + 0.5, 0.42);
      detail += s;
    }
  }
  const ink = `<defs><mask id="earth-mask"><rect x="-100" y="-100" width="1800" height="1800" fill="white"/>${floorMask}</mask></defs><g mask="url(#earth-mask)">${earth}</g>${detail}`;
  return {
    ink,
    architecture:
      pits +
      architecture
        .sort((a, b) => a.depth - b.depth)
        .map((a) => a.svg)
        .join(""),
  };
}
