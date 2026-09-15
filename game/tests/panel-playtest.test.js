import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DraftRunner } from "../web/panel-playtest.js";
import { panelWorldOffset } from "../web/grid.js";
const draft = (name) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../examples/calibrated-panels/${name}-draft.json`,
        import.meta.url,
      ),
    ),
  ).panels;
const directions = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};
const posKey = (p) => `${p.panelId}:${p.x},${p.y}`;
test("walk all four panels through their real seams and back without changing the draft", () => {
  const panels = draft("four-panel"),
    before = JSON.stringify(panels),
    r = new DraftRunner(panels);
  assert.ok(r.start(panels[0].id));
  const queue = [r.position],
    seen = new Set(queue.map(posKey)),
    crossed = new Set(),
    world = new Set();
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i],
      p = r.byId.get(from.panelId),
      offset = panelWorldOffset(...p.assembly);
    world.add(`${from.x + offset.x},${from.y + offset.y}`);
    for (const d of Object.keys(directions)) {
      r.position = from;
      if (!r.move(d)) continue;
      const to = r.position;
      if (to.panelId !== from.panelId)
        crossed.add(`${from.panelId}>${to.panelId}`);
      if (!seen.has(posKey(to))) {
        seen.add(posKey(to));
        queue.push(to);
      }
    }
  }
  assert.equal(
    crossed.size,
    8,
    "all four physical passages work in both directions",
  );
  assert.equal(
    world.size,
    953,
    "every authored navigable world cell can be reached",
  );
  assert.equal(JSON.stringify(panels), before);
  assert.ok(r.start(panels[0].id));
  assert.equal(r.steps, 0);
});
test("objects, walls, unmarked cells, and unsafe placement block movement; items allow it", () => {
  const panels = draft("four-panel"),
    p = panels[0];
  p.transitions = [];
  p.cells = [
    { x: 24, y: 8, kind: "open" },
    { x: 25, y: 8, kind: "object" },
    { x: 24, y: 9, kind: "wall" },
    { x: 23, y: 8, kind: "item" },
  ];
  const r = new DraftRunner(panels);
  assert.ok(r.place(p.id, 24, 8));
  const start = r.position;
  for (const dir of ["east", "south", "north"]) {
    assert.equal(r.move(dir), false);
    assert.deepEqual(r.position, start);
    assert.equal(r.steps, 0);
  }
  assert.equal(r.place(p.id, 25, 8), false);
  assert.equal(r.place(p.id, -100, 0), false);
  assert.ok(r.move("west"));
  assert.equal(r.steps, 1);
  assert.equal(r.position.x, 23);
});
test("unlinked or misaligned passages cannot move the player to another panel", () => {
  for (const mode of ["unlinked", "offset"]) {
    const panels = draft("four-panel"),
      p = panels[0],
      r0 = new DraftRunner(panels),
      link = r0.model.passages.find(
        (l) => l.panel.id === p.id && l.target.panel.assembly[0] === 1,
      );
    if (mode === "unlinked")
      p.connectors.find((c) => c.id === link.port.id).target = null;
    else panels.find((p) => p.id === link.target.panel.id).assembly[0] += 2;
    const r = new DraftRunner(panels);
    assert.ok(r.place(p.id, link.port.x, link.port.y));
    const before = r.position;
    assert.equal(r.move("east"), false);
    assert.deepEqual(r.position, before);
    assert.match(r.message, /No aligned/);
  }
});
test("stacked stairs reach the surface and lower floors and return only through explicit links", () => {
  const r = new DraftRunner(draft("stacked-levels"));
  assert.ok(r.start("stack-surface"));
  assert.ok(r.useDirection("down"));
  assert.equal(r.panel.id, "stack-hall");
  assert.equal(r.panel.level, 1);
  assert.ok(r.useDirection("down"));
  assert.equal(r.panel.id, "stack-cistern");
  assert.equal(r.panel.level, 2);
  assert.ok(r.useDirection("up"));
  assert.equal(r.panel.id, "stack-hall");
  assert.ok(r.useDirection("up"));
  assert.equal(r.panel.level, 0);
  assert.equal(r.steps, 4);
  assert.ok(r.start("stack-ossuary"));
  assert.ok(r.useDirection("down"));
  assert.equal(r.panel.id, "stack-deep");
  assert.ok(r.useDirection("up"));
  assert.equal(r.panel.id, "stack-ossuary");
});
test("entering a pit drops automatically to its safe landing, including a blocked pit footprint", () => {
  const panels = draft("stacked-levels"),
    r = new DraftRunner(panels),
    p = r.byId.get("stack-shrine"),
    pit = p.transitions.find((t) => t.kind === "pit");
  assert.equal(r.kind(p, pit.x, pit.y), "blocked");
  const entry = Object.entries(directions).find(([, d]) =>
    r.place(p.id, pit.x - d[0], pit.y - d[1]),
  );
  assert.ok(entry);
  assert.ok(r.move(entry[0]));
  assert.equal(r.panel.id, "stack-cistern");
  assert.deepEqual([r.position.x, r.position.y], [28, 11]);
  assert.equal(r.steps, 1);
  assert.match(r.message, /Dropped/);
});
test("missing destinations and game-rule transporters report a problem without moving", () => {
  const r = new DraftRunner(draft("stacked-levels"));
  assert.ok(r.place("stack-hall", 18, 8));
  let before = r.position;
  assert.equal(r.use("hall-magic"), false);
  assert.deepEqual(r.position, before);
  assert.match(r.message, /game rules/);
  assert.ok(r.place("stack-deep", 18, 8));
  before = r.position;
  assert.equal(r.use("deep-unassigned"), false);
  assert.deepEqual(r.position, before);
  assert.match(r.message, /no valid destination/);
  assert.equal(r.steps, 0);
});
test("blocked landings and unresolved pits keep the player at the previous safe position", () => {
  const panels = draft("stacked-levels"),
    landing = panels.find((p) => p.id === "stack-hall");
  landing.cells.find((c) => c.x === 29 && c.y === 8).kind = "object";
  const r = new DraftRunner(panels);
  r.start("stack-surface");
  const before = r.position;
  assert.equal(r.useDirection("down"), false);
  assert.deepEqual(r.position, before);
  assert.match(r.message, /destination is blocked/);
  const four = new DraftRunner(draft("four-panel")),
    p = four.panels.find((p) => p.transitions.some((t) => t.kind === "pit")),
    pit = p.transitions.find((t) => t.kind === "pit");
  const entry = Object.entries(directions).find(([, d]) =>
    four.place(p.id, pit.x - d[0], pit.y - d[1]),
  );
  assert.ok(entry);
  const safe = four.position;
  assert.equal(four.move(entry[0]), false);
  assert.deepEqual(four.position, safe);
  assert.equal(four.steps, 0);
  assert.match(four.message, /game rules/);
});
