import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  overviewModel,
  worldPoint,
  stackPoint,
} from "../web/panel-overview.js";
import { validateDraft } from "../web/panels.js";
const root = new URL("../../examples/calibrated-panels/", import.meta.url);
const original = JSON.parse(
  await readFile(new URL("four-panel-draft.json", root), "utf8"),
);
const stacked = JSON.parse(
  await readFile(new URL("stacked-levels-draft.json", root), "utf8"),
);
test("overview deduplicates reciprocal passages and measures physical seam alignment", () => {
  const model = overviewModel(original.panels);
  assert.deepEqual(model.levels, [1]);
  assert.equal(model.passages.length, 4);
  assert.ok(model.passages.every((p) => p.status === "aligned"));
  const moved = structuredClone(original.panels);
  moved[0].assembly[0] = -1;
  assert.equal(
    overviewModel(moved).passages.filter((p) => p.status === "offset").length,
    2,
  );
  assert.deepEqual(overviewModel(moved).bounds, {
    x: -800,
    y: 0,
    width: 2400,
    height: 1600,
  });
});
test("stack shows fixed directed destinations separately from game-governed and unresolved travel", () => {
  validateDraft(stacked);
  const before = JSON.stringify(stacked),
    model = overviewModel(stacked.panels);
  assert.deepEqual(model.levels, [0, 1, 2, 3]);
  assert.equal(model.passages.length, 2);
  const pit = model.transitions.find((t) => t.marker.kind === "pit");
  assert.equal(pit.target.panel.id, "stack-cistern");
  assert.equal(model.transitions.filter((t) => t.to).length, 7); // Three reciprocal stair pairs plus one-way pit.
  assert.equal(
    model.transitions.filter((t) => t.status === "engine").length,
    2,
  );
  assert.equal(
    model.transitions.find((t) => t.marker.id === "deep-unassigned").status,
    "unassigned",
  );
  assert.equal(
    model.transitions.find((t) => t.marker.kind === "steps").status,
    "local",
  );
  assert.equal(JSON.stringify(stacked), before);
});
test("stack preserves X alignment and common board origins across levels, including negative positions", () => {
  const panels = structuredClone(stacked.panels);
  for (const p of panels) {
    p.assembly[0] -= 2;
    p.assembly[1] -= 3;
  }
  const model = overviewModel(panels),
    a = worldPoint(panels[0], { x: 24, y: 8 }),
    b = worldPoint(panels[1], { x: 24, y: 8 });
  assert.deepEqual(a, b);
  const upper = stackPoint(a, 0, model),
    lower = stackPoint(b, 1, model);
  assert.equal(upper.x, lower.x);
  assert.equal(lower.y - upper.y, model.bounds.height * 0.55 + 240);
  assert.deepEqual(model.bounds, {
    x: -1600,
    y: -2400,
    width: 1600,
    height: 800,
  });
});
test("empty and sparse levels remain bounded without inventing missing floors or targets", () => {
  assert.deepEqual(overviewModel([]).levels, []);
  const panels = structuredClone(stacked.panels.slice(0, 2));
  panels[1].level = 1000;
  panels[1].connectors[0].target = null;
  const model = overviewModel(panels);
  assert.deepEqual(model.levels, [0, 1000]);
  assert.equal(model.passages[0].status, "unlinked");
  assert.equal(
    model.transitions.find((t) => t.marker.id === "hall-deeper").status,
    "invalid",
  );
});
