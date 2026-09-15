import test from "node:test";
import assert from "node:assert/strict";
import { DungeonLibrary } from "../web/dungeon-library.js";
import { validateDraft, upgradeDraft } from "../web/panels.js";
import { DRAFT_PROJECTION } from "../web/grid.js";
const empty = () => ({
  format: "heavy-earth-panel-draft",
  version: 3,
  projection: DRAFT_PROJECTION,
  panels: [],
});
function library() {
  const l = Object.create(DungeonLibrary.prototype);
  Object.assign(l, {
    current: { id: "dungeon-a", revision: 1, name: "A" },
    name: "A",
    generation: 1,
    saved: 0,
    items: [],
    workshop: { panels: [], draft: empty, validate: validateDraft },
    status: () => {},
    remember: () => {},
    renderList: () => {},
    schedule: () => {},
  });
  return l;
}
test("empty dungeons use the same portable HE8 draft format", () => {
  assert.doesNotThrow(() => validateDraft(empty()));
  assert.deepEqual(upgradeDraft(empty()), empty());
});
test("autosave keeps edits made while a snapshot is being written pending", async () => {
  const l = library();
  let finish;
  l.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const saving = l.save();
  l.generation++;
  finish({ id: "dungeon-a", revision: 2, name: "A", panels: 0 });
  await saving;
  assert.equal(l.saved, 1);
  assert.equal(l.generation, 2);
  assert.equal(l.pending, true);
  assert.equal(l.current.revision, 2);
  l.request = async () => ({
    id: "dungeon-a",
    revision: 3,
    name: "A",
    panels: 0,
  });
  await l.save();
  assert.equal(l.pending, false);
});
test("failed or stale saves retain local work and Save as new can preserve a separate copy", async () => {
  const l = library();
  l.request = async () => {
    throw Error("Changed in another tab");
  };
  await assert.rejects(l.save(), /another tab/);
  assert.equal(l.pending, true);
  assert.equal(l.current.revision, 1);
  await assert.rejects(l.saveBeforeSwitch(), /another tab/);
  l.request = async (route, body) => {
    assert.equal(body.id, null);
    assert.equal(body.revision, null);
    return { id: "dungeon-copy", revision: 1, name: "A", panels: 0 };
  };
  await l.save(true);
  assert.equal(l.current.id, "dungeon-copy");
  assert.equal(l.pending, false);
});
test("switching waits for current edits to save and validates the next draft before adopting it", async () => {
  const l = library(),
    calls = [];
  l.request = async (route) => {
    calls.push(route);
    return route.endsWith("/save")
      ? { id: "dungeon-a", revision: 2, name: "A", panels: 0 }
      : { id: "dungeon-b", name: "B", draft: empty() };
  };
  l.workshop.prepareDraft = async (draft) => {
    calls.push("prepare");
    return { draft, images: new Map() };
  };
  l.adopt = async (record) => {
    calls.push("adopt");
    l.current = record;
  };
  await l.open("dungeon-b");
  assert.deepEqual(calls, [
    "/api/dungeons/save",
    "/api/dungeons/dungeon-b",
    "prepare",
    "adopt",
  ]);
  assert.equal(l.current.id, "dungeon-b");
  l.workshop.prepareDraft = async () => {
    throw Error("Invalid artwork");
  };
  await assert.rejects(l.open("dungeon-c"), /Invalid artwork/);
  assert.equal(l.current.id, "dungeon-b");
});
