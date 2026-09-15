import { PanelPlaytest } from "./panel-playtest.js";
import { PanelOverview } from "./panel-overview.js";
import {
  project,
  unproject,
  PANEL,
  DRAFT_PROJECTION,
  cellPolygon,
  cellCropGeometry,
} from "./grid.js";
const $ = (id) => document.getElementById(id);
const SIZE = PANEL.previewPixels,
  MAX_PANELS = 16;
const num = (id, min, max) =>
  Math.max(min, Math.min(max, Number($(id).value) || 0));
export const LEVEL_MARKERS = Object.freeze({
  "stairs-up": {
    label: "Stairs up",
    symbol: "↑",
    hint: "Climb to the level above.",
    route: -1,
  },
  "stairs-down": {
    label: "Stairs down",
    symbol: "↓",
    hint: "Descend to the level below.",
    route: 1,
  },
  pit: {
    label: "Pit drop",
    symbol: "⇣",
    hint: "One-way drop; avoidance and damage remain game rules.",
    route: 1,
  },
  landing: {
    label: "Arrival / landing",
    symbol: "◎",
    hint: "Destination point; no outgoing travel.",
  },
  steps: {
    label: "Steps within this level",
    symbol: "≋",
    hint: "Local elevation only; does not change dungeon level.",
  },
  transporter: {
    label: "Excelsior Transporter",
    symbol: "EX",
    hint: "Player chooses a level; cost and restrictions remain game rules.",
    engine: true,
  },
  teleporter: {
    label: "Random teleporter",
    symbol: "TP",
    hint: "Arrival triggers the game's random teleport rules.",
    engine: true,
  },
  elevator: {
    label: "Elevator up",
    symbol: "⇡",
    hint: "Automatic upward travel; Orb and Time Stop restrictions remain game rules.",
    route: -1,
  },
});
export const CELL_KINDS = Object.freeze({
  open: "○",
  blocked: "×",
  wall: "▥",
  object: "O",
  item: "◆",
});
const depth = (p) => p.level ?? 1;
export function canLinkLevelMarker(sourcePanel, source, targetPanel, target) {
  const route = LEVEL_MARKERS[source.kind]?.route;
  return Boolean(
    route &&
      source.id !== target.id &&
      ["landing", "stairs-up", "stairs-down"].includes(target.kind) &&
      depth(targetPanel) === depth(sourcePanel) + route,
  );
}
export function upgradeDraft(d) {
  validateDraft(d);
  const copy = structuredClone(d);
  if (copy.version === 2) {
    copy.version = 3;
    for (const p of copy.panels) {
      p.level = 1;
      p.transitions = [];
    }
  }
  return copy;
}
export function validateDraft(d) {
  if (d?.version === 1)
    throw Error(
      "Version 1 uses a different grid. Keep that draft; reauthor its artwork and annotations against the new 8-inch template before importing.",
    );
  if (d?.projection?.standard === "HE8-2to1-1in-v1")
    throw Error(
      "This draft uses 1-inch diamonds. Keep that draft; reauthor its artwork and annotations against the new ½ × ¼ inch template before importing.",
    );
  if (
    d?.format !== "heavy-earth-panel-draft" ||
    ![2, 3].includes(d.version) ||
    d.projection?.standard !== PANEL.standard ||
    d.projection?.ratio !== "2:1" ||
    d.projection?.tileWidthInches !== PANEL.tileWidthInches ||
    d.projection?.previewPixels !== SIZE ||
    !Array.isArray(d.panels) ||
    !d.panels.length ||
    d.panels.length > MAX_PANELS
  )
    throw Error(
      "Unsupported panel draft. Expected version 2 or 3, the fixed HE8 grid, and 1–16 panels.",
    );
  const ids = new Set(),
    connectors = new Set(),
    positions = new Set();
  for (const p of d.panels) {
    if (
      typeof p.id !== "string" ||
      p.id.length > 100 ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      p.name.length > 64
    )
      throw Error("Invalid or duplicate panel identity.");
    ids.add(p.id);
    if (
      p.inches !== PANEL.inches ||
      p.pitch !== PANEL.pitchPixels ||
      p.top !== PANEL.top ||
      !Array.isArray(p.origin) ||
      p.origin.length !== 2 ||
      p.origin.some((v, i) => v !== PANEL.origin[i]) ||
      !Array.isArray(p.assembly) ||
      p.assembly.length !== 2 ||
      p.assembly.some((v) => !Number.isInteger(v) || Math.abs(v) > 100) ||
      !Number.isInteger(p.threshold) ||
      p.threshold < 0 ||
      p.threshold > 255
    )
      throw Error(
        `Invalid panel calibration. Use an ${PANEL.inches}-inch board, ${PANEL.pitchPixels}-pixel grid, origin 0/0, and TOP up.`,
      );
    if (
      d.version === 2 &&
      (p.level !== undefined || p.transitions !== undefined)
    )
      throw Error("Level annotations require draft version 3.");
    if (
      d.version === 3 &&
      (!Number.isInteger(p.level) ||
        p.level < 0 ||
        p.level > 1000 ||
        !Array.isArray(p.transitions) ||
        p.transitions.length > 100)
    )
      throw Error(
        "Invalid dungeon level or level markers. Use levels 0–1000 and at most 100 markers per panel.",
      );
    const position = `${depth(p)}:${p.assembly.join(",")}`;
    if (positions.has(position))
      throw Error(
        "Two panels occupy the same assembly slot on the same level.",
      );
    positions.add(position);
    if (
      typeof p.art !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(p.art) ||
      p.art.length > 12_000_000
    )
      throw Error("Invalid or oversized embedded art.");
    if (
      !Array.isArray(p.cells) ||
      p.cells.length > 20000 ||
      !Array.isArray(p.connectors) ||
      p.connectors.length > 100
    )
      throw Error("Too many annotations.");
    const seenCells = new Set();
    for (const c of p.cells) {
      const key = `${c.x},${c.y}`;
      if (
        !Number.isInteger(c.x) ||
        !Number.isInteger(c.y) ||
        Math.abs(c.x) > 100 ||
        Math.abs(c.y) > 100 ||
        !(d.version === 2
          ? ["open", "blocked"].includes(c.kind)
          : Object.hasOwn(CELL_KINDS, c.kind)) ||
        seenCells.has(key)
      )
        throw Error("Invalid or duplicate cell annotation.");
      seenCells.add(key);
    }
    for (const c of p.connectors) {
      if (
        typeof c.id !== "string" ||
        c.id.length > 100 ||
        connectors.has(c.id) ||
        !Number.isInteger(c.x) ||
        !Number.isInteger(c.y) ||
        Math.abs(c.x) > 100 ||
        Math.abs(c.y) > 100 ||
        !["north", "east", "south", "west"].includes(c.direction) ||
        !(c.target === null || typeof c.target === "string")
      )
        throw Error("Invalid connector.");
      connectors.add(c.id);
    }
  }
  const all = d.panels.flatMap((p) =>
    p.connectors.map((c) => ({ ...c, panel: p.id })),
  );
  for (const c of all) {
    if (c.target) {
      const other = all.find((v) => v.id === c.target);
      if (
        !other ||
        other.panel === c.panel ||
        other.target !== c.id ||
        depth(d.panels.find((p) => p.id === other.panel)) !==
          depth(d.panels.find((p) => p.id === c.panel))
      )
        throw Error(
          "Connections must be reciprocal and join different panels on the same level.",
        );
    }
  }
  const markers = new Map();
  for (const p of d.panels)
    for (const t of p.transitions ?? []) {
      const spec = Object.hasOwn(LEVEL_MARKERS, t?.kind)
        ? LEVEL_MARKERS[t.kind]
        : null;
      if (
        !spec ||
        typeof t.id !== "string" ||
        !t.id ||
        t.id.length > 100 ||
        markers.has(t.id) ||
        !Number.isInteger(t.x) ||
        !Number.isInteger(t.y) ||
        Math.abs(t.x) > 100 ||
        Math.abs(t.y) > 100 ||
        !(
          t.destination === null ||
          t.destination === "engine" ||
          (typeof t.destination === "object" &&
            t.destination?.marker &&
            typeof t.destination.marker === "string")
        )
      )
        throw Error("Invalid or duplicate level marker.");
      if (!spec.route && !spec.engine && t.destination !== null)
        throw Error(
          "Landings and local steps cannot have an outgoing destination.",
        );
      if (spec.engine && t.destination !== null && t.destination !== "engine")
        throw Error(
          "Magical transport uses game destination rules, not a fixed link.",
        );
      markers.set(t.id, { p, t });
    }
  for (const { p, t } of markers.values())
    if (t.destination && typeof t.destination === "object") {
      const other = markers.get(t.destination.marker);
      if (!other || !canLinkLevelMarker(p, t, other.p, other.t))
        throw Error(
          "Level destination must be a landing or stair on the adjacent level in the travel direction.",
        );
    }
  return d;
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error("Cannot decode panel image."));
    image.src = src;
  });
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("Cannot read file."));
    reader.readAsDataURL(file);
  });
}
export class PanelWorkshop {
  constructor(notify) {
    this.notify = notify;
    this.panels = [];
    this.images = new Map();
    this.selected = null;
    this.viewMode = "panel";
    this.overview = new PanelOverview({
      select: (id) => {
        this.selected = id;
        $("cell-crop-results").hidden = true;
        this.controls();
        this.draw();
      },
      edit: () => this.setView("panel"),
    });
    this.playtest = new PanelPlaytest(this);
    this.overview.cellClick = (id, point) => this.playtest.click(id, point);
    this.overview.handleKey = (e) => this.playtest.key(e);
    this.overview.afterRender = () => this.playtest.draw();
    this.overview.afterView = () => this.playtest.draw();
    for (const mode of ["panel", "level", "stack", "test"])
      $("workshop-view-" + mode).onclick = () => this.setView(mode);
    $("overview-add").onclick = () => this.setView("panel");
    $("overview-export").onclick = () => this.export();
    this.previewMask = false;
    this.showGrid = true;
    this.showCells = true;
    this.canvas = $("panel-canvas");
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    $("panel-upload").onchange = (e) => this.upload(e.target.files[0]);
    $("panel-select").onchange = () => {
      this.selected = $("panel-select").value;
      $("cell-crop-results").hidden = true;
      this.controls();
      this.draw();
    };
    for (const id of [
      "panel-name",
      "panel-level",
      "panel-grid-x",
      "panel-grid-y",
      "panel-threshold",
    ])
      $(id).addEventListener("input", () => this.update());
    $("show-panel-grid").onchange = () => {
      this.showGrid = $("show-panel-grid").checked;
      this.draw();
    };
    $("show-panel-cells").onchange = () => {
      this.showCells = $("show-panel-cells").checked;
      this.draw();
    };
    $("panel-mask").onchange = () => {
      this.previewMask = $("panel-mask").checked;
      this.draw();
    };
    for (const [kind, spec] of Object.entries(LEVEL_MARKERS)) {
      const o = document.createElement("option");
      o.value = kind;
      o.textContent = spec.label;
      $("level-marker-kind").append(o);
    }
    this.canvas.addEventListener("click", (e) => this.click(e));
    document.querySelectorAll(".file-button").forEach((label) =>
      label.addEventListener("keydown", (e) => {
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          label.querySelector("input").click();
        }
      }),
    );
    $("export-panels").onclick = () => this.export();
    $("export-cell-crops").onclick = () => this.exportCellCrops();
    $("import-panels").onchange = (e) => this.import(e.target.files[0]);
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }
  setView(mode) {
    this.viewMode = mode;
    $("panel-detail-layout").hidden = mode !== "panel";
    $("panel-overview").hidden = mode === "panel";
    $("playtest-controls").hidden = mode !== "test";
    $("overview-panel-list").hidden = mode === "test";
    $("overview-click-help").hidden = mode === "test";
    this.overview.testing = mode === "test";
    for (const name of ["panel", "level", "stack", "test"]) {
      const b = $("workshop-view-" + name);
      b.classList.toggle("active", name === mode);
      b.setAttribute("aria-pressed", String(name === mode));
    }
    if (mode === "test") this.playtest.begin();
    else this.draw();
  }
  nextSlot() {
    let column = 0;
    while (
      this.panels.some(
        (p) =>
          depth(p) === 1 && p.assembly[0] === column && p.assembly[1] === 0,
      )
    )
      column++;
    return [column, 0];
  }
  get panel() {
    return this.panels.find((p) => p.id === this.selected);
  }
  async upload(file) {
    if (!file) return;
    try {
      if (this.panels.length >= MAX_PANELS)
        throw Error("A draft supports up to 16 panels.");
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 8_000_000
      )
        throw Error("Choose a PNG, JPEG, or WebP smaller than 8 MB.");
      const source = await readFile(file),
        image = await loadImage(source);
      if (Math.abs(image.width / image.height - 1) > 0.04)
        throw Error("Crop the scan to a square panel before importing.");
      // Keep an aligned, grayscale preview in the draft; retain your original scan separately.
      const preview = document.createElement("canvas");
      preview.width = SIZE;
      preview.height = SIZE;
      const c = preview.getContext("2d");
      c.fillStyle = "#fff";
      c.fillRect(0, 0, SIZE, SIZE);
      c.filter = "grayscale(1)";
      c.drawImage(image, 0, 0, SIZE, SIZE);
      const art = preview.toDataURL("image/png"),
        id = crypto.randomUUID();
      const p = {
        id,
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 64),
        inches: PANEL.inches,
        pitch: PANEL.pitchPixels,
        origin: [...PANEL.origin],
        top: PANEL.top,
        assembly: this.nextSlot(),
        level: 1,
        transitions: [],
        threshold: 150,
        art,
        cells: [],
        connectors: [],
      };
      this.images.set(id, await loadImage(art));
      this.panels.push(p);
      this.selected = id;
      this.dirty = true;
      this.controls();
      this.draw();
      this.notify(
        "Panel added. TOP stays up. Check that your edge-cropped scan follows the fixed grid overlay.",
      );
    } catch (e) {
      this.notify(e.message);
    } finally {
      $("panel-upload").value = "";
    }
  }
  controls() {
    const p = this.panel;
    $("panel-select").replaceChildren(
      ...this.panels.map((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        return o;
      }),
    );
    $("panel-select").value = this.selected || "";
    if (!p) return;
    for (const [id, value] of Object.entries({
      "panel-name": p.name,
      "panel-level": p.level,
      "panel-grid-x": p.assembly[0],
      "panel-grid-y": p.assembly[1],
      "panel-threshold": p.threshold,
    }))
      $(id).value = value;
    $("threshold-value").textContent = p.threshold;
    this.connections();
    this.levelConnections();
  }
  update() {
    const p = this.panel;
    if (!p) return;
    const before = structuredClone(p);
    Object.assign(p, {
      name: $("panel-name").value.slice(0, 64) || "Untitled panel",
      level: Math.round(num("panel-level", 0, 1000)),
      assembly: [
        Math.round(num("panel-grid-x", -100, 100)),
        Math.round(num("panel-grid-y", -100, 100)),
      ],
      threshold: Math.round(num("panel-threshold", 0, 255)),
    });
    try {
      validateDraft({
        format: "heavy-earth-panel-draft",
        version: 3,
        projection: DRAFT_PROJECTION,
        panels: this.panels,
      });
    } catch (e) {
      Object.assign(p, before);
      this.controls();
      this.notify(e.message);
      return;
    }
    this.connections();
    this.levelConnections();
    $("threshold-value").textContent = p.threshold;
    $("panel-select").selectedOptions[0].textContent = p.name;
    this.dirty = true;
    this.draw();
  }
  point(x, y) {
    const p = project(x, y, this.panel.pitch);
    return { x: p.x + this.panel.origin[0], y: p.y + this.panel.origin[1] };
  }
  draw() {
    if (this.viewMode !== "panel")
      this.overview.sync(
        this.panels,
        this.selected,
        this.viewMode === "test" ? "level" : this.viewMode,
      );
    const p = this.panel,
      c = this.canvas.getContext("2d");
    c.clearRect(0, 0, SIZE, SIZE);
    $("panel-empty").hidden = !!p;
    if (!p) return;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, SIZE, SIZE);
    c.filter = "grayscale(1)";
    c.drawImage(this.images.get(p.id), 0, 0, SIZE, SIZE);
    c.filter = "none";
    if (this.previewMask) {
      const pixels = c.getImageData(0, 0, SIZE, SIZE);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const v = pixels.data[i] >= p.threshold ? 255 : 0;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      }
      c.putImageData(pixels, 0, 0);
    }
    const line = (a, b) => {
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    };
    c.strokeStyle = "#777";
    c.globalAlpha = 0.5;
    c.lineWidth = 0.8;
    for (let i = -80; this.showGrid && i <= 80; i++) {
      line(this.point(-80, i), this.point(80, i));
      line(this.point(i, -80), this.point(i, 80));
    }
    c.globalAlpha = 1;
    for (const cell of this.showCells ? p.cells : []) {
      const points = cellPolygon(cell.x, cell.y, p.pitch);
      c.beginPath();
      points.forEach((a, i) => (i ? c.lineTo(a.x, a.y) : c.moveTo(a.x, a.y)));
      c.closePath();
      c.fillStyle = ["open", "object", "item"].includes(cell.kind)
        ? "#ffffff60"
        : "#000000a0";
      c.fill();
      c.strokeStyle = ["open", "object", "item"].includes(cell.kind)
        ? "#222"
        : "#ddd";
      c.lineWidth = 2;
      c.stroke();
      const center = this.point(cell.x + 0.5, cell.y + 0.5);
      c.fillStyle = ["open", "object", "item"].includes(cell.kind)
        ? "#111"
        : "#fff";
      c.font = "12px monospace";
      c.textAlign = "center";
      c.fillText(CELL_KINDS[cell.kind], center.x, center.y + 4);
    }
    p.connectors.forEach((v, i) => {
      const q = this.point(v.x + 0.5, v.y + 0.5);
      c.beginPath();
      c.arc(q.x, q.y, 12, 0, Math.PI * 2);
      c.fillStyle = "#111";
      c.fill();
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = "#fff";
      c.font = "bold 11px monospace";
      c.textAlign = "center";
      c.fillText(String(i + 1), q.x, q.y + 4);
    });
    const markerGroups = new Map();
    p.transitions.forEach((t, i) => {
      const key = `${t.x},${t.y}`;
      if (!markerGroups.has(key)) markerGroups.set(key, []);
      markerGroups.get(key).push({ ...t, number: i + 1 });
    });
    markerGroups.forEach((markers) => {
      const t = markers[0],
        q = this.point(t.x + 0.5, t.y + 0.5);
      const symbols =
        markers.length === 2 &&
        markers.some((t) => t.kind === "stairs-up") &&
        markers.some((t) => t.kind === "stairs-down")
          ? "↕"
          : markers.map((t) => LEVEL_MARKERS[t.kind].symbol).join("·");
      const label = markers.map((t) => `L${t.number}`).join("/");
      c.fillStyle = "#fff";
      c.strokeStyle = "#111";
      c.lineWidth = 2;
      c.fillRect(q.x - 15, q.y - 12, 30, 24);
      c.strokeRect(q.x - 15, q.y - 12, 30, 24);
      c.fillStyle = "#111";
      c.textAlign = "center";
      c.font = "bold 13px sans-serif";
      c.fillText(symbols, q.x, q.y + 4);
      c.font = "bold 10px monospace";
      c.fillStyle = "#fff";
      c.strokeStyle = "#111";
      c.lineWidth = 3;
      c.strokeText(label, q.x, q.y + 24);
      c.fillText(label, q.x, q.y + 24);
    });
    c.strokeStyle = "#111";
    c.lineWidth = 3;
    line(
      { x: p.origin[0] - 10, y: p.origin[1] },
      { x: p.origin[0] + 10, y: p.origin[1] },
    );
    line(
      { x: p.origin[0], y: p.origin[1] - 10 },
      { x: p.origin[0], y: p.origin[1] + 10 },
    );
    $("panel-feedback").textContent =
      `${p.cells.length} marked cells · ${p.connectors.length} passages · ${p.transitions.length} level markers · level ${p.level} · HE8 grid · TOP ↑`;
  }
  click(e) {
    const p = this.panel;
    if (!p) return;
    const r = this.canvas.getBoundingClientRect();
    // object-fit:contain letterboxes the square canvas in wide containers.
    const side = Math.min(r.width, r.height),
      left = r.left + (r.width - side) / 2,
      top = r.top + (r.height - side) / 2;
    const px = ((e.clientX - left) / side) * SIZE,
      py = ((e.clientY - top) / side) * SIZE;
    if (px < 0 || py < 0 || px > SIZE || py > SIZE) return;
    const q = unproject(px - p.origin[0], py - p.origin[1], p.pitch),
      x = Math.floor(q.x),
      y = Math.floor(q.y),
      tool = $("panel-tool").value;
    if (Math.abs(x) > 100 || Math.abs(y) > 100) return;
    if (tool === "inspect") {
      const scratch = document.createElement("canvas");
      scratch.width = SIZE;
      scratch.height = SIZE;
      const c = scratch.getContext("2d");
      c.drawImage(this.images.get(p.id), 0, 0, SIZE, SIZE);
      const pixel = c.getImageData(
        Math.min(799, Math.floor(px)),
        Math.min(799, Math.floor(py)),
        1,
        1,
      ).data[0];
      this.notify(
        `Cell ${x}, ${y} · sampled value ${pixel}/255 · ${pixel >= p.threshold ? "white / potentially open" : "black / potentially blocked"}. Review before marking.`,
      );
      return;
    }
    if (tool === "level-marker") {
      const kind = $("level-marker-kind").value;
      if (
        p.transitions.some((t) => t.x === x && t.y === y && t.kind === kind)
      ) {
        this.notify("This cell already has this kind of level marker.");
        return;
      }
      if (p.transitions.length >= 100) {
        this.notify("Maximum 100 level markers per panel.");
        return;
      }
      const spec = LEVEL_MARKERS[kind];
      p.transitions.push({
        id: crypto.randomUUID(),
        x,
        y,
        kind,
        destination: spec.route || spec.engine ? "engine" : null,
      });
      this.levelConnections();
    } else if (tool === "connector") {
      if (p.connectors.some((v) => v.x === x && v.y === y)) {
        this.notify("This cell already has a connector.");
        return;
      }
      if (p.connectors.length >= 100) {
        this.notify("Maximum 100 connectors per panel.");
        return;
      }
      p.connectors.push({
        id: crypto.randomUUID(),
        x,
        y,
        direction: "north",
        target: null,
      });
      this.connections();
    } else {
      p.cells = p.cells.filter((v) => v.x !== x || v.y !== y);
      if (tool !== "erase") p.cells.push({ x, y, kind: tool });
    }
    this.dirty = true;
    this.draw();
  }
  connections() {
    const p = this.panel;
    if (!p) return;
    const all = this.panels.flatMap((panel) =>
      panel.connectors.map((c, i) => ({
        ...c,
        panel: panel.id,
        level: panel.level,
        label: `${panel.name} / passage ${i + 1}`,
      })),
    );
    $("panel-connections").replaceChildren(
      ...p.connectors.map((v, i) => {
        const row = document.createElement("div");
        row.className = "connector";
        const label = document.createElement("span");
        label.textContent = `${i + 1} · (${v.x}, ${v.y})`;
        const direction = document.createElement("select");
        direction.setAttribute("aria-label", `Passage ${i + 1} direction`);
        for (const d of ["north", "east", "south", "west"]) {
          const o = document.createElement("option");
          o.value = d;
          o.textContent = d;
          direction.append(o);
        }
        direction.value = v.direction;
        direction.onchange = () => {
          v.direction = direction.value;
          this.dirty = true;
        };
        const targets = document.createElement("select");
        targets.setAttribute("aria-label", `Passage ${i + 1} destination`);
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Unlinked passage";
        targets.append(empty);
        for (const other of all.filter(
          (c) =>
            c.panel !== p.id &&
            c.level === p.level &&
            (!c.target || c.target === v.id),
        )) {
          const o = document.createElement("option");
          o.value = other.id;
          o.textContent = other.label;
          targets.append(o);
        }
        targets.value = v.target || "";
        targets.onchange = () => {
          for (const panel of this.panels)
            for (const c of panel.connectors) {
              if (c.target === v.id) c.target = null;
              if (c.id === targets.value) c.target = v.id;
            }
          v.target = targets.value || null;
          this.dirty = true;
          this.connections();
          this.draw();
        };
        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.onclick = () => {
          for (const panel of this.panels)
            for (const c of panel.connectors)
              if (c.target === v.id) c.target = null;
          p.connectors = p.connectors.filter((c) => c.id !== v.id);
          this.dirty = true;
          this.connections();
          this.draw();
        };
        row.append(label, direction, targets, remove);
        return row;
      }),
    );
    if (!p.connectors.length)
      $("panel-connections").textContent =
        "Choose “Add connector” and click a passage cell in the scan.";
  }
  downloadArtifact(data, filename, label) {
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = this.downloadUrl;
    a.download = filename;
    a.textContent = label;
    $("panel-artifact-download").replaceChildren(a);
    a.click();
  }
  exportCellCrops() {
    const p = this.panel;
    if (!p?.cells.length) {
      this.notify("Mark cells before exporting their artwork.");
      return;
    }
    try {
      validateDraft({
        format: "heavy-earth-panel-draft",
        version: 3,
        projection: DRAFT_PROJECTION,
        panels: this.panels,
      });
      $("cell-crop-preview").replaceChildren();
      const tiles = p.cells.map((cell, index) => {
        const g = cellCropGeometry(cell.x, cell.y, p.pitch);
        const canvas = document.createElement("canvas");
        canvas.width = g.width;
        canvas.height = g.height;
        const c = canvas.getContext("2d");
        c.beginPath();
        g.polygon.forEach((q, i) =>
          i
            ? c.lineTo(q.x - g.left, q.y - g.top)
            : c.moveTo(q.x - g.left, q.y - g.top),
        );
        c.closePath();
        c.clip();
        c.drawImage(this.images.get(p.id), -g.left, -g.top, SIZE, SIZE);
        if (index < 24) {
          const figure = document.createElement("figure"),
            caption = document.createElement("figcaption");
          canvas.setAttribute(
            "aria-label",
            `Cell ${cell.x}, ${cell.y}: ${cell.kind}`,
          );
          caption.textContent = `${cell.x}, ${cell.y} · ${cell.kind}`;
          figure.append(canvas, caption);
          $("cell-crop-preview").append(figure);
        }
        return {
          ...cell,
          pixelOrigin: [g.left, g.top],
          width: g.width,
          height: g.height,
          polygon: g.polygon,
          art: canvas.toDataURL("image/png"),
        };
      });
      const atlas = {
        format: "heavy-earth-cell-art",
        version: 1,
        projection: DRAFT_PROJECTION,
        panelId: p.id,
        level: p.level,
        tiles,
        transitions: p.transitions,
      };
      this.downloadArtifact(
        atlas,
        "heavy-earth-cell-art.json",
        "Download cell artwork JSON",
      );
      $("cell-crop-results").hidden = false;
      this.notify(
        `${tiles.length} diamond artwork crops ready with classifications. Object/item tags do not imply walkability. Save the panel draft separately.`,
      );
    } catch (e) {
      this.notify(e.message);
    }
  }
  levelConnections() {
    const p = this.panel;
    if (!p) return;
    const all = this.panels.flatMap((panel) =>
      panel.transitions.map((t, i) => ({ panel, t, index: i + 1 })),
    );
    $("panel-level-connections").replaceChildren(
      ...p.transitions.map((t, i) => {
        const spec = LEVEL_MARKERS[t.kind],
          row = document.createElement("div");
        row.className = "level-connector";
        const heading = document.createElement("strong");
        heading.textContent = `L${i + 1} · ${spec.symbol} ${spec.label} · (${t.x}, ${t.y})`;
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = spec.hint;
        row.append(heading, hint);
        if (spec.route || spec.engine) {
          const label = document.createElement("label");
          label.textContent = "Destination";
          const select = document.createElement("select");
          select.setAttribute(
            "aria-label",
            `Level marker ${i + 1} destination`,
          );
          const add = (value, text) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = text;
            select.append(o);
          };
          add("", "Unassigned — needs review");
          add(
            "engine",
            spec.engine
              ? t.kind === "transporter"
                ? "Game rules: player chooses level"
                : "Game rules: random destination"
              : `Game rules: ${spec.route < 0 ? "up" : "down"} one level`,
          );
          for (const other of all.filter((o) =>
            canLinkLevelMarker(p, t, o.panel, o.t),
          ))
            add(
              `marker:${other.t.id}`,
              `Level ${other.panel.level} · ${other.panel.name} · L${other.index} (${other.t.x}, ${other.t.y})`,
            );
          select.value =
            t.destination === "engine"
              ? "engine"
              : t.destination
                ? `marker:${t.destination.marker}`
                : "";
          select.onchange = () => {
            t.destination =
              select.value === "engine"
                ? "engine"
                : select.value
                  ? { marker: select.value.slice(7) }
                  : null;
            this.dirty = true;
            this.draw();
          };
          label.append(select);
          row.append(label);
        }
        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove level marker ${i + 1}`);
        remove.onclick = () => {
          for (const panel of this.panels)
            for (const other of panel.transitions)
              if (other.destination?.marker === t.id) other.destination = null;
          p.transitions = p.transitions.filter((v) => v.id !== t.id);
          this.dirty = true;
          this.levelConnections();
          this.draw();
        };
        row.append(remove);
        return row;
      }),
    );
    if (!p.transitions.length)
      $("panel-level-connections").textContent =
        "Choose Add level marker, select its kind, then click its cell in the artwork.";
  }
  export() {
    if (!this.panels.length) {
      this.notify("Add a scanned panel first.");
      return;
    }
    const draft = {
      format: "heavy-earth-panel-draft",
      version: 3,
      projection: DRAFT_PROJECTION,
      panels: this.panels,
    };
    try {
      validateDraft(draft);
      this.downloadArtifact(
        draft,
        "heavy-earth-panels.json",
        "Download panel draft JSON",
      );
      this.dirty = false;
      this.notify(
        "HE8 panel draft ready to download. Grid geometry is fixed; artwork alignment and passage connectivity still require review.",
      );
    } catch (e) {
      this.notify(e.message);
    }
  }
  async import(file) {
    if (!file) return;
    try {
      if (file.size > 40_000_000)
        throw Error("Draft must be smaller than 40 MB.");
      const d = upgradeDraft(JSON.parse(await file.text())),
        images = new Map();
      for (const p of d.panels) {
        const image = await loadImage(p.art);
        if (image.width !== SIZE || image.height !== SIZE)
          throw Error("Draft preview art must be 800 × 800 pixels.");
        images.set(p.id, image);
      }
      // Merge to preserve current unsaved panels. Duplicate IDs are rejected.
      if (
        this.panels.length + d.panels.length > MAX_PANELS ||
        d.panels.some((p) => this.panels.some((q) => q.id === p.id))
      )
        throw Error(
          "Draft overlaps loaded panel IDs or exceeds 16 panels. Reload the workshop to replace its contents.",
        );
      validateDraft({ ...d, panels: [...this.panels, ...d.panels] });
      this.panels.push(...d.panels);
      for (const [id, img] of images) this.images.set(id, img);
      this.selected = d.panels[0].id;
      this.dirty = true;
      this.controls();
      this.draw();
      this.notify("Panel draft imported.");
    } catch (e) {
      this.notify(e.message);
    } finally {
      $("import-panels").value = "";
    }
  }
}
