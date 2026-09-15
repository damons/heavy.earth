import { project, unproject, cellPolygon, panelWorldOffset } from "./grid.js";
import { overviewModel, worldPoint } from "./panel-overview.js";
const key = (x, y) => `${x},${y}`;
const safe = (kind) => kind === "open" || kind === "item";
const directions = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};
const labels = {
  "stairs-up": "stairs up",
  "stairs-down": "stairs down",
  pit: "pit",
  landing: "arrival point",
  steps: "local steps",
  transporter: "Excelsior Transporter",
  teleporter: "random teleporter",
  elevator: "elevator",
};
// Intervals of traversable ground along a physical board edge, in preview pixels.
export function edgeOpenings(panel, edge) {
  const vertical = ["east", "west"].includes(edge),
    a = vertical ? "x" : "y",
    b = vertical ? "y" : "x",
    boundary = ["east", "south"].includes(edge) ? 800 : 0,
    spans = [];
  for (const c of panel.cells.filter((c) => safe(c.kind))) {
    const polygon = cellPolygon(c.x, c.y, panel.pitch),
      hits = [];
    for (let i = 0; i < 4; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % 4];
      if ((p[a] - boundary) * (q[a] - boundary) <= 0 && p[a] !== q[a]) {
        const t = (boundary - p[a]) / (q[a] - p[a]);
        hits.push(p[b] + t * (q[b] - p[b]));
      }
    }
    if (hits.length > 1) {
      const lo = Math.max(0, Math.min(...hits)),
        hi = Math.min(800, Math.max(...hits));
      if (hi > lo) spans.push([lo, hi]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push(span);
  }
  return merged;
}
export class DraftRunner {
  constructor(panels) {
    this.panels = structuredClone(panels);
    this.byId = new Map(this.panels.map((p) => [p.id, p]));
    this.cells = new Map(
      this.panels.map((p) => [
        p.id,
        new Map(p.cells.map((c) => [key(c.x, c.y), c.kind])),
      ]),
    );
    this.model = overviewModel(this.panels);
    this.position = null;
    this.steps = 0;
    this.message = "Choose a panel with marked walkable cells.";
  }
  get panel() {
    return this.byId.get(this.position?.panelId);
  }
  kind(panel, x, y) {
    return this.cells.get(panel.id)?.get(key(x, y));
  }
  inside(panel, x, y) {
    const p = project(x + 0.5, y + 0.5, panel.pitch);
    return p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 800;
  }
  fail(message) {
    this.message = message;
    return false;
  }
  markers(position = this.position) {
    if (!position) return [];
    return (this.byId.get(position.panelId)?.transitions ?? []).filter(
      (t) => t.x === position.x && t.y === position.y,
    );
  }
  start(panelId) {
    const panel = this.byId.get(panelId);
    if (!panel) return this.fail("Import a panel draft first.");
    const candidates = panel.cells.filter(
      (c) =>
        safe(c.kind) &&
        this.inside(panel, c.x, c.y) &&
        !panel.transitions.some(
          (t) => t.kind === "pit" && t.x === c.x && t.y === c.y,
        ),
    );
    const preferred = panel.transitions.find(
      (t) =>
        ["stairs-up", "stairs-down", "landing"].includes(t.kind) &&
        candidates.some((c) => c.x === t.x && c.y === t.y),
    );
    const start =
      preferred ??
      candidates.sort((a, b) => {
        const distance = (c) => {
          const p = project(c.x + 0.5, c.y + 0.5, panel.pitch);
          return Math.hypot(p.x - 400, p.y - 400);
        };
        return distance(a) - distance(b);
      })[0];
    this.position = null;
    this.steps = 0;
    if (!start)
      return this.fail(
        `${panel.name} has no marked, safe starting cells. Mark walkable cells in Panel view.`,
      );
    return this.place(panel.id, start.x, start.y);
  }
  place(panelId, x, y) {
    const panel = this.byId.get(panelId);
    if (
      !panel ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !this.inside(panel, x, y) ||
      !safe(this.kind(panel, x, y)) ||
      panel.transitions.some((t) => t.kind === "pit" && t.x === x && t.y === y)
    )
      return this.fail(
        "Place the player on a marked walkable or item cell, away from pits.",
      );
    this.position = { panelId, x, y };
    this.message = `Placed in ${panel.name}, level ${panel.level}, cell (${x}, ${y}).`;
    return true;
  }
  // Convert a local cell into the identical world-grid coordinate on another board.
  localOn(from, to, x, y) {
    const a = panelWorldOffset(...from.assembly),
      b = panelWorldOffset(...to.assembly);
    return { x: x + a.x - b.x, y: y + a.y - b.y };
  }
  crossing(from, to, next, port, targetPort) {
    const dx = to.assembly[0] - from.assembly[0],
      dy = to.assembly[1] - from.assembly[1];
    const edge = dx > 0 ? "east" : dx < 0 ? "west" : dy > 0 ? "south" : "north",
      opposite = { east: "west", west: "east", south: "north", north: "south" }[
        edge
      ];
    const a = worldPoint(from, this.position),
      b = worldPoint(from, next),
      axis = dx ? "x" : "y",
      other = dx ? "y" : "x",
      boundary =
        (dx
          ? Math.max(from.assembly[0], to.assembly[0])
          : Math.max(from.assembly[1], to.assembly[1])) * 800;
    if (a[axis] === b[axis]) return false;
    const t = (boundary - a[axis]) / (b[axis] - a[axis]);
    if (t < 0 || t > 1) return false;
    const q = a[other] + t * (b[other] - a[other]);
    const connectedSpan = (p, side, connector) => {
      const c = project(connector.x + 0.5, connector.y + 0.5, p.pitch);
      const anchor = c[other],
        offset = p.assembly[dx ? 1 : 0] * 800;
      return edgeOpenings(p, side).some(
        ([lo, hi]) =>
          anchor > lo && anchor < hi && q > lo + offset && q < hi + offset,
      );
    };
    return (
      connectedSpan(from, edge, port) && connectedSpan(to, opposite, targetPort)
    );
  }
  move(direction) {
    if (!this.position) return this.fail("Place a player before moving.");
    const delta = Object.hasOwn(directions, direction) && directions[direction];
    if (!delta) return false;
    const from = this.panel,
      next = { x: this.position.x + delta[0], y: this.position.y + delta[1] };
    let panel = from,
      cell = next;
    if (!this.inside(from, next.x, next.y)) {
      const links = this.model.passages.filter(
        (l) =>
          l.status === "aligned" &&
          (l.panel.id === from.id || l.target?.panel.id === from.id),
      );
      let route;
      for (const link of links) {
        const forward = link.panel.id === from.id,
          to = forward ? link.target.panel : link.panel,
          port = forward ? link.port : link.target.port,
          targetPort = forward ? link.target.port : link.port,
          c = this.localOn(from, to, next.x, next.y);
        if (
          this.inside(to, c.x, c.y) &&
          this.crossing(from, to, next, port, targetPort)
        ) {
          route = { panel: to, cell: c };
          break;
        }
      }
      if (!route)
        return this.fail(
          "No aligned linked passage crosses this edge here. Review the passage and panel placement in Level map.",
        );
      panel = route.panel;
      cell = route.cell;
    }
    const proposed = { panelId: panel.id, ...cell },
      pit = this.markers(proposed).find((t) => t.kind === "pit");
    if (pit) {
      const arrival = this.destination(panel, pit);
      if (!arrival) return false;
      this.position = arrival;
      this.steps++;
      this.message = `Dropped through the pit to ${this.panel.name}, level ${this.panel.level}.`;
      return true;
    }
    const kind = this.kind(panel, cell.x, cell.y);
    if (!safe(kind))
      return this.fail(
        `Cannot move there: ${kind === "object" ? "object footprint" : (kind ?? "unmarked cell")}. Review this cell in the editor.`,
      );
    this.position = proposed;
    this.steps++;
    this.message = `${from.id !== panel.id ? "Crossed into " + panel.name + ". " : ""}Cell (${cell.x}, ${cell.y}) · level ${panel.level}.`;
    return true;
  }
  destination(panel, marker) {
    if (marker.destination === "engine") {
      this.fail(
        `${labels[marker.kind]} uses game rules and has no fixed test destination. Assign a specific stair/pit landing in the editor to test a route.`,
      );
      return null;
    }
    const link = this.model.transitions.find(
      (t) => t.panel.id === panel.id && t.marker.id === marker.id,
    );
    if (!link?.target) {
      this.fail(
        `The ${labels[marker.kind]} has no valid destination. Link it in Panel view.`,
      );
      return null;
    }
    const to = link.target.panel,
      t = link.target.marker,
      delta = { "stairs-up": -1, "stairs-down": 1, pit: 1, elevator: -1 }[
        marker.kind
      ];
    if (
      delta === undefined ||
      to.level !== panel.level + delta ||
      !["stairs-up", "stairs-down", "landing"].includes(t.kind)
    ) {
      this.fail(
        "This level link is invalid. Review its marker kind and destination level.",
      );
      return null;
    }
    if (
      !safe(this.kind(to, t.x, t.y)) ||
      !this.inside(to, t.x, t.y) ||
      to.transitions.some((m) => m.kind === "pit" && m.x === t.x && m.y === t.y)
    ) {
      this.fail(
        "The destination is blocked, unmarked, outside its panel, or another pit. Mark a safe landing cell.",
      );
      return null;
    }
    return { panelId: to.id, x: t.x, y: t.y };
  }
  use(id) {
    const marker = this.markers().find((t) => t.id === id);
    if (!marker) return this.fail("Move onto the level marker first.");
    if (["landing", "steps"].includes(marker.kind))
      return this.fail("This marker stays on the current level.");
    const arrival = this.destination(this.panel, marker);
    if (!arrival) return false;
    this.position = arrival;
    this.steps++;
    this.message = `Used ${labels[marker.kind]} → ${this.panel.name}, level ${this.panel.level}.`;
    return true;
  }
  useDirection(direction) {
    const kinds =
      direction === "up" ? ["stairs-up", "elevator"] : ["stairs-down", "pit"];
    const m = this.markers().find((m) => kinds.includes(m.kind));
    return m
      ? this.use(m.id)
      : this.fail(
          `No ${direction === "up" ? "upward" : "downward"} level marker at this cell.`,
        );
  }
}
const $ = (id) => document.getElementById(id),
  NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
export class PanelPlaytest {
  constructor(workshop) {
    this.workshop = workshop;
    this.placing = false;
    $("playtest-start-panel").onchange = () => {
      this.runner.start($("playtest-start-panel").value);
      this.refresh(true);
    };
    $("playtest-reset").onclick = () => {
      this.runner.start($("playtest-start-panel").value);
      this.refresh(true);
    };
    $("playtest-place").onclick = () => {
      this.placing = !this.placing;
      this.refresh();
    };
    $("playtest-center").onclick = () => this.center();
    for (const dir of Object.keys(directions))
      $("playtest-" + dir).onclick = () => this.move(dir);
    $("playtest-up").onclick = () => this.useDirection("up");
    $("playtest-down").onclick = () => this.useDirection("down");
    document.addEventListener("keydown", (e) => {
      if (!e.defaultPrevented) this.key(e);
    });
  }
  get active() {
    return this.workshop.viewMode === "test";
  }
  begin() {
    this.runner = new DraftRunner(this.workshop.panels);
    this.placing = false;
    this.runner.start(this.workshop.selected ?? this.workshop.panels[0]?.id);
    this.refresh(true);
  }
  key(e) {
    if (
      !this.active ||
      $("panel-screen").hidden ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.repeat ||
      e.target.closest("input,select,textarea") ||
      $("book-dialog").open
    )
      return false;
    const k = e.key.toLowerCase(),
      dir = {
        w: "north",
        arrowup: "north",
        d: "east",
        arrowright: "east",
        x: "south",
        s: "south",
        arrowdown: "south",
        a: "west",
        arrowleft: "west",
      }[k];
    if (dir) {
      e.preventDefault();
      this.move(dir);
      return true;
    }
    if (["u", "j", "3", "9"].includes(k)) {
      e.preventDefault();
      this.useDirection(k === "u" || k === "9" ? "up" : "down");
      return true;
    }
    return false;
  }
  click(panelId, point) {
    if (!this.active) return false;
    const panel = this.runner.byId.get(panelId),
      q = unproject(
        point.x - panel.assembly[0] * 800,
        point.y - panel.assembly[1] * 800,
        panel.pitch,
      ),
      x = Math.floor(q.x),
      y = Math.floor(q.y);
    if (this.placing) {
      if (this.runner.place(panelId, x, y)) this.placing = false;
      this.refresh();
      return true;
    }
    const current = this.runner.position;
    if (!current) {
      this.runner.fail(
        "Choose Place player, then click a marked walkable cell.",
      );
      this.refresh();
      return true;
    }
    const target = this.runner.localOn(panel, this.runner.panel, x, y),
      dx = target.x - current.x,
      dy = target.y - current.y;
    const dir = Object.entries(directions).find(
      ([, d]) => d[0] === dx && d[1] === dy,
    )?.[0];
    if (dir) this.move(dir);
    else {
      this.runner.fail(
        "Click an adjacent diamond to move, or enable Place player to choose a test position.",
      );
      this.refresh();
    }
    return true;
  }
  move(dir) {
    const level = this.runner.panel?.level;
    this.runner.move(dir);
    this.refresh(this.runner.panel?.level !== level);
  }
  useDirection(dir) {
    this.runner.useDirection(dir);
    this.refresh(true);
  }
  center() {
    if (!this.runner.position) return;
    const p = worldPoint(this.runner.panel, this.runner.position);
    this.workshop.overview.centerOn(p, 800);
  }
  refresh(center = false) {
    if (!this.runner) return;
    const p = this.runner.panel;
    if (p) {
      this.workshop.selected = p.id;
      this.workshop.controls();
    }
    $("playtest-start-panel").replaceChildren(
      ...this.runner.panels.map((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = `${p.name} · level ${p.level}`;
        return o;
      }),
    );
    if (p) $("playtest-start-panel").value = p.id;
    $("playtest-place").setAttribute("aria-pressed", String(this.placing));
    $("playtest-status").textContent = this.runner.message;
    $("playtest-position").textContent = p
      ? `${p.name} · level ${p.level} · (${this.runner.position.x}, ${this.runner.position.y}) · ${this.runner.steps} test steps`
      : "No player placed";
    $("playtest-click-hint").textContent = this.placing
      ? "Placement enabled: click a marked safe cell on this floor."
      : "Click an adjacent diamond to move. W/A/X/D or arrow keys move; U goes up, J goes down. Pits drop automatically when linked.";
    $("playtest-actions").replaceChildren(
      ...this.runner
        .markers()
        .filter((m) => !["landing", "steps", "pit"].includes(m.kind))
        .map((m) => {
          const b = document.createElement("button");
          b.className = "secondary";
          b.textContent = `Use ${labels[m.kind]}`;
          b.onclick = () => {
            this.runner.use(m.id);
            this.refresh(true);
          };
          return b;
        }),
    );
    this.workshop.draw();
    if (center) this.center();
    else if (p) {
      const a = worldPoint(p, this.runner.position),
        v = this.workshop.overview.view;
      if (a.x < v.x || a.y < v.y || a.x > v.x + v.width || a.y > v.y + v.height)
        this.workshop.overview.centerOn(a);
    }
  }
  draw() {
    const map = this.workshop.overview.svg;
    map.querySelector("#playtest-player")?.remove();
    if (!this.active || !this.runner?.position) return;
    const panel = this.runner.panel,
      position = this.runner.position,
      p = worldPoint(panel, position),
      scale = map.getScreenCTM()?.a || 1;
    const group = svg("g", {
      id: "playtest-player",
      role: "img",
      "aria-label": `Player in ${panel.name}, level ${panel.level}, cell ${position.x}, ${position.y}`,
      "pointer-events": "none",
    });
    const poly = cellPolygon(position.x, position.y, panel.pitch)
      .map(
        (q) =>
          `${q.x + panel.assembly[0] * 800},${q.y + panel.assembly[1] * 800}`,
      )
      .join(" ");
    group.append(
      svg("polygon", {
        points: poly,
        fill: "#fff",
        "fill-opacity": 0.4,
        stroke: "#fff",
        "stroke-width": 2,
        "vector-effect": "non-scaling-stroke",
      }),
    );
    const token = svg("g", {
      transform: `translate(${p.x} ${p.y}) scale(${1 / scale})`,
    });
    token.append(
      svg("circle", {
        cx: 0,
        cy: -9,
        r: 3.3,
        fill: "#fff",
        stroke: "#111",
        "stroke-width": 1.5,
      }),
      svg("path", {
        d: "M-2-5H2L6 4H-6Z",
        fill: "#fff",
        stroke: "#111",
        "stroke-width": 1.5,
      }),
    );
    group.append(token);
    map.append(group);
  }
}
