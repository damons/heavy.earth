import { face, polygon, stroke, random } from "./panel-ink.mjs";
import { pt, rect } from "./panel-layout.mjs";
export function box(x, y, w, h, z, base = 0, wood = false) {
  const b = rect(x, y, w, h).map(([u, v]) => pt(u, v, base)),
    t = rect(x, y, w, h).map(([u, v]) => pt(u, v, z)),
    seed = Math.round(x * 311 + y * 673 + z * 19);
  return (
    face([t[1], t[2], b[2], b[1]], seed, {
      base: "#c8c8c8",
      rows: wood ? 1 : Math.max(1, Math.floor((z - base) / 9)),
      columns: wood ? 5 : 2,
      dark: true,
    }) +
    face([t[2], t[3], b[3], b[2]], seed + 91, {
      base: "#e7e7e7",
      rows: wood ? 1 : Math.max(1, Math.floor((z - base) / 9)),
      columns: wood ? 5 : 2,
    }) +
    face(t, seed + 128, { base: "#f8f8f8" })
  );
}
export function skull(x, y, size = 3.5) {
  return `<g transform="translate(${x} ${y}) scale(${size / 3.5})"><path d="M-3 0C-5-7 5-7 3 0L2 3H-2Z" fill="#eee" stroke="#151515" stroke-width=".65"/><path d="M-2-2h.6m2.8 0H2M0-1l-.6 1h1.2M-1 1v2m1-2v2m1-2v2" fill="none" stroke="#111" stroke-width=".8"/></g>`;
}
export function bone(a, b) {
  let s = stroke([a, b], "#151515", 2.4) + stroke([a, b], "#ddd", 1);
  for (const p of [a, b])
    for (const d of [-0.8, 0.8])
      s += `<circle cx="${p[0] + d}" cy="${p[1]}" r="1" fill="#eee" stroke="#222" stroke-width=".4"/>`;
  return s;
}
export function rock(x, y, size, seed) {
  const r = random(seed);
  const ground = Array.from({ length: 6 }, (_, i) =>
    pt(
      x + Math.cos((i * Math.PI) / 3) * size * (0.7 + r() * 0.3),
      y + Math.sin((i * Math.PI) / 3) * size * (0.7 + r() * 0.3),
    ),
  );
  const top = ground.map(([x, y]) => [x + 1, y - size * 16]);
  return (
    polygon(ground, "#777") +
    face([top[1], top[2], ground[2], ground[1]], seed, {
      base: "#888",
      dark: true,
    }) +
    face([top[2], top[3], ground[3], ground[2]], seed + 1, {
      base: "#bdbdbd",
    }) +
    polygon(top, "#e1e1e1") +
    stroke([top[0], top[3], top[4]], "#555", 0.4)
  );
}
export function debris(x, y, seed, bones = false) {
  const r = random(seed);
  let s = "";
  for (let i = 0; i < 5; i++)
    s += rock(
      x + 0.12 + r() * 0.75,
      y + 0.12 + r() * 0.75,
      0.035 + r() * 0.055,
      seed + i,
    );
  if (bones) {
    s +=
      bone(pt(x + 0.15, y + 0.25), pt(x + 0.75, y + 0.65)) +
      bone(pt(x + 0.25, y + 0.7), pt(x + 0.65, y + 0.2));
    const p = pt(x + 0.6, y + 0.65, 2);
    s += skull(...p, 2.5);
  }
  return s;
}
export function rosette(x, y, r, z = 0) {
  let s = "";
  for (const radius of [r, r * 0.8])
    s += stroke(
      Array.from({ length: 65 }, (_, i) =>
        pt(
          x + radius * Math.cos((i * Math.PI) / 32),
          y + radius * Math.sin((i * Math.PI) / 32),
          z,
        ),
      ),
      "#444",
      0.65,
    );
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += stroke(
      [
        pt(x, y, z),
        pt(x + r * 0.76 * Math.cos(a), y + r * 0.76 * Math.sin(a), z),
      ],
      "#444",
      0.55,
    );
  }
  return s;
}
export function prop(kind, x, y, w = 1, h = 1) {
  let s = "",
    seed = Math.round(x * 339 + y * 713);
  const r = random(seed);
  if (kind === "pillar") {
    s =
      box(x, y, w, h, 5) +
      box(x + 0.12, y + 0.12, w - 0.24, h - 0.24, 57, 5) +
      box(x + 0.04, y + 0.04, w - 0.08, h - 0.08, 61, 57) +
      box(x, y, w, h, 65, 61);
    const a = pt(x + 0.3, y + 1, 12),
      b = pt(x + 0.3, y + 1, 51);
    s += stroke([a, b], "#777", 1.5);
    s += rosette(x + 0.5, y + 0.5, 0.28, 65.1);
  } else if (kind === "altar" || kind === "tomb") {
    const z = kind === "altar" ? 24 : 18;
    s =
      box(x, y, w, h, 4) +
      box(x + 0.12, y + 0.12, w - 0.24, h - 0.24, z, 4) +
      box(x + 0.03, y + 0.03, w - 0.06, h - 0.06, z + 3, z);
    s += polygon(
      rect(x + 0.18, y + 0.18, w - 0.36, h - 0.36).map(([u, v]) =>
        pt(u, v, z + 3.1),
      ),
      "none",
      "#333",
      0.7,
    );
    if (kind === "tomb" && Math.floor(x) % 3 !== 0) {
      const p = pt(x + 0.55, y + 0.5, z + 3.5);
      s += skull(...p, 2.5);
      s += stroke(
        [pt(x + 0.75, y + 0.5, z + 3.4), pt(x + w - 0.45, y + 0.5, z + 3.4)],
        "#666",
        1,
      );
      for (let j = 0; j < 5; j++) {
        const u = x + 0.85 + j * 0.15;
        s += stroke(
          [
            pt(u + 0.07, y + 0.3, z + 3.4),
            pt(u, y + 0.5, z + 3.4),
            pt(u + 0.07, y + 0.7, z + 3.4),
          ],
          "#666",
          0.55,
        );
      }
    } else
      s += rosette(x + w * 0.5, y + h * 0.5, Math.min(h * 0.28, 0.65), z + 3.2);
    for (let i = 0; i < 5; i++) {
      const u = x + 0.23 + r() * (w - 0.46),
        v = y + 0.2 + r() * (h - 0.4);
      s += stroke(
        [
          pt(u, v, z + 3.2),
          pt(u + 0.12, v + 0.08, z + 3.2),
          pt(u + 0.05, v + 0.18, z + 3.2),
        ],
        "#444",
        0.45,
      );
    }
    for (let i = 0; i < Math.floor(w * 3); i++) {
      const u = x + 0.2 + i / 3;
      s += stroke(
        [pt(u, y + h - 0.1, 6), pt(u, y + h - 0.1, z - 2)],
        "#444",
        0.65,
      );
    }
    if (kind === "altar")
      for (const u of [x + 0.4, x + w - 0.4]) {
        const p = pt(u, y + 0.4, z + 3);
        s += `<path d="M${p}v-13" stroke="#222" stroke-width="2.5"/><path d="M${p[0]} ${p[1] - 13}l-1-3 1-3 1 3Z" fill="#eee" stroke="#444" stroke-width=".4"/>`;
      }
  } else if (kind === "crate" || kind === "chest") {
    s = box(
      x + 0.1,
      y + 0.1,
      w - 0.2,
      h - 0.2,
      kind === "crate" ? 20 : 12,
      0,
      true,
    );
    const z = kind === "crate" ? 20 : 12;
    for (const u of [0.2, 0.75])
      s += stroke(
        [pt(x + u, y + 0.1, z), pt(x + u, y + 0.9, z), pt(x + u, y + 0.9)],
        "#222",
        1.5,
      );
    if (kind === "crate")
      s += stroke(
        [pt(x + 0.1, y + 0.9, 2), pt(x + 0.9, y + 0.9, z - 2)],
        "#ddd",
        2.2,
      );
    else {
      const p = pt(x + 0.5, y + 0.9, 7);
      s += polygon(
        [
          [p[0] - 2, p[1] - 2],
          [p[0] + 2, p[1] - 2],
          [p[0] + 2, p[1] + 2],
          [p[0] - 2, p[1] + 2],
        ],
        "#ddd",
      );
    }
  } else if (kind === "barrel" || kind === "urn") {
    const [cx, cy] = pt(x + 0.5, y + 0.5),
      rad = kind === "barrel" ? 8 : 6,
      height = kind === "barrel" ? 21 : 24;
    s += `<path d="M${cx - rad},${cy - height + 3}Q${cx - rad - 4},${cy - 7} ${cx - rad + 2},${cy}Q${cx},${cy + 4} ${cx + rad - 2},${cy}Q${cx + rad + 4},${cy - 7} ${cx + rad},${cy - height + 3}Z" fill="#ddd" stroke="#111" stroke-width=".8"/>`;
    for (let i = -2; i <= 2; i++)
      s += stroke(
        [
          [cx + i * 2, cy - 1],
          [cx + i * 2.6, cy - height + 5],
        ],
        "#555",
        0.5,
      );
    for (const z of [5, height - 4])
      s += `<ellipse cx="${cx}" cy="${cy - z}" rx="${rad + 1}" ry="2.6" fill="none" stroke="#333" stroke-width="1.4"/>`;
    s += `<ellipse cx="${cx}" cy="${cy - height + 3}" rx="${rad}" ry="3" fill="#aaa" stroke="#111" stroke-width=".8"/>`;
    if (kind === "urn")
      s += `<ellipse cx="${cx}" cy="${cy - height + 2}" rx="4" ry="1.8" fill="#111"/>`;
  } else if (kind === "rubble" || kind === "fallen-column") {
    for (let i = 0; i < 35; i++)
      s += rock(
        x + 0.15 + r() * (w - 0.3),
        y + 0.15 + r() * (h - 0.3),
        0.08 + r() * 0.16,
        seed + i,
      );
    const a = pt(x + 0.3, y + 0.3, 4),
      b = pt(x + w - 0.3, y + h - 0.3, 4);
    s += bone(a, b);
    s += skull(...pt(x + 0.7, y + h - 0.4, 3), 4);
    if (kind === "fallen-column") {
      s += box(x + 0.55, y + 0.3, 0.5, 1.9, 12, 3);
      for (const v of [0.3, 1.95]) s += box(x + 0.46, y + v, 0.68, 0.2, 15, 3);
      for (const u of [0.65, 0.8, 0.95])
        s += stroke(
          [pt(x + u, y + 0.5, 12), pt(x + u, y + 1.9, 12)],
          "#555",
          0.6,
        );
    }
  }
  return `<g data-prop="${kind}">${s}</g>`;
}
export function doorway(x, y, axis, kind) {
  // Open portal: arch bands and jambs only; never paint over the aperture.
  const at = (t, z) => (axis === "u" ? pt(x + t, y, z) : pt(x, y + t, z));
  let s = "";
  for (const t of [-0.3, 2])
    s += box(
      axis === "u" ? x + t : x - 0.15,
      axis === "u" ? y - 0.15 : y + t,
      axis === "u" ? 0.3 : 0.45,
      axis === "u" ? 0.45 : 0.3,
      52,
    );
  if (kind === "broken") {
    for (const t of [0, 1.8])
      s += polygon([at(t, 50), at(t + 0.2, 59), at(t + 0.2, 48)], "#ddd");
    return s;
  }
  for (let i = 0; i < 12; i++) {
    const a = Math.PI - (i * Math.PI) / 12,
      b = Math.PI - ((i + 1) * Math.PI) / 12;
    const p = (t, r) => at(1 + r * Math.cos(t), 34 + r * 20 * Math.sin(t));
    s += face(
      [p(a, 1.03), p(b, 1.03), p(b, 1.26), p(a, 1.26)],
      x * 199 + y * 333 + i,
      { base: i % 2 ? "#e9e9e9" : "#ccc" },
    );
  }
  if (kind === "gate")
    for (let i = 0; i < 9; i++)
      s += stroke(
        [at(0.1 + i * 0.22, 49), at(0.1 + i * 0.22, 33)],
        "#111",
        1.1,
      );
  return s;
}
