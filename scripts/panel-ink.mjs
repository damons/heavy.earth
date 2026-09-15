// Ink is sampled within exact projected surfaces; surface vertices never jitter.
const f = (n) => Math.round(n * 1000) / 1000;
export const points = (p) => p.map((q) => q.map(f).join(",")).join(" ");
export const polygon = (p, fill, stroke = "#171717", width = 0.7) =>
  `<polygon points="${points(p)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
export const stroke = (p, color = "#333", width = 0.4) =>
  `<polyline points="${points(p)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
export function random(seed) {
  let x = seed | 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) | 0;
    return (x >>> 0) / 4294967296;
  };
}
export function face(
  q,
  seed,
  { base = "#f4f4f4", rows = 0, columns = 2, dark = false } = {},
) {
  const r = random(seed),
    at = (u, v) => [
      q[0][0] + u * (q[1][0] - q[0][0]) + v * (q[3][0] - q[0][0]),
      q[0][1] + u * (q[1][1] - q[0][1]) + v * (q[3][1] - q[0][1]),
    ];
  let s = polygon(q, base);
  if (rows) {
    for (let row = 0; row < rows; row++) {
      const y0 = row / rows,
        y1 = (row + 1) / rows;
      if (row) s += stroke([at(0, y0), at(1, y0)], "#222", 0.55);
      const offset = row % 2 ? 0.5 : 0;
      for (let col = -1; col < columns; col++) {
        const x0 = Math.max(0, (col + offset) / columns),
          x1 = Math.min(1, (col + offset + 1) / columns);
        if (x1 <= x0) continue;
        if (x0 > 0) s += stroke([at(x0, y0), at(x0, y1)], "#333", 0.5);
        // A chipped inner contour belongs to the stone, not its mathematical boundary.
        const d = 0.022,
          yy = (y1 - y0) * 0.12;
        s += stroke(
          [at(x0 + d, y1 - yy * 2), at(x0 + d, y0 + yy), at(x1 - d, y0 + yy)],
          "#666",
          0.24,
        );
        for (let k = 0; k < (dark ? 5 : 3); k++) {
          const a = x0 + (x1 - x0) * r(),
            b = y0 + (y1 - y0) * r();
          const end = Math.min(x1 - 0.005, a + 0.03 + r() * 0.06);
          if (end > a)
            s += stroke(
              [at(a, b), at(end, Math.min(y1 - 0.006, b + 0.018 + r() * 0.04))],
              dark ? "#3e3e3e" : "#777",
              0.24 + r() * 0.15,
            );
        }
        if (r() < 0.42) {
          const a = x0 + (x1 - x0) * (0.25 + 0.4 * r());
          s += stroke(
            [
              at(a, y0),
              at(a + 0.015, y0 + (y1 - y0) * 0.25),
              at(a - 0.008, y0 + (y1 - y0) * 0.43),
            ],
            "#454545",
            0.38,
          );
        }
      }
    }
  }
  for (let k = 0; k < (dark ? 24 : 10); k++) {
    const u = 0.015 + 0.94 * r(),
      v = 0.04 + 0.92 * r();
    if (!dark && r() > 0.3 && v < 0.65) continue;
    const len = 0.02 + 0.07 * r();
    s += stroke(
      [at(u, v), at(Math.min(0.99, u + len), Math.min(0.995, v + 0.055))],
      dark ? "#555" : "#888",
      0.2 + r() * 0.12,
    );
    if (dark && k % 4 === 0)
      s += stroke(
        [at(u, v), at(Math.min(0.99, u + 0.045), Math.max(0.01, v - 0.05))],
        "#444",
        0.22,
      );
  }
  // Vary line weight within the exact outer contour.
  s +=
    stroke([q[3], q[2]], "#171717", 0.85) + stroke([q[0], q[1]], "#111", 0.75);
  return s;
}
export function niche(a, b, height, skull = false) {
  // A relief niche in a vertical wall, contained within that wall face.
  const at = (u, z) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - z];
  const arch = [];
  arch.push(at(0.17, 8), at(0.17, height * 0.56));
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI - (i * Math.PI) / 12;
    arch.push(
      at(0.5 + 0.33 * Math.cos(t), height * 0.56 + height * 0.25 * Math.sin(t)),
    );
  }
  arch.push(at(0.83, 8));
  let s = polygon(arch, "#151515", "#eee", 1.2);
  for (let i = 0; i < 7; i++) {
    const t = Math.PI - (i * Math.PI) / 6;
    const u = 0.5 + 0.37 * Math.cos(t),
      z = height * 0.56 + height * 0.29 * Math.sin(t);
    s += stroke([at(u, z), at(0.5 + 0.47 * Math.cos(t), z + 3)], "#333", 0.55);
  }
  s += stroke([at(0.13, 7), at(0.86, 7)], "#111", 2);
  const c = at(0.5, 18);
  if (skull) {
    s += `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="3.3" ry="4.5" fill="#e9e9e9" stroke="#222" stroke-width=".7"/><circle cx="${f(c[0] - 1.3)}" cy="${f(c[1] - 0.4)}" r=".8"/><circle cx="${f(c[0] + 1.3)}" cy="${f(c[1] - 0.4)}" r=".8"/>`;
    s += stroke(
      [
        [c[0] - 1.5, c[1] + 2.5],
        [c[0] + 1.5, c[1] + 2.5],
      ],
      "#111",
      0.6,
    );
  } else {
    s += stroke([at(0.5, 12), at(0.5, 34)], "#ccc", 1.5);
    s += polygon(
      [at(0.5, 38), at(0.39, 30), at(0.61, 30)],
      "#ddd",
      "#999",
      0.4,
    );
  }
  return s;
}
