import { project, cellPolygon } from "../game/web/grid.js";
export const key = (x, y) => `${x},${y}`;
export const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
export const pt = (x, y, z = 0) => {
  const p = project(x, y, 50);
  return [p.x, p.y - z];
};
export const inside = (x, y, [u, v, w, h]) =>
  x >= u && x < u + w && y >= v && y < v + h;
export const offset = ([x, y]) => [16 * x + 32 * y, -16 * x + 32 * y];
export const configs = [
  {
    slug: "01-entrance-hall",
    name: "Entrance Hall",
    assembly: [0, 0],
    level: 1,
    regions: [
      [17, 1, 14, 14],
      [27, -4, 2, 10],
      [27, -4, 14, 2],
      [27, 10, 2, 12],
      [27, 20, 13, 2],
      [38, 20, 2, 14],
      [15, 9, 2, 4],
    ],
    props: [
      ["pillar", 20, 4, 1, 1],
      ["pillar", 26, 4, 1, 1],
      ["pillar", 20, 11, 1, 1],
      ["pillar", 26, 11, 1, 1],
      ["crate", 17, 10, 1, 1],
      ["barrel", 18, 12, 1, 1],
      ["chest", 23, 6, 1, 1],
      ["rubble", 15, 10, 2, 2],
    ],
    doors: [
      [27, 1, "u", "arch"],
      [27, 15, "u", "broken"],
    ],
    markers: [
      {
        id: "hall-down",
        x: 29,
        y: 8,
        kind: "stairs-down",
        destination: "engine",
      },
      {
        id: "hall-transporter",
        x: 18,
        y: 8,
        kind: "transporter",
        destination: "engine",
      },
    ],
    ports: [
      {
        id: "hall-east",
        edge: "east",
        span: [300, 350],
        x: 29,
        y: -3,
        direction: "east",
        target: "shrine-west",
      },
      {
        id: "hall-south",
        edge: "south",
        span: [300, 400],
        x: 38,
        y: 25,
        direction: "south",
        target: "cistern-north",
      },
    ],
  },
  {
    slug: "02-silent-shrine",
    name: "Silent Shrine",
    assembly: [1, 0],
    level: 1,
    regions: [
      [17, 1, 14, 14],
      [10, 12, 10, 2],
      [28, 10, 2, 10],
      [28, 18, 16, 2],
      [42, 18, 2, 14],
      [20, -1, 6, 2],
    ],
    props: [
      ["altar", 20, 3, 5, 2],
      ["urn", 18, 2, 1, 1],
      ["urn", 28, 2, 1, 1],
      ["chest", 27, 11, 1, 1],
      ["rubble", 29, 12, 1, 2],
    ],
    doors: [
      [17, 12, "v", "arch"],
      [28, 15, "u", "gate"],
    ],
    markers: [
      { id: "shrine-steps", x: 24, y: 6, kind: "steps", destination: null },
      { id: "shrine-pit", x: 28, y: 11, kind: "pit", destination: "engine" },
    ],
    ports: [
      {
        id: "shrine-west",
        edge: "west",
        span: [300, 350],
        x: 13,
        y: 13,
        direction: "west",
        target: "hall-east",
      },
      {
        id: "shrine-south",
        edge: "south",
        span: [500, 600],
        x: 42,
        y: 21,
        direction: "south",
        target: "ossuary-north",
      },
    ],
  },
  {
    slug: "03-dry-cistern",
    name: "Dry Cistern",
    assembly: [0, 1],
    level: 1,
    regions: [
      [17, 1, 14, 14],
      [6, -12, 2, 18],
      [6, 4, 14, 2],
      [28, 4, 15, 2],
      [18, 15, 5, 2],
    ],
    props: [
      ["barrel", 18, 2, 1, 1],
      ["barrel", 19, 2, 1, 1],
      ["crate", 18, 12, 1, 1],
      ["chest", 19, 4, 1, 1],
      ["rubble", 18, 15, 2, 2],
      ["urn", 28, 12, 1, 1],
    ],
    doors: [
      [17, 4, "v", "broken"],
      [31, 4, "v", "arch"],
    ],
    markers: [
      {
        id: "cistern-landing",
        x: 28,
        y: 11,
        kind: "landing",
        destination: null,
      },
      {
        id: "cistern-elevator",
        x: 18,
        y: 8,
        kind: "elevator",
        destination: "engine",
      },
    ],
    ports: [
      {
        id: "cistern-north",
        edge: "north",
        span: [300, 400],
        x: 6,
        y: -7,
        direction: "north",
        target: "hall-south",
      },
      {
        id: "cistern-east",
        edge: "east",
        span: [500, 550],
        x: 37,
        y: 5,
        direction: "east",
        target: "ossuary-west",
      },
    ],
  },
  {
    slug: "04-ossuary",
    name: "Ossuary",
    assembly: [1, 1],
    level: 1,
    regions: [
      [17, 1, 14, 14],
      [10, -16, 2, 16],
      [10, -2, 10, 2],
      [18, -2, 2, 7],
      [23, 10, 2, 12],
      [18, 20, 7, 2],
      [15, 9, 2, 5],
    ],
    props: [
      ["tomb", 20, 4, 3, 1],
      ["tomb", 24, 7, 3, 1],
      ["tomb", 20, 10, 3, 1],
      ["chest", 27, 12, 1, 1],
      ["fallen-column", 15, 10, 2, 3],
      ["urn", 29, 2, 1, 1],
    ],
    doors: [
      [18, 1, "u", "arch"],
      [23, 15, "u", "arch"],
    ],
    markers: [
      { id: "crypt-up", x: 29, y: 8, kind: "stairs-up", destination: "engine" },
      {
        id: "crypt-teleporter",
        x: 18,
        y: 8,
        kind: "teleporter",
        destination: "engine",
      },
    ],
    ports: [
      {
        id: "ossuary-north",
        edge: "north",
        span: [500, 600],
        x: 10,
        y: -11,
        direction: "north",
        target: "shrine-south",
      },
      {
        id: "ossuary-west",
        edge: "west",
        span: [500, 550],
        x: 21,
        y: 21,
        direction: "west",
        target: "cistern-east",
      },
    ],
  },
];
export function touchesBoard(x, y, assembly) {
  const p = pt(x + 0.5, y + 0.5),
    a = assembly[0] * 800,
    b = assembly[1] * 800;
  // Strict diamond/rectangle intersection (including partial boundary diamonds).
  const dx = Math.max(a - p[0], 0, p[0] - (a + 800)),
    dy = Math.max(b - p[1], 0, p[1] - (b + 800));
  return dx / 25 + dy / 12.5 < 1;
}
export function buildLayout() {
  const cells = new Map();
  for (const c of configs) {
    const [ox, oy] = offset(c.assembly);
    for (let x = -16; x < 65; x++)
      for (let y = -32; y < 65; y++) {
        if (
          !c.regions.some((r) => inside(x, y, r)) ||
          !touchesBoard(x + ox, y + oy, c.assembly)
        )
          continue;
        let kind = "open";
        if (
          (c.slug === "03-dry-cistern" &&
            inside(x, y, [21, 4, 6, 8]) &&
            !(y >= 7 && y < 9)) ||
          (c.slug === "02-silent-shrine" && x === 28 && y === 11)
        )
          kind = "blocked";
        const prop = c.props.find(([, u, v, w, h]) =>
          inside(x, y, [u, v, w, h]),
        );
        if (prop) kind = prop[0] === "chest" ? "item" : "object";
        cells.set(key(x + ox, y + oy), {
          x: x + ox,
          y: y + oy,
          kind,
          theme: c.slug,
        });
      }
  }
  const floor = new Set(
    [...cells].filter(([, c]) => c.kind !== "blocked").map(([k]) => k),
  );
  for (const c of [...cells.values()])
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = c.x + dx,
        y = c.y + dy;
      if (!cells.has(key(x, y)))
        cells.set(key(x, y), { x, y, kind: "wall", theme: c.theme });
    }
  return { cells, floor };
}
export function localCells(layout, c) {
  const [ox, oy] = offset(c.assembly);
  return [...layout.cells.values()]
    .filter((p) => touchesBoard(p.x, p.y, c.assembly))
    .map(({ x, y, kind }) => ({ x: x - ox, y: y - oy, kind }));
}
export const polygonFor = (x, y) => cellPolygon(x, y).map((p) => [p.x, p.y]);
