// Shared game, panel and print geometry. Use the exact 1/2 slope, not a rounded angle.
export const ISO = Object.freeze({
  slope: 1 / 2,
  angle: Math.atan(1 / 2),
  pitch: 128, // Camera pixels per game tile; independent of physical print scale.
});
export const PANEL = Object.freeze({
  standard: "HE8-2to1-0.5in-v1",
  inches: 8,
  previewPixels: 800,
  tileWidthInches: 1 / 2,
  tileHeightInches: 1 / 4,
  pitchPixels: 50,
  origin: Object.freeze([0, 0]),
  top: "up",
});
export const DRAFT_PROJECTION = Object.freeze({
  standard: PANEL.standard,
  ratio: "2:1",
  previewPixels: PANEL.previewPixels,
  tileWidthInches: PANEL.tileWidthInches,
});
export function project(x, y, pitch = ISO.pitch) {
  return { x: ((x - y) * pitch) / 2, y: ((x + y) * pitch) / 4 };
}
export function unproject(x, y, pitch = ISO.pitch) {
  const a = x / (pitch / 2),
    b = y / (pitch / 4);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
// A board offset is in physical screen directions, distinct from world N/E/S/W.
export function panelWorldOffset(column, row) {
  return unproject(
    column * PANEL.inches,
    row * PANEL.inches,
    PANEL.tileWidthInches,
  );
}
// Exact clipped lines in inches; also used by the printable template generator.
export function panelGridSegments() {
  const size = PANEL.inches,
    lines = [];
  for (const slope of [ISO.slope, -ISO.slope]) {
    // y = slope*x + intercept: bound intercepts by all four corners.
    const first = Math.ceil(
      Math.min(0, -slope * size) / PANEL.tileHeightInches,
    );
    const last = Math.floor(
      Math.max(size, size - slope * size) / PANEL.tileHeightInches,
    );
    for (let n = first; n <= last; n++) {
      const intercept = n * PANEL.tileHeightInches;
      const points = [
        [0, intercept],
        [size, slope * size + intercept],
        [-intercept / slope, 0],
        [(size - intercept) / slope, size],
      ]
        .filter(([x, y]) => x >= 0 && x <= size && y >= 0 && y <= size)
        .filter(
          (p, i, all) =>
            all.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i,
        )
        .sort((a, b) => a[0] - b[0]);
      if (points.length === 2)
        lines.push({ slope, a: points[0], b: points[1] });
    }
  }
  return lines;
}
