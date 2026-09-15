import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateDraft,
  upgradeDraft,
  canLinkLevelMarker,
} from "../web/panels.js";
import {
  DRAFT_PROJECTION,
  cellPolygon,
  cellCropGeometry,
  project,
  PANEL,
} from "../web/grid.js";
const panel = (id, level = 1) => ({
  id,
  name: id,
  level,
  inches: 8,
  pitch: 50,
  origin: [0, 0],
  top: "up",
  assembly: [0, 0],
  threshold: 150,
  art: "data:image/png;base64,AAAA",
  cells: [],
  connectors: [],
  transitions: [],
});
const draft = (panels) => ({
  format: "heavy-earth-panel-draft",
  version: 3,
  projection: { ...DRAFT_PROJECTION },
  panels,
});
const marker = (id, kind, destination = null) => ({
  id,
  kind,
  x: 24,
  y: 8,
  destination,
});
test("legacy drafts upgrade without reinterpreting artwork or existing annotations", async () => {
  const old = JSON.parse(
    await readFile(
      new URL("../../examples/two-panel-draft.json", import.meta.url),
      "utf8",
    ),
  );
  const before = JSON.stringify(old),
    upgraded = upgradeDraft(old);
  assert.equal(JSON.stringify(old), before);
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.panels[0].art, old.panels[0].art);
  assert.deepEqual(upgraded.panels[0].cells, old.panels[0].cells);
  assert.deepEqual(upgraded.panels[0].transitions, []);
  assert.equal(upgraded.panels[0].level, 1);
  validateDraft(upgraded);
});
test("stacked panels allow the same assembly slot only on different levels", () => {
  const a = panel("a", 1),
    b = panel("b", 2);
  validateDraft(draft([a, b]));
  b.level = 1;
  assert.throws(() => validateDraft(draft([a, b])), /same assembly/);
  for (const level of [-1, 1.5, 1001, null]) {
    a.level = level;
    assert.throws(() => validateDraft(draft([a])), /dungeon level/);
  }
});
test("stairs and pits use directed adjacent-level endpoints, including surface", () => {
  const a = panel("a", 1),
    b = panel("b", 2);
  a.transitions = [
    marker("down", "stairs-down", { marker: "up" }),
    marker("pit", "pit", { marker: "landing" }),
  ];
  b.transitions = [
    marker("up", "stairs-up", { marker: "down" }),
    marker("landing", "landing"),
  ];
  validateDraft(draft([a, b]));
  b.transitions[0].destination = null;
  validateDraft(draft([a, b])); // Return travel is separately authored.
  assert.equal(
    canLinkLevelMarker(a, a.transitions[0], b, b.transitions[1]),
    true,
  );
  b.level = 3;
  assert.throws(() => validateDraft(draft([a, b])), /adjacent level/);
  b.level = 0;
  a.transitions = [marker("surface-up", "stairs-up", { marker: "landing" })];
  b.transitions = [marker("landing", "landing")];
  validateDraft(draft([a, b]));
});
test("transport modes, invalid targets, duplicate IDs and local steps are validated", () => {
  const a = panel("a");
  a.transitions = [
    marker("ex", "transporter", "engine"),
    marker("tp", "teleporter", "engine"),
    marker("el", "elevator", "engine"),
    marker("s", "steps"),
  ];
  validateDraft(draft([a]));
  a.transitions[0].destination = { marker: "s" };
  assert.throws(() => validateDraft(draft([a])), /Magical transport/);
  a.transitions[0].destination = "engine";
  a.transitions[3].destination = "engine";
  assert.throws(() => validateDraft(draft([a])), /local steps/);
  a.transitions[3].destination = null;
  a.transitions.push(marker("bad", "stairs-down", { marker: "missing" }));
  assert.throws(() => validateDraft(draft([a])), /destination/);
  a.transitions.pop();
  a.transitions.push(marker("ex", "landing"));
  assert.throws(() => validateDraft(draft([a])), /duplicate/);
  a.transitions.pop();
  a.transitions.push(marker("bad", "toString"));
  assert.throws(() => validateDraft(draft([a])), /Invalid/);
});
test("ordinary passages cannot silently become cross-level links", () => {
  const a = panel("a", 1),
    b = panel("b", 2);
  a.connectors = [{ id: "a1", x: 24, y: 8, direction: "east", target: "b1" }];
  b.connectors = [{ id: "b1", x: 24, y: 8, direction: "west", target: "a1" }];
  assert.throws(() => validateDraft(draft([a, b])), /same level/);
});
test("diamond cuts use exact size, area, slope and center at arbitrary cells", () => {
  for (let x = -5; x < 50; x++)
    for (let y = -18; y < 34; y++) {
      const g = cellCropGeometry(x, y);
      assert.equal(g.width, 50);
      assert.equal(g.height, 25);
      const center = project(x + 0.5, y + 0.5, PANEL.pitchPixels);
      assert.equal(g.left + 25, center.x);
      assert.equal(g.top + 12.5, center.y);
      const area =
        Math.abs(
          g.polygon.reduce((s, p, i) => {
            const q = g.polygon[(i + 1) % 4];
            assert.equal(Math.abs((q.y - p.y) / (q.x - p.x)), 0.5);
            return s + p.x * q.y - q.x * p.y;
          }, 0),
        ) / 2;
      assert.equal(area, 625);
    }
});
test("calibrated artwork polygons exactly match authored cells and the HE8 projection", async () => {
  const root = new URL("../../examples/calibrated-panels/", import.meta.url);
  const d = validateDraft(
    JSON.parse(await readFile(new URL("four-panel-draft.json", root), "utf8")),
  );
  assert.equal(d.panels.length, 4);
  for (const p of d.panels) {
    const svg = await readFile(new URL(p.id + ".svg", root), "utf8");
    assert.match(svg, /width="8in" height="8in" viewBox="0 0 800 800"/);
    assert.ok(svg.indexOf('id="grid-first"') < svg.indexOf('id="ink-detail"'));
    const cells = new Map(p.cells.map((c) => [`${c.x},${c.y}`, c]));
    let count = 0;
    for (const m of svg.matchAll(
      /<polygon points="([^"]+)"[^>]*data-cell="([^"]+)"/g,
    )) {
      const c = cells.get(m[2]);
      assert.ok(c);
      assert.ok(!["wall", "blocked"].includes(c.kind));
      const expected = cellPolygon(c.x, c.y).map((q) => [q.x, q.y]);
      const actual = m[1].split(" ").map((p) => p.split(",").map(Number));
      assert.deepEqual(actual, expected);
      count++;
    }
    assert.equal(
      count,
      p.cells.filter((c) => !["wall", "blocked"].includes(c.kind)).length,
    );
    const meta = JSON.parse(
      await readFile(new URL(p.id + "-cells.json", root), "utf8"),
    );
    for (const c of meta.cells)
      assert.deepEqual(c.polygon, cellPolygon(c.x, c.y));
  }
});

test("cell categories are versioned and the exported atlas preserves ground polygons", async () => {
  const p = panel("p");
  p.cells = ["open", "blocked", "wall", "object", "item"].map((kind, i) => ({
    x: 24 + i,
    y: 8,
    kind,
  }));
  validateDraft(draft([p]));
  p.cells[0].kind = "toString";
  assert.throws(() => validateDraft(draft([p])), /cell annotation/);
  const atlas = JSON.parse(
    await readFile(
      new URL(
        "../../examples/calibrated-panels/entrance-cell-art.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(atlas.format, "heavy-earth-cell-art");
  assert.equal(atlas.tiles.length, 324);
  for (const t of atlas.tiles) {
    const g = cellCropGeometry(t.x, t.y);
    assert.deepEqual(t.polygon, g.polygon);
    assert.deepEqual(t.pixelOrigin, [g.left, g.top]);
    assert.equal(t.width, 50);
    assert.equal(t.height, 25);
  }
});
