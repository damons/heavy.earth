import test from "node:test";
import assert from "node:assert/strict";
import { project, unproject } from "../web/renderer.js";
import { validateDraft } from "../web/panels.js";
test("projection and tile picking round trip at the shared 30-degree scale", () => {
  for (const pitch of [16, 80, 128, 400])
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
  assert.ok(Math.abs(Math.atan(east.y / east.x) - Math.PI / 6) < 1e-12);
});
const panel = (id) => ({
  id,
  name: id,
  inches: 8,
  pitch: 80,
  origin: [400, 100],
  assembly: [0, 0],
  threshold: 150,
  art: "data:image/png;base64,AAAA",
  cells: [{ x: 0, y: 0, kind: "open" }],
  connectors: [],
});
const draft = (panels) => ({
  format: "heavy-earth-panel-draft",
  version: 1,
  projection: { angleDegrees: 30, previewPixels: 800 },
  panels,
});
test("panel drafts preserve reciprocal links and manual navigation metadata", () => {
  const a = panel("a"),
    b = panel("b");
  a.connectors = [{ id: "a1", x: 0, y: 0, direction: "east", target: "b1" }];
  b.connectors = [{ id: "b1", x: 1, y: 2, direction: "west", target: "a1" }];
  const d = draft([a, b]);
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(d))), d);
  b.connectors[0].target = null;
  assert.throws(() => validateDraft(d), /reciprocal/);
});
test("malformed, duplicate and unsafe draft data is rejected", () => {
  const a = panel("a");
  assert.throws(() => validateDraft(draft([a, a])), /duplicate/);
  a.art = "https://example.com/image.png";
  assert.throws(() => validateDraft(draft([a])), /art/);
  const b = panel("b");
  b.origin[0] = null;
  assert.throws(() => validateDraft(draft([b])), /calibration/);
  const c = panel("c");
  c.cells.push({ ...c.cells[0] });
  assert.throws(() => validateDraft(draft([c])), /duplicate/);
});
test("the example project is a portable valid two-panel draft", async () => {
  const { readFile } = await import("node:fs/promises");
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
});
