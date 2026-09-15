import { project, PANEL } from "./grid.js";
const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const depth = (p) => p.level ?? 1;
export function worldPoint(panel, cell) {
  const p = project(cell.x + 0.5, cell.y + 0.5, panel.pitch);
  return {
    x: panel.assembly[0] * PANEL.previewPixels + p.x,
    y: panel.assembly[1] * PANEL.previewPixels + p.y,
  };
}
export function overviewModel(panels) {
  const levels = [...new Set(panels.map(depth))].sort((a, b) => a - b);
  const ports = new Map(
    panels.flatMap((panel) =>
      panel.connectors.map((port) => [port.id, { panel, port }]),
    ),
  );
  const markers = new Map(
    panels.flatMap((panel) =>
      (panel.transitions ?? []).map((marker) => [marker.id, { panel, marker }]),
    ),
  );
  const passages = [],
    transitions = [],
    seen = new Set();
  for (const panel of panels) {
    for (const port of panel.connectors) {
      if (seen.has(port.id)) continue;
      seen.add(port.id);
      const target = ports.get(port.target),
        from = worldPoint(panel, port);
      let status = "unlinked";
      if (target) {
        const to = worldPoint(target.panel, target.port),
          dx = target.panel.assembly[0] - panel.assembly[0],
          dy = target.panel.assembly[1] - panel.assembly[1];
        const edge =
          dx !== 0
            ? Math.max(panel.assembly[0], target.panel.assembly[0]) * 800
            : Math.max(panel.assembly[1], target.panel.assembly[1]) * 800;
        const aligned =
          depth(panel) === depth(target.panel) &&
          Math.abs(dx) + Math.abs(dy) === 1 &&
          Math.abs(from.x - to.x) < 0.01 &&
          Math.abs(from.y - to.y) < 0.01 &&
          Math.abs((dx !== 0 ? from.x : from.y) - edge) < 0.01;
        status =
          target.port.target === port.id
            ? aligned
              ? "aligned"
              : "offset"
            : "invalid";
        if (target.port.target === port.id) seen.add(target.port.id);
      } else if (port.target) status = "invalid";
      passages.push({
        panel,
        port,
        from,
        target,
        to: target ? worldPoint(target.panel, target.port) : null,
        status,
      });
    }
    for (const marker of panel.transitions ?? []) {
      const target =
        typeof marker.destination === "object" && marker.destination
          ? markers.get(marker.destination.marker)
          : null;
      transitions.push({
        panel,
        marker,
        from: worldPoint(panel, marker),
        target,
        to: target ? worldPoint(target.panel, target.marker) : null,
        status: target
          ? "linked"
          : marker.destination === "engine"
            ? "engine"
            : marker.destination
              ? "invalid"
              : ["landing", "steps"].includes(marker.kind)
                ? "local"
                : "unassigned",
      });
    }
  }
  const xs = panels.map((p) => p.assembly[0] * 800),
    ys = panels.map((p) => p.assembly[1] * 800);
  const bounds = panels.length
    ? {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs) + 800,
        height: Math.max(...ys) - Math.min(...ys) + 800,
      }
    : { x: 0, y: 0, width: 800, height: 800 };
  return { levels, passages, transitions, bounds };
}
export function stackPoint(point, level, model) {
  return {
    x: point.x,
    y:
      model.bounds.y +
      (point.y - model.bounds.y) * 0.55 +
      model.levels.indexOf(level) * (model.bounds.height * 0.55 + 240),
  };
}
const node = (tag, attrs = {}, text = "") => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};
const names = {
  "stairs-up": "Stairs up",
  "stairs-down": "Stairs down",
  pit: "Pit drop",
  landing: "Arrival",
  steps: "Local steps",
  transporter: "Excelsior Transporter",
  teleporter: "Random teleporter",
  elevator: "Elevator up",
};
export class PanelOverview {
  constructor({ select, edit }) {
    this.select = select;
    this.edit = edit;
    this.mode = "level";
    this.svg = $("panel-overview-map");
    this.zoom = 1;
    $("overview-level").onchange = () => {
      this.level = Number($("overview-level").value);
      const p = this.panels.find((p) => depth(p) === this.level);
      if (p) this.select(p.id);
      this.render(true);
    };
    for (const id of ["overview-links", "overview-seams"])
      $(id).onchange = () => this.render();
    $("overview-fit").onclick = () => this.render(true);
    $("overview-zoom-in").onclick = () => this.scale(1.4);
    $("overview-zoom-out").onclick = () => this.scale(1 / 1.4);
    $("overview-edit").onclick = () => this.edit();
    this.svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.scale(e.deltaY < 0 ? 1.15 : 1 / 1.15, this.position(e));
      },
      { passive: false },
    );
    this.svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        start: this.position(e),
        moved: false,
        id: e.target.closest("[data-panel]")?.getAttribute("data-panel"),
      };
      this.svg.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const d = this.drag;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
      if (!d.moved) return;
      const q = this.position(e);
      this.view.x += d.start.x - q.x;
      this.view.y += d.start.y - q.y;
      this.applyView();
    });
    this.svg.addEventListener("pointerup", (e) => {
      const d = this.drag;
      this.drag = null;
      if (this.svg.hasPointerCapture(e.pointerId))
        this.svg.releasePointerCapture(e.pointerId);
      if (d && !d.moved && d.id) this.select(d.id);
    });
    this.svg.addEventListener("pointercancel", () => {
      this.drag = null;
    });
    this.svg.addEventListener("keydown", (e) => {
      const step = this.view.width * 0.12;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        this.view.x +=
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        this.view.y +=
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        this.applyView();
      } else if (e.key === "+" || e.key === "=") this.scale(1.4);
      else if (e.key === "-") this.scale(1 / 1.4);
      else if (e.key === "0") this.render(true);
    });
  }
  position(e) {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  }
  applyView() {
    const v = this.view;
    this.svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.width} ${v.height}`);
    $("overview-zoom").textContent = `${Math.round(this.zoom * 100)}%`;
  }
  scale(f, anchor) {
    if (!this.view) return;
    const z = Math.min(64, Math.max(0.5, this.zoom * f));
    f = z / this.zoom;
    this.zoom = z;
    const v = this.view,
      a = anchor ?? { x: v.x + v.width / 2, y: v.y + v.height / 2 };
    v.x = a.x - (a.x - v.x) / f;
    v.y = a.y - (a.y - v.y) / f;
    v.width /= f;
    v.height /= f;
    this.applyView();
  }
  sync(panels, selected, mode) {
    const changed = this.selected !== selected;
    const modeChanged = this.mode !== mode;
    this.panels = panels;
    this.selected = selected;
    this.mode = mode;
    this.model = overviewModel(panels);
    const p = panels.find((p) => p.id === selected);
    if (changed || !this.model.levels.includes(this.level))
      this.level = p ? depth(p) : (this.model.levels[0] ?? 1);
    const layout = JSON.stringify(
      panels.map((p) => [p.id, p.level, ...p.assembly]),
    );
    const layoutChanged = layout !== this.layout;
    this.layout = layout;
    this.render(
      modeChanged ||
        layoutChanged ||
        !this.view ||
        this.lastLevel !== this.level,
    );
  }
  render(fit = false) {
    if (!this.model) return;
    const { panels, model } = this,
      stack = this.mode === "stack",
      shown = stack ? panels : panels.filter((p) => depth(p) === this.level);
    this.lastLevel = this.level;
    $("overview-level").replaceChildren(
      ...model.levels.map((l) => {
        const o = document.createElement("option");
        o.value = l;
        o.textContent = l === 0 ? "Surface · level 0" : `Dungeon level ${l}`;
        return o;
      }),
    );
    $("overview-level").value = this.level;
    $("overview-level-label").hidden = stack;
    $("overview-empty").hidden = !!panels.length;
    this.svg.toggleAttribute("hidden", !panels.length);
    $("overview-instructions").textContent = stack
      ? "Levels are stacked schematically; matching X/Y slots line up. Only authored levels are shown. Arrows show fixed destinations."
      : "Panels meet at their assembly coordinates. Solid passage markers meet at a seam; dashed links need placement review.";
    const selected = panels.find((p) => p.id === this.selected);
    $("overview-selection").textContent = selected
      ? `${selected.name} · level ${depth(selected)} · position (${selected.assembly.join(", ")})`
      : "No panel selected";
    $("overview-edit").disabled = !selected;
    this.svg.replaceChildren(
      node(
        "title",
        {},
        stack ? "Dungeon level stack" : "Assembled dungeon level",
      ),
    );
    const bounds = stack ? model.bounds : overviewModel(shown).bounds,
      b = bounds;
    const mapPoint = (p, level) => (stack ? stackPoint(p, level, model) : p);
    if (fit) {
      this.zoom = 1;
      this.view = {
        x: b.x - 110,
        y: b.y - 150,
        width: b.width + 220,
        height:
          (stack
            ? model.levels.length * (b.height * 0.55 + 240) - 240
            : b.height) + 290,
      };
    }
    this.applyView();
    const defs = node("defs");
    const marker = node("marker", {
      id: "overview-arrow",
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto-start-reverse",
      markerUnits: "strokeWidth",
    });
    marker.append(node("path", { d: "M0 0L10 5L0 10Z", fill: "#fff" }));
    defs.append(marker);
    this.svg.append(defs);
    if (stack) {
      for (const level of model.levels) {
        const p = mapPoint({ x: b.x, y: b.y }, level);
        this.svg.append(
          node("rect", {
            x: p.x - 18,
            y: p.y - 18,
            width: b.width + 36,
            height: b.height * 0.55 + 36,
            fill: "#232323",
            stroke: "#666",
            "stroke-width": 1,
            "vector-effect": "non-scaling-stroke",
          }),
          node(
            "text",
            { x: p.x, y: p.y - 48, fill: "#eee", "font-size": 44 },
            level === 0 ? "SURFACE · LEVEL 0" : `DUNGEON LEVEL ${level}`,
          ),
        );
      }
    }
    for (const panel of shown) {
      const at = mapPoint(
        { x: panel.assembly[0] * 800, y: panel.assembly[1] * 800 },
        depth(panel),
      );
      const g = node("g", {
        "data-panel": panel.id,
        role: "button",
        tabindex: 0,
        "aria-label": `Select ${panel.name}, level ${depth(panel)}, position ${panel.assembly.join(", ")}`,
      });
      g.append(
        node("image", {
          x: at.x,
          y: at.y,
          width: 800,
          height: stack ? 440 : 800,
          href: panel.art,
          preserveAspectRatio: stack ? "none" : "xMidYMid meet",
        }),
      );
      if ($("overview-seams").checked || panel.id === this.selected)
        g.append(
          node("rect", {
            x: at.x + 2,
            y: at.y + 2,
            width: 796,
            height: stack ? 436 : 796,
            fill: "none",
            stroke: panel.id === this.selected ? "#fff" : "#888",
            "stroke-width": panel.id === this.selected ? 2 : 1,
            "stroke-dasharray": panel.id === this.selected ? "" : "5 5",
            "vector-effect": "non-scaling-stroke",
          }),
        );
      g.append(
        node("rect", {
          x: at.x + 8,
          y: at.y + 8,
          width: 770,
          height: 44,
          fill: "#111",
          opacity: 0.85,
        }),
        node(
          "text",
          { x: at.x + 22, y: at.y + 39, fill: "#eee", "font-size": 30 },
          `${panel.name} · ${panel.assembly.join(",")}`,
        ),
      );
      g.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this.select(panel.id);
        }
      };
      this.svg.append(g);
    }
    if ($("overview-links").checked) {
      const line = (a, b, dashed, arrow = false, both = false) => {
        this.svg.append(
          node("line", {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: "#111",
            "stroke-width": 5,
            "vector-effect": "non-scaling-stroke",
            "pointer-events": "none",
          }),
          node("line", {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            stroke: "#fff",
            "stroke-width": 1.7,
            "stroke-dasharray": dashed ? "6 5" : "",
            "marker-end": arrow ? "url(#overview-arrow)" : "",
            "marker-start": both ? "url(#overview-arrow)" : "",
            "vector-effect": "non-scaling-stroke",
            "pointer-events": "none",
          }),
        );
      };
      const dot = (a, label, filled = true) => {
        const g = node("g", { "pointer-events": "none" });
        g.append(
          node("circle", {
            cx: a.x,
            cy: a.y,
            r: 16,
            fill: filled ? "#fff" : "#111",
            stroke: filled ? "#111" : "#fff",
            "stroke-width": 2,
            "vector-effect": "non-scaling-stroke",
          }),
          node("title", {}, label),
        );
        this.svg.append(g);
      };
      for (const link of model.passages) {
        if (!stack && depth(link.panel) !== this.level) continue;
        const a = mapPoint(link.from, depth(link.panel));
        if (link.to) {
          const end = mapPoint(link.to, depth(link.target.panel));
          line(a, end, link.status !== "aligned");
          dot(end, link.target.panel.name);
        }
        dot(a, `Passage: ${link.status}`, link.status === "aligned");
      }
      const drawnTransitions = new Set();
      for (const link of model.transitions) {
        if (!stack && depth(link.panel) !== this.level) continue;
        const a = mapPoint(link.from, depth(link.panel));
        if (stack && link.to && !drawnTransitions.has(link.marker.id)) {
          const back =
            link.target.marker.destination?.marker === link.marker.id;
          line(
            a,
            mapPoint(link.to, depth(link.target.panel)),
            true,
            true,
            back,
          );
          drawnTransitions.add(link.marker.id);
          if (back) drawnTransitions.add(link.target.marker.id);
        }
        dot(a, `${names[link.marker.kind]}: ${link.status}`, false);
        const symbol =
          link.marker.kind === "stairs-up"
            ? "↑"
            : link.marker.kind === "stairs-down"
              ? "↓"
              : link.marker.kind === "pit"
                ? "⇣"
                : link.marker.kind === "steps"
                  ? "≋"
                  : "◇";
        this.svg.append(
          node(
            "text",
            {
              x: a.x + 22,
              y: a.y + 12,
              fill: "#fff",
              stroke: "#111",
              "stroke-width": 3,
              "paint-order": "stroke",
              "font-size": 35,
              "pointer-events": "none",
            },
            symbol,
          ),
        );
      }
    }
    this.summary(shown);
  }
  summary(shown) {
    const stack = this.mode === "stack",
      inView = (p) => stack || depth(p) === this.level;
    $("overview-summary").textContent =
      `${shown.length} panels · ${this.model.levels.length} authored levels · ${this.model.passages.filter((p) => inView(p.panel) && p.target).length} linked passages`;
    $("overview-panel-list").replaceChildren(
      ...shown.map((p) => {
        const b = document.createElement("button");
        b.className = "secondary";
        b.textContent = `${p.name} · L${depth(p)}`;
        b.setAttribute("aria-pressed", String(p.id === this.selected));
        b.onclick = () => this.select(p.id);
        return b;
      }),
    );
    const lines = [];
    for (const p of this.model.passages.filter((p) => inView(p.panel))) {
      lines.push(
        `${p.panel.name} → ${p.target?.panel.name ?? "Unlinked passage"} · ${p.status === "aligned" ? "seam aligned" : p.status === "offset" ? "linked, positions do not meet" : p.status}`,
      );
    }
    for (const t of this.model.transitions.filter((t) => inView(t.panel))) {
      lines.push(
        `${t.panel.name} · ${names[t.marker.kind]} → ${t.target ? `${t.target.panel.name} (level ${depth(t.target.panel)})` : t.status === "engine" ? "game rules determine destination" : t.status === "local" ? "this level" : "unassigned destination"}`,
      );
    }
    $("overview-route-list").replaceChildren(
      ...lines.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
    if (!lines.length) {
      const li = document.createElement("li");
      li.textContent = "No passages or level markers authored yet.";
      $("overview-route-list").append(li);
    }
  }
}
