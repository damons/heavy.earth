import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editPanelFeature, validateDraft } from "../web/panels.js";
const draft = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../examples/calibrated-panels/stacked-levels-draft.json",
        import.meta.url,
      ),
    ),
  );
const feature = (panels, id) =>
  panels.flatMap((p) => p.transitions).find((t) => t.id === id);
test("moving a feature preserves its identity, incoming links, cell tags and source artwork", () => {
  const d = draft(),
    before = JSON.stringify(d),
    r = editPanelFeature(d.panels, "stack-hall", "hall-up", { x: 30, y: 8 });
  assert.equal(r.cleared, 0);
  assert.equal(feature(r.panels, "hall-up").x, 30);
  assert.equal(feature(r.panels, "surface-down").destination.marker, "hall-up");
  assert.equal(feature(r.panels, "hall-up").destination.marker, "surface-down");
  assert.equal(JSON.stringify(d), before);
  for (let i = 0; i < d.panels.length; i++) {
    assert.equal(r.panels[i].art, d.panels[i].art);
    assert.deepEqual(r.panels[i].cells, d.panels[i].cells);
    assert.deepEqual(r.panels[i].connectors, d.panels[i].connectors);
  }
  validateDraft({ ...d, panels: r.panels });
});
test("removing a landing clears its incoming pit without removing any cell or other feature", () => {
  const d = draft(),
    r = editPanelFeature(d.panels, "stack-cistern", "cistern-arrival");
  assert.equal(r.cleared, 1);
  assert.equal(feature(r.panels, "cistern-arrival"), undefined);
  assert.equal(feature(r.panels, "shrine-drop").destination, null);
  assert.ok(feature(r.panels, "cistern-up"));
  assert.equal(
    feature(r.panels, "hall-deeper").destination.marker,
    "cistern-up",
  );
  validateDraft({ ...d, panels: r.panels });
});
test("changing stair type clears incompatible outgoing and incoming destinations", () => {
  const d = draft(),
    r = editPanelFeature(d.panels, "stack-hall", "hall-up", { kind: "steps" });
  assert.equal(r.cleared, 2);
  assert.equal(feature(r.panels, "surface-down").destination, null);
  assert.equal(feature(r.panels, "hall-up").destination, null);
  assert.equal(feature(r.panels, "hall-up").kind, "steps");
  assert.equal(
    feature(r.panels, "hall-deeper").destination.marker,
    "cistern-up",
  );
  validateDraft({ ...d, panels: r.panels });
});
test("a compatible type change preserves an incoming stair link", () => {
  const d = draft(),
    r = editPanelFeature(d.panels, "stack-hall", "hall-up", {
      kind: "landing",
    });
  assert.equal(r.cleared, 1);
  assert.equal(feature(r.panels, "surface-down").destination.marker, "hall-up");
  validateDraft({ ...d, panels: r.panels });
});
test("invalid edits and duplicate same-cell features leave the source untouched", () => {
  const d = draft(),
    before = JSON.stringify(d);
  for (const patch of [
    { kind: "unknown" },
    { x: Infinity },
    { x: 101 },
    { kind: "stairs-down" },
  ])
    assert.throws(() =>
      editPanelFeature(d.panels, "stack-hall", "hall-up", patch),
    );
  assert.throws(() =>
    editPanelFeature(d.panels, "stack-hall", "missing", { x: 5 }),
  );
  assert.equal(JSON.stringify(d), before);
});
