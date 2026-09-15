import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  project,
  unproject,
  PANEL,
  DRAFT_PROJECTION,
  panelWorldOffset,
} from "../web/grid.js";
import { validateDraft } from "../web/panels.js";

test("projection and tile picking round trip at the exact 2:1 scale", () => {
  for (const pitch of [16, 50, 128, 400])
    for (let x = -20; x < 20; x++)
      for (let y = -20; y < 20; y++) {
        const a = project(x + 0.5, y + 0.5, pitch),
          b = unproject(a.x, a.y, pitch);
        assert.equal(Math.floor(b.x), x);
        assert.equal(Math.floor(b.y), y);
      }
  const north = project(0, -1);
  assert.ok(north.x > 0 && north.y < 0);
  const east = project(1, 0);
  assert.ok(east.x > 0 && east.y > 0);
  assert.equal(east.y / east.x, 0.5);
});
const panel = (id, assembly = [0, 0]) => ({
  id,
  name: id,
  inches: 8,
  pitch: 50,
  origin: [0, 0],
  top: "up",
  assembly,
  threshold: 150,
  art: "data:image/png;base64,AAAA",
  cells: [{ x: 9, y: 6, kind: "open" }],
  connectors: [],
});
const draft = (panels) => ({
  format: "heavy-earth-panel-draft",
  version: 2,
  projection: { ...DRAFT_PROJECTION },
  panels,
});

test("panel drafts preserve reciprocal links and manual navigation metadata", () => {
  const a = panel("a"),
    b = panel("b", [1, 0]);
  a.connectors = [{ id: "a1", x: 9, y: 6, direction: "east", target: "b1" }];
  b.connectors = [{ id: "b1", x: 9, y: 6, direction: "west", target: "a1" }];
  const d = draft([a, b]);
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(d))), d);
  b.connectors[0].target = null;
  assert.throws(() => validateDraft(d), /reciprocal/);
});
test("nonstandard dimensions, offsets, rotation, scale and legacy drafts are rejected", () => {
  for (const change of [
    { inches: 10 },
    { pitch: 80 },
    { pitch: 100 },
    { origin: [50, 0] },
    { origin: [0, 25] },
    { origin: [null, 0] },
    { top: "right" },
  ]) {
    const p = { ...panel("bad"), ...change };
    assert.throws(() => validateDraft(draft([p])), /calibration/);
  }
  const d = draft([panel("a")]);
  d.version = 1;
  assert.throws(() => validateDraft(d), /Version 1.*reauthor/);
  d.version = 2;
  d.projection.standard = "HE8-2to1-1in-v1";
  d.projection.tileWidthInches = 1;
  assert.throws(() => validateDraft(d), /1-inch diamonds.*reauthor/);
  d.projection = { ...DRAFT_PROJECTION, ratio: "sqrt3:1" };
  assert.throws(() => validateDraft(d), /Unsupported/);
  assert.throws(
    () => validateDraft(draft([panel("a"), panel("b")])),
    /assembly slot/,
  );
});
test("malformed, duplicate and unsafe draft data is rejected", () => {
  const a = panel("a");
  assert.throws(() => validateDraft(draft([a, a])), /duplicate/);
  a.art = "https://example.com/image.png";
  assert.throws(() => validateDraft(draft([a])), /art/);
  const c = panel("c");
  c.cells.push({ ...c.cells[0] });
  assert.throws(() => validateDraft(draft([c])), /duplicate/);
});
test("arbitrary board placements preserve integer grid coordinates and exact seams", () => {
  // Replacing a panel changes art/annotations, never its origin, angle, or scale.
  for (let column = -12; column <= 12; column++)
    for (let row = -12; row <= 12; row++) {
      const offset = panelWorldOffset(column, row);
      assert.ok(Number.isInteger(offset.x) && Number.isInteger(offset.y));
      for (const [u, v] of [
        [0, 0],
        [3, -2],
        [9, 6],
        [16, 0],
        [24, 8],
      ]) {
        const local = project(u, v, PANEL.tileWidthInches),
          global = project(u + offset.x, v + offset.y, PANEL.tileWidthInches);
        assert.equal(global.x, local.x + column * 8);
        assert.equal(global.y, local.y + row * 8);
      }
    }
  assert.deepEqual(panelWorldOffset(1, 0), { x: 16, y: -16 });
  assert.deepEqual(panelWorldOffset(0, 1), { x: 32, y: 32 });
  for (let shift = 0; shift < 16; shift++) {
    const panels = Array.from({ length: 16 }, (_, i) =>
      panel(`art-${(i + shift) % 16}`, [i % 4, Math.floor(i / 4)]),
    );
    assert.equal(validateDraft(draft(panels)).panels.length, 16);
  }
});
test("actual printable SVG meets the exact physical dimensions and matches all four edges", async () => {
  const svg = await readFile(
    new URL("../web/panel-grid.svg", import.meta.url),
    "utf8",
  );
  assert.match(svg, /width="8in" height="8in" viewBox="0 0 8 8"/);
  const lines = [
    ...svg.matchAll(
      /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g,
    ),
  ].map((m) => m.slice(1).map(Number));
  assert.equal(lines.length, 94);
  function edge(axis, value) {
    const crossings = [];
    for (const [x1, y1, x2, y2] of lines) {
      assert.equal(Math.abs((y2 - y1) / (x2 - x1)), 0.5);
      const slope = (y2 - y1) / (x2 - x1);
      for (const p of [
        [x1, y1],
        [x2, y2],
      ])
        if (p[axis] === value && p[1 - axis] > 0 && p[1 - axis] < 8)
          crossings.push([p[1 - axis], slope]);
    }
    return crossings.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  assert.deepEqual(edge(0, 8), edge(0, 0)); // Any right edge meets any left edge.
  assert.deepEqual(edge(1, 8), edge(1, 0)); // Any bottom edge meets any top edge.
  assert.deepEqual(
    edge(0, 0),
    Array.from({ length: 31 }, (_, i) => [
      [(i + 1) / 4, -0.5],
      [(i + 1) / 4, 0.5],
    ]).flat(),
  );
  assert.deepEqual(
    edge(1, 0),
    Array.from({ length: 15 }, (_, i) => [
      [(i + 1) / 2, -0.5],
      [(i + 1) / 2, 0.5],
    ]).flat(),
  );
});
test("the example project is a portable valid HE8 draft", async () => {
  const d = validateDraft(
    JSON.parse(
      await readFile(
        new URL("../../examples/two-panel-draft.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert.equal(d.panels.length, 2);
  assert.equal(d.panels[0].connectors[0].target, d.panels[1].connectors[0].id);
  assert.equal(d.projection.standard, PANEL.standard);
});
