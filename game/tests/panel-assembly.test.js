import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cellPolygon } from "../web/grid.js";
const root = new URL("../../examples/calibrated-panels/", import.meta.url);
const draft = JSON.parse(
  await readFile(new URL("four-panel-draft.json", root), "utf8"),
);
const assembly = JSON.parse(
  await readFile(new URL("assembly.json", root), "utf8"),
);
const offset = (p) => [
  16 * p.assembly[0] + 32 * p.assembly[1],
  -16 * p.assembly[0] + 32 * p.assembly[1],
];
const world = (p, c) => {
  const [x, y] = offset(p);
  return `${c.x + x},${c.y + y}`;
};
function openings(panel, edge) {
  const vertical = ["east", "west"].includes(edge),
    a = vertical ? "x" : "y",
    b = vertical ? "y" : "x",
    boundary = ["east", "south"].includes(edge) ? 800 : 0,
    spans = [];
  for (const c of panel.cells.filter(
    (c) => !["wall", "blocked"].includes(c.kind),
  )) {
    const polygon = cellPolygon(c.x, c.y),
      hits = [];
    for (let i = 0; i < 4; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % 4];
      if ((p[a] - boundary) * (q[a] - boundary) <= 0 && p[a] !== q[a]) {
        const t = (boundary - p[a]) / (q[a] - p[a]);
        hits.push(p[b] + t * (q[b] - p[b]));
      }
    }
    if (hits.length > 1 && Math.max(...hits) > Math.min(...hits))
      spans.push([
        Math.max(0, Math.min(...hits)),
        Math.min(800, Math.max(...hits)),
      ]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    if (s[1] <= s[0]) continue;
    const prev = merged.at(-1);
    if (prev && s[0] <= prev[1]) prev[1] = Math.max(prev[1], s[1]);
    else merged.push(s);
  }
  return merged;
}
test("every rendered edge opening matches its declared neighboring passage, with no extra exits", () => {
  const expected = [
    { east: [[300, 350]], south: [[300, 400]] },
    { west: [[300, 350]], south: [[500, 600]] },
    { north: [[300, 400]], east: [[500, 550]] },
    { north: [[500, 600]], west: [[500, 550]] },
  ];
  for (const [i, p] of draft.panels.entries())
    for (const edge of ["north", "east", "south", "west"]) {
      const actual = openings(p, edge);
      assert.deepEqual(actual, expected[i][edge] ?? [], `${p.name} ${edge}`);
      assert.deepEqual(
        assembly.panels[i].ports
          .filter((c) => c.edge === edge)
          .map((c) => c.span),
        actual,
      );
    }
  for (const p of draft.panels)
    for (const c of p.connectors) {
      const other = draft.panels.find((q) =>
        q.connectors.some((t) => t.id === c.target),
      );
      const target = other.connectors.find((t) => t.id === c.target);
      assert.equal(target.target, c.id);
      assert.equal(p.level, other.level);
      assert.equal(
        world(p, c),
        world(other, target),
        "both boundary halves belong to the same global diamond",
      );
      assert.equal(
        p.cells.find((q) => q.x === c.x && q.y === c.y)?.kind,
        "open",
      );
      const port = assembly.panels
        .find((q) => q.id === p.id)
        .ports.find((q) => q.id === c.id);
      const dx = other.assembly[0] - p.assembly[0],
        dy = other.assembly[1] - p.assembly[1];
      assert.deepEqual(
        [dx, dy],
        { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] }[
          port.edge
        ],
      );
    }
});
test("the four-board floor graph is connected around objects and pits, and shared cells agree", () => {
  const cells = new Map();
  for (const p of draft.panels)
    for (const c of p.cells) {
      const k = world(p, c);
      if (cells.has(k)) assert.equal(cells.get(k), c.kind);
      cells.set(k, c.kind);
    }
  const walk = new Set(
    [...cells].filter(([, v]) => ["open", "item"].includes(v)).map(([k]) => k),
  );
  const queue = [world(draft.panels[0], draft.panels[0].connectors[0])],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i].split(",").map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = `${x + dx},${y + dy}`;
      if (walk.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  assert.equal(
    seen.size,
    walk.size,
    "every authored walkable cell belongs to the connected dungeon",
  );
  for (const p of draft.panels)
    for (const c of p.connectors) assert.ok(seen.has(world(p, c)));
});
