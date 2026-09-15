// True isometric axes: +/-30 degrees. Square-world movement remains N/E/S/W.
export const ISO = Object.freeze({ angle: Math.PI / 6, pitch: 128 });
export function project(x, y, pitch = ISO.pitch) {
  return {
    x: ((x - y) * pitch) / 2,
    y: (((x + y) * pitch) / 2) * Math.tan(ISO.angle),
  };
}
export function unproject(x, y, pitch = ISO.pitch) {
  const a = x / (pitch / 2),
    b = y / ((pitch / 2) * Math.tan(ISO.angle));
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
// Future PNG sprites register here with their ground-contact anchor.
export const spriteRegistry = new Map();
export function registerSprite(key, image, anchor = { x: 0.5, y: 1 }) {
  spriteRegistry.set(key, { image, anchor });
}
export class DungeonRenderer {
  constructor(canvas, onMove) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onMove = onMove;
    this.autoZoom = true;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.map = { rooms: [], edges: [] };
    this.state = null;
    this.hover = null;
    new ResizeObserver(() => this.draw()).observe(canvas);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        pan: { ...this.pan },
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x,
          dy = e.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
        if (this.drag.moved) {
          this.pan = { x: this.drag.pan.x + dx, y: this.drag.pan.y + dy };
        }
      }
      const r = canvas.getBoundingClientRect(),
        p = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      this.hover = { x: Math.floor(p.x), y: Math.floor(p.y) };
      this.draw();
    });
    canvas.addEventListener("pointerup", (e) => {
      if (
        this.drag &&
        !this.drag.moved &&
        !this.map.journal &&
        this.state?.phase === "Exploring"
      ) {
        const r = canvas.getBoundingClientRect(),
          p = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
        const x = Math.floor(p.x),
          y = Math.floor(p.y),
          dx = x - this.state.position.x,
          dy = y - this.state.position.y;
        if (
          this.map.rooms.some((r) => r.x === x && r.y === y) &&
          Math.abs(dx) + Math.abs(dy) === 1
        )
          this.onMove(
            dx === 1
              ? "east"
              : dx === -1
                ? "west"
                : dy === 1
                  ? "south"
                  : "north",
          );
      }
      this.drag = null;
    });
    canvas.addEventListener("pointercancel", () => (this.drag = null));
    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      this.draw();
    });
  }
  set(state, map = state.map) {
    const changed =
      this.state?.depth !== state.depth ||
      this.state?.dungeon !== state.dungeon ||
      this.state?.saveId !== state.saveId ||
      this.map.journal !== map.journal ||
      this.map.level !== map.level;
    this.state = state;
    this.map = map;
    if (changed) this.center();
    else this.draw();
  }
  setZoom(z) {
    this.autoZoom = false;
    this.zoom = Math.max(0.25, Math.min(2.5, z));
    this.draw();
  }
  center() {
    this.autoZoom = true;
    this.pan = { x: 0, y: 0 };
    this.zoom = this.map.journal ? 0.68 : 1.15;
    this.draw();
  }
  origin() {
    let x = this.state?.position.x ?? 0,
      y = this.state?.position.y ?? 0;
    if (this.map.journal && this.map.rooms.length) {
      x =
        (Math.min(...this.map.rooms.map((r) => r.x)) +
          Math.max(...this.map.rooms.map((r) => r.x))) /
        2;
      y =
        (Math.min(...this.map.rooms.map((r) => r.y)) +
          Math.max(...this.map.rooms.map((r) => r.y))) /
        2;
    }
    const p = project(x + 0.5, y + 0.5);
    return {
      x: this.width / 2 - p.x * this.zoom + this.pan.x,
      y: this.height * 0.53 - p.y * this.zoom + this.pan.y,
    };
  }
  point(x, y, z = 0) {
    const p = project(x, y),
      o = this.origin();
    return { x: o.x + p.x * this.zoom, y: o.y + (p.y - z) * this.zoom };
  }
  screenToWorld(x, y) {
    const o = this.origin();
    return unproject((x - o.x) / this.zoom, (y - o.y) / this.zoom);
  }
  polygon(points, fill, stroke = "#555", width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  line(a, b, color = "#555", width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  ellipse(x, y, rx, ry, fill, stroke) {
    const c = this.ctx;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.stroke();
    }
  }
  box(x, y, w, d, h, fill = "#bababa", base = 0) {
    const a = this.point(x, y, base),
      b = this.point(x + w, y, base),
      c = this.point(x + w, y + d, base),
      f = this.point(x, y + d, base);
    const A = this.point(x, y, h + base),
      B = this.point(x + w, y, h + base),
      C = this.point(x + w, y + d, h + base),
      F = this.point(x, y + d, h + base);
    this.polygon([b, c, C, B], "#626262", "#303030");
    this.polygon([f, c, C, F], "#828282", "#303030");
    this.polygon([A, B, C, F], fill, "#333");
    return { a, b, c, f, A, B, C, F };
  }
  floor(room) {
    const { x, y } = room,
      points = [
        this.point(x, y),
        this.point(x + 1, y),
        this.point(x + 1, y + 1),
        this.point(x, y + 1),
      ];
    const selected = this.hover?.x === x && this.hover?.y === y;
    this.box(
      x,
      y,
      1,
      1,
      10,
      this.map.journal ? "#b0b0b0" : selected ? "#f0f0f0" : "#cfcfcf",
      -10,
    );
    this.polygon(points, null, "#696969");
    // Deterministic pen stipple and hairline joints; never consumes game RNG.
    for (let i = 0; i < 22; i++) {
      const u = ((x * 73 + y * 31 + i * 47) % 97) / 110 + 0.06,
        v = ((x * 29 + y * 97 + i * 31) % 89) / 102 + 0.06;
      const p = this.point(x + u, y + v);
      this.ctx.fillStyle = i % 4 ? "#999" : "#666";
      this.ctx.fillRect(
        p.x,
        p.y,
        Math.max(0.55, this.zoom * 0.65),
        Math.max(0.55, this.zoom * 0.65),
      );
    }
    if ((x + y) % 3 === 0) {
      this.line(
        this.point(x + 0.1, y + 0.62),
        this.point(x + 0.35, y + 0.67),
        "#a0a0a0",
      );
      this.line(
        this.point(x + 0.35, y + 0.67),
        this.point(x + 0.42, y + 0.79),
        "#a0a0a0",
      );
    }
  }
  wall(edge) {
    if (edge.kind === "open") return;
    let { x, y, direction, kind } = edge;
    const horizontal = direction === "north" || direction === "south";
    if (direction === "south") y++;
    if (direction === "east") x++;
    // Foreground cutaways keep the token and room furniture readable.
    const height = this.map.journal
      ? 16
      : direction === "south" || direction === "east"
        ? 20
        : 49;
    const segment = (start, length, h = height) => {
      const px = x + (horizontal ? start : 0),
        py = y + (horizontal ? 0 : start);
      const w = horizontal ? length : 0.07,
        d = horizontal ? 0.07 : length;
      this.box(px, py, w, d, h, "#c4c4c4");
      for (let z = 12; z < h; z += 12) {
        this.line(
          this.point(px, py + d, z),
          this.point(px + w, py + d, z),
          "#555",
          0.6,
        );
        this.line(
          this.point(px + w, py, z),
          this.point(px + w, py + d, z),
          "#464646",
          0.6,
        );
      }
      for (let i = 0; i < length * 7; i++) {
        const t = (i + 0.5) / 7;
        this.line(
          this.point(px + (horizontal ? t : w), py + (horizontal ? d : t), 5),
          this.point(
            px + (horizontal ? t : w),
            py + (horizontal ? d : t),
            Math.min(h - 3, 11 + (i % 3) * 12),
          ),
          "#454545",
          0.65,
        );
      }
    };
    if (kind === "door" || kind === "secret") {
      segment(0, 0.25);
      segment(0.75, 0.25);
      const a = this.point(
          x + (horizontal ? 0.25 : 0),
          y + (horizontal ? 0 : 0.25),
          3,
        ),
        b = this.point(
          x + (horizontal ? 0.75 : 0),
          y + (horizontal ? 0 : 0.75),
          3,
        );
      this.line(a, b, kind === "secret" ? "#777" : "#ddd", 3 * this.zoom);
      if (kind === "door") {
        const p = this.point(
          x + (horizontal ? 0.28 : 0),
          y + (horizontal ? 0 : 0.28),
        );
        this.line(
          p,
          { x: p.x + 19 * this.zoom, y: p.y - 12 * this.zoom },
          "#262626",
          5 * this.zoom,
        );
      }
    } else segment(0, 1);
  }
  fixture(room) {
    const k = room.feature;
    if (k === "Empty") return;
    const x = room.x + 0.5,
      y = room.y + 0.5,
      p = this.point(x, y),
      s = this.zoom,
      c = this.ctx;
    const registered = spriteRegistry.get(k);
    if (registered) {
      const { image, anchor } = registered;
      c.drawImage(
        image,
        p.x - image.width * anchor.x * s,
        p.y - image.height * anchor.y * s,
        image.width * s,
        image.height * s,
      );
      return;
    }
    const line = (a, b, col = "#333", w = 1) =>
      this.line(
        { x: p.x + a[0] * s, y: p.y + a[1] * s },
        { x: p.x + b[0] * s, y: p.y + b[1] * s },
        col,
        w * s,
      );
    if (["Up", "Down", "Stairs", "Pit", "Elevator"].includes(k)) {
      this.polygon(
        [
          this.point(x - 0.27, y - 0.28),
          this.point(x + 0.29, y - 0.28),
          this.point(x + 0.29, y + 0.28),
          this.point(x - 0.27, y + 0.28),
        ],
        "#333",
        "#222",
      );
      if (k !== "Pit")
        for (let i = 0; i < 5; i++) {
          const t = i * 0.095;
          this.box(x - 0.24 + t, y - 0.24, 0.095, 0.49, 3 + i * 3, "#c7c7c7");
        }
      return;
    }
    if (k === "Altar" || k === "Throne" || k === "Trove") {
      this.box(x - 0.17, y - 0.14, 0.34, 0.28, 20, "#ddd");
      if (k === "Altar") {
        this.box(x - 0.26, y - 0.2, 0.52, 0.4, 6, "#eee", 20);
        line([-12, -35], [-12, -25]);
        line([12, -34], [12, -24]);
      }
      if (k === "Throne") this.box(x - 0.18, y - 0.18, 0.07, 0.36, 42, "#aaa");
      if (k === "Trove") {
        line([0, -11], [0, -19], "#222", 3);
        line([-13, -20], [12, -6], "#444");
      }
      return;
    }
    if (k === "Fountain") {
      this.ellipse(p.x, p.y, 25 * s, 13 * s, "#777", "#333");
      this.ellipse(p.x, p.y - 5 * s, 24 * s, 12 * s, "#dedede", "#333");
      this.ellipse(p.x, p.y - 6 * s, 17 * s, 8 * s, "#484848", "#aaa");
      this.box(x - 0.04, y - 0.04, 0.08, 0.08, 27, "#ccc");
      this.ellipse(p.x, p.y - 27 * s, 11 * s, 5 * s, "#ddd", "#333");
      return;
    }
    if (["Teleporter", "Transporter", "Orb", "Djinn", "Unknown"].includes(k)) {
      this.ellipse(p.x, p.y, 24 * s, 13 * s, null, "#444");
      this.ellipse(p.x, p.y, 18 * s, 9 * s, null, "#777");
      const h = k === "Unknown" ? 12 : 28;
      this.polygon(
        [
          { x: p.x, y: p.y - h * s },
          { x: p.x + 9 * s, y: p.y - (h - 10) * s },
          { x: p.x, y: p.y - (h - 20) * s },
          { x: p.x - 9 * s, y: p.y - (h - 10) * s },
        ],
        k === "Unknown" ? "#777" : "#eee",
        "#333",
      );
      return;
    }
    if (k === "Mirror") {
      this.box(x - 0.16, y - 0.05, 0.32, 0.1, 6, "#777");
      this.ellipse(p.x, p.y - 24 * s, 14 * s, 23 * s, "#666", "#ddd");
      line([-7, -26], [7, -36], "#bbb");
      return;
    }
    if (k === "Dragon") {
      this.monster(x, y, "Dragon");
    }
  }
  monster(x, y, name) {
    const p = this.point(x, y),
      s = this.zoom;
    const sprite =
      spriteRegistry.get("Monster:" + name) || spriteRegistry.get("Monster");
    if (sprite) {
      const { image, anchor } = sprite;
      this.ctx.drawImage(
        image,
        p.x - image.width * anchor.x * s,
        p.y - image.height * anchor.y * s,
        image.width * s,
        image.height * s,
      );
      return;
    }
    this.ellipse(p.x, p.y, 18 * s, 8 * s, "#3337");
    this.polygon(
      [
        { x: p.x - 16 * s, y: p.y - 3 * s },
        { x: p.x - 11 * s, y: p.y - 34 * s },
        { x: p.x, y: p.y - 46 * s },
        { x: p.x + 14 * s, y: p.y - 31 * s },
        { x: p.x + 19 * s, y: p.y },
      ],
      "#242424",
      "#ddd",
    );
    this.line(
      { x: p.x - 9 * s, y: p.y - 32 * s },
      { x: p.x - 16 * s, y: p.y - 48 * s },
      "#ddd",
      2 * s,
    );
    this.line(
      { x: p.x + 9 * s, y: p.y - 32 * s },
      { x: p.x + 17 * s, y: p.y - 45 * s },
      "#ddd",
      2 * s,
    );
    this.line(
      { x: p.x - 7 * s, y: p.y - 29 * s },
      { x: p.x - 2 * s, y: p.y - 27 * s },
      "#fff",
      2 * s,
    );
    this.line(
      { x: p.x + 3 * s, y: p.y - 27 * s },
      { x: p.x + 8 * s, y: p.y - 29 * s },
      "#fff",
      2 * s,
    );
  }
  player() {
    const { x, y } = this.state.position,
      p = this.point(x + 0.5, y + 0.5),
      s = this.zoom;
    this.ellipse(p.x, p.y + 2 * s, 18 * s, 9 * s, "#2228");
    this.ellipse(p.x, p.y, 22 * s, 12 * s, null, "#fff");
    const sprite = spriteRegistry.get("Player");
    if (sprite) {
      const { image, anchor } = sprite;
      this.ctx.drawImage(
        image,
        p.x - image.width * anchor.x * s,
        p.y - image.height * anchor.y * s,
        image.width * s,
        image.height * s,
      );
      return;
    }
    const poly = (ps) =>
      this.polygon(
        ps.map(([a, b]) => ({ x: p.x + a * s, y: p.y + b * s })),
        "#ededed",
        "#222",
        1.5 * s,
      );
    poly([
      [-12, 0],
      [-10, -29],
      [-5, -38],
      [6, -38],
      [13, -26],
      [16, -1],
      [2, 4],
    ]);
    this.ellipse(p.x, p.y - 43 * s, 8 * s, 10 * s, "#ddd", "#222");
    this.line(
      { x: p.x - 5 * s, y: p.y - 46 * s },
      { x: p.x + 7 * s, y: p.y - 46 * s },
      "#333",
      2 * s,
    );
    this.line(
      { x: p.x + 18 * s, y: p.y - 3 * s },
      { x: p.x + 25 * s, y: p.y - 40 * s },
      "#eee",
      2 * s,
    );
    this.line(
      { x: p.x + 18 * s, y: p.y - 19 * s },
      { x: p.x + 27 * s, y: p.y - 17 * s },
      "#eee",
      2 * s,
    );
    this.line(
      { x: p.x - 2 * s, y: p.y - 29 * s },
      { x: p.x - 4 * s, y: p.y },
      "#777",
      s,
    );
    if (this.state.phase === "Combat")
      this.monster(x + 0.84, y + 0.1, this.state.encounter.name);
    if (this.state.phase === "Treasure")
      this.fixture({ x: x + 0.3, y: y - 0.4, feature: "Trove" });
  }
  draw() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.width = r.width;
    this.height = r.height;
    if (this.autoZoom)
      this.zoom = Math.min(
        this.map.journal ? 0.68 : 1.15,
        this.width / (this.map.journal ? 800 : 520),
      );
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#151515";
    c.fillRect(0, 0, this.width, this.height);
    // Background survey marks are decoration, not unexplored floor cells.
    c.fillStyle = "#2a2a2a";
    for (let y = 24; y < this.height; y += 32)
      for (let x = 24; x < this.width; x += 32) c.fillRect(x, y, 1, 1);
    if (!this.state) return;
    const rooms = [...this.map.rooms].sort((a, b) => a.x + a.y - (b.x + b.y));
    rooms.forEach((r) => this.floor(r));
    const unique = new Map();
    for (const e of this.map.edges) {
      let { x, y, direction } = e;
      if (direction === "east") x++;
      if (direction === "south") y++;
      unique.set(
        `${x},${y},${["north", "south"].includes(direction) ? "h" : "v"}`,
        e,
      );
    }
    const objects = [...unique.values()].map((e) => ({
      depth:
        e.x + e.y + (e.direction === "south" || e.direction === "east" ? 1 : 0),
      draw: () => this.wall(e),
    }));
    rooms.forEach((r) =>
      objects.push({ depth: r.x + r.y + 0.6, draw: () => this.fixture(r) }),
    );
    objects.sort((a, b) => a.depth - b.depth).forEach((o) => o.draw());
    const present = this.map.rooms.some(
      (r) => r.x === this.state.position.x && r.y === this.state.position.y,
    );
    if (
      present &&
      this.map.level === this.state.depth &&
      !["Town", "Won"].includes(this.state.phase)
    )
      this.player();
    if (!rooms.length && !["Town", "Won"].includes(this.state.phase)) {
      c.fillStyle = "#888";
      c.textAlign = "center";
      c.font = "14px Georgia";
      c.fillText(
        this.map.journal
          ? "This level has not been charted."
          : "Beyond the reach of your light.",
        this.width / 2,
        this.height / 2,
      );
    }
  }
}
