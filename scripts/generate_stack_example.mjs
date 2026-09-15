import { readFile, writeFile } from "node:fs/promises";
import { validateDraft } from "../game/web/panels.js";
const root = new URL("../examples/calibrated-panels/", import.meta.url);
const original = JSON.parse(
  await readFile(new URL("four-panel-draft.json", root), "utf8"),
);
const clone = (index, id, name, level, assembly) => ({
  ...structuredClone(original.panels[index]),
  id,
  name,
  level,
  assembly,
  connectors: [],
  transitions: [],
});
const surface = clone(0, "stack-surface", "Surface gate", 0, [0, 0]);
const hall = clone(0, "stack-hall", "Entrance Hall", 1, [0, 0]),
  shrine = clone(1, "stack-shrine", "Silent Shrine", 1, [1, 0]);
const cistern = clone(2, "stack-cistern", "Dry Cistern", 2, [0, 0]),
  ossuary = clone(3, "stack-ossuary", "Ossuary", 2, [1, 0]);
const deep = clone(3, "stack-deep", "Lower crypt", 3, [1, 0]);
const marker = (id, x, y, kind, target = null) => ({
  id,
  x,
  y,
  kind,
  destination: target,
});
surface.transitions = [
  marker("surface-down", 29, 8, "stairs-down", { marker: "hall-up" }),
];
hall.transitions = [
  marker("hall-up", 29, 8, "stairs-up", { marker: "surface-down" }),
  marker("hall-deeper", 29, 8, "stairs-down", { marker: "cistern-up" }),
  marker("hall-magic", 18, 8, "transporter", "engine"),
];
cistern.transitions = [
  marker("cistern-up", 28, 11, "stairs-up", { marker: "hall-deeper" }),
  marker("cistern-arrival", 28, 11, "landing"),
];
shrine.transitions = [
  marker("shrine-drop", 28, 11, "pit", { marker: "cistern-arrival" }),
  marker("shrine-step", 24, 6, "steps"),
];
ossuary.transitions = [
  marker("ossuary-down", 29, 8, "stairs-down", { marker: "deep-up" }),
  marker("ossuary-random", 18, 8, "teleporter", "engine"),
];
deep.transitions = [
  marker("deep-up", 29, 8, "stairs-up", { marker: "ossuary-down" }),
  marker("deep-unassigned", 18, 8, "elevator"),
];
const pair = (a, b, portA, portB) => {
  a.connectors = [
    { ...portA, id: a.id + "-passage", target: b.id + "-passage" },
  ];
  b.connectors = [
    { ...portB, id: b.id + "-passage", target: a.id + "-passage" },
  ];
};
pair(
  hall,
  shrine,
  original.panels[0].connectors[0],
  original.panels[1].connectors[0],
);
pair(
  cistern,
  ossuary,
  original.panels[2].connectors[1],
  original.panels[3].connectors[1],
);
const draft = {
  ...original,
  panels: [surface, hall, shrine, cistern, ossuary, deep],
};
validateDraft(draft);
await writeFile(
  new URL("stacked-levels-draft.json", root),
  JSON.stringify(draft, null, 2) + "\n",
);
console.log(
  "Created six-panel overview fixture: surface and three dungeon levels. Artwork is reused to demonstrate layout and links.",
);
