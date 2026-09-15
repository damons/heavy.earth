import { project, unproject } from "./renderer.js";
const $ = (id) => document.getElementById(id);
const SIZE = 800,
  MAX_PANELS = 16;
const num = (id, min, max) =>
  Math.max(min, Math.min(max, Number($(id).value) || 0));
export function validateDraft(d) {
  if (
    d?.format !== "heavy-earth-panel-draft" ||
    d.version !== 1 ||
    d.projection?.angleDegrees !== 30 ||
    d.projection?.previewPixels !== 800 ||
    !Array.isArray(d.panels) ||
    !d.panels.length ||
    d.panels.length > MAX_PANELS
  )
    throw Error(
      "Unsupported panel draft. Expected version 1, 30° axes, and 1–16 panels.",
    );
  const ids = new Set(),
    connectors = new Set();
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
      ![8, 10].includes(p.inches) ||
      !Number.isFinite(p.pitch) ||
      p.pitch < 16 ||
      p.pitch > 400 ||
      !Array.isArray(p.origin) ||
      p.origin.length !== 2 ||
      p.origin.some((v) => !Number.isFinite(v) || Math.abs(v) > 1600) ||
      !Array.isArray(p.assembly) ||
      p.assembly.length !== 2 ||
      p.assembly.some((v) => !Number.isInteger(v) || Math.abs(v) > 100) ||
      !Number.isInteger(p.threshold) ||
      p.threshold < 0 ||
      p.threshold > 255
    )
      throw Error("Invalid panel calibration.");
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
        !["open", "blocked"].includes(c.kind) ||
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
      if (!other || other.panel === c.panel || other.target !== c.id)
        throw Error(
          "Connections must be reciprocal and join different panels.",
        );
    }
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
    this.previewMask = false;
    this.canvas = $("panel-canvas");
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    $("panel-upload").onchange = (e) => this.upload(e.target.files[0]);
    $("panel-select").onchange = () => {
      this.selected = $("panel-select").value;
      this.controls();
      this.draw();
    };
    for (const id of [
      "panel-name",
      "panel-inches",
      "panel-pitch",
      "panel-origin-x",
      "panel-origin-y",
      "panel-grid-x",
      "panel-grid-y",
      "panel-threshold",
    ])
      $(id).addEventListener("input", () => {
        if (id === "panel-inches" && this.panel)
          $("panel-pitch").value =
            (this.panel.pitch * this.panel.inches) /
            Number($("panel-inches").value);
        this.update();
      });
    $("panel-mask").onchange = () => {
      this.previewMask = $("panel-mask").checked;
      this.draw();
    };
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
    $("import-panels").onchange = (e) => this.import(e.target.files[0]);
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
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
        inches: 8,
        pitch: 80,
        origin: [400, 100],
        assembly: [this.panels.length, 0],
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
        "Panel added. Align the grid origin and pitch with the scan.",
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
      "panel-inches": p.inches,
      "panel-pitch": p.pitch,
      "panel-origin-x": p.origin[0],
      "panel-origin-y": p.origin[1],
      "panel-grid-x": p.assembly[0],
      "panel-grid-y": p.assembly[1],
      "panel-threshold": p.threshold,
    }))
      $(id).value = value;
    $("threshold-value").textContent = p.threshold;
    this.connections();
  }
  update() {
    const p = this.panel;
    if (!p) return;
    Object.assign(p, {
      name: $("panel-name").value.slice(0, 64) || "Untitled panel",
      inches: Number($("panel-inches").value),
      pitch: num("panel-pitch", 16, 400),
      origin: [
        num("panel-origin-x", -1600, 1600),
        num("panel-origin-y", -1600, 1600),
      ],
      assembly: [
        Math.round(num("panel-grid-x", -100, 100)),
        Math.round(num("panel-grid-y", -100, 100)),
      ],
      threshold: Math.round(num("panel-threshold", 0, 255)),
    });
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
    for (let i = -80; i <= 80; i++) {
      line(this.point(-80, i), this.point(80, i));
      line(this.point(i, -80), this.point(i, 80));
    }
    c.globalAlpha = 1;
    for (const cell of p.cells) {
      const points = [
        this.point(cell.x, cell.y),
        this.point(cell.x + 1, cell.y),
        this.point(cell.x + 1, cell.y + 1),
        this.point(cell.x, cell.y + 1),
      ];
      c.beginPath();
      points.forEach((a, i) => (i ? c.lineTo(a.x, a.y) : c.moveTo(a.x, a.y)));
      c.closePath();
      c.fillStyle = cell.kind === "open" ? "#ffffffa0" : "#000000c0";
      c.fill();
      c.strokeStyle = cell.kind === "open" ? "#222" : "#ddd";
      c.lineWidth = 2;
      c.stroke();
      const center = this.point(cell.x + 0.5, cell.y + 0.5);
      c.fillStyle = cell.kind === "open" ? "#111" : "#fff";
      c.font = "12px monospace";
      c.textAlign = "center";
      c.fillText(cell.kind === "open" ? "○" : "×", center.x, center.y + 4);
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
    const pitch = (p.pitch / SIZE) * p.inches;
    $("panel-feedback").textContent =
      `${p.cells.length} marked cells · ${p.connectors.length} connectors · ${pitch.toFixed(3)} in per tile diagonal`;
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
    if (tool === "connector") {
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
          (c) => c.panel !== p.id && (!c.target || c.target === v.id),
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
  export() {
    if (!this.panels.length) {
      this.notify("Add a scanned panel first.");
      return;
    }
    const draft = {
      format: "heavy-earth-panel-draft",
      version: 1,
      projection: { angleDegrees: 30, previewPixels: SIZE },
      panels: this.panels,
    };
    try {
      validateDraft(draft);
      const blob = new Blob([JSON.stringify(draft, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "heavy-earth-panels.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.dirty = false;
      const pitches = this.panels.map((p) => (p.pitch / SIZE) * p.inches),
        consistent = Math.max(...pitches) - Math.min(...pitches) < 0.01;
      this.notify(
        consistent
          ? "Panel draft exported, including grayscale preview art. Keep your original high-resolution scans."
          : "Draft exported. Grid scales differ between panels; calibrate to the same physical pitch before future gameplay import.",
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
      const d = validateDraft(JSON.parse(await file.text())),
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
