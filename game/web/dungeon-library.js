const $ = (id) => document.getElementById(id);
// Saved projects have independent revisions. Saving a snapshot never clears edits
// made while its request is in flight, and failed writes leave the editor intact.
export class DungeonLibrary {
  constructor(workshop) {
    this.workshop = workshop;
    this.current = null;
    this.generation = 0;
    this.saved = 0;
    this.name = "Untitled dungeon";
    this.items = [];
    this.busy = false;
    this.ready = false;
    $("dungeon-new").onclick = () => this.run(() => this.create());
    $("dungeon-open").onclick = () =>
      this.run(() => this.open($("dungeon-select").value));
    $("dungeon-save").onclick = () => this.run(() => this.save());
    $("dungeon-copy").onclick = () => this.run(() => this.save(true));
    $("dungeon-refresh").onclick = () => this.run(() => this.refreshList());
    $("dungeon-export").onclick = () => this.export();
    $("dungeon-import").onchange = (e) =>
      this.run(() => this.import(e.target.files[0])).finally(() => {
        $("dungeon-import").value = "";
      });
    $("dungeon-name").oninput = () => {
      this.name = $("dungeon-name").value;
      this.changed();
    };
    this.run(async () => {
      await this.refreshList();
      let last;
      try {
        last = sessionStorage.getItem("heavy-earth-dungeon");
      } catch {}
      if (last && this.items.some((d) => d.id === last)) await this.open(last);
      else
        this.status(
          "Create a dungeon, import one, or open a saved dungeon below.",
        );
      this.ready = true;
    });
  }
  get pending() {
    return this.generation !== this.saved;
  }
  status(text) {
    $("dungeon-status").textContent = text;
  }
  changed() {
    this.generation++;
    this.status("Unsaved changes · autosave pending…");
    this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.busy) {
        this.schedule();
        return;
      }
      this.save().catch((e) => this.status(`Not saved: ${e.message}`));
    }, 800);
  }
  async request(route, body) {
    const response = await fetch(
      route,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Heavy-Earth": "1",
            },
            body: JSON.stringify(body),
          },
    );
    if (!response.ok) {
      let message;
      try {
        message = (await response.json()).error;
      } catch {}
      throw Error(
        message ||
          `Could not save or load the dungeon (HTTP ${response.status}).`,
      );
    }
    return response.json();
  }
  async run(action) {
    if (this.busy) return;
    this.busy = true;
    this.lock(true);
    try {
      return await action();
    } catch (e) {
      this.status(e.message);
      this.workshop.notify(e.message);
    } finally {
      this.busy = false;
      this.lock(false);
      if (this.focusName) {
        $("dungeon-name").focus();
        $("dungeon-name").select();
        this.focusName = false;
      }
    }
  }
  lock(value) {
    $("dungeon-workspace").inert = value;
    $("dungeon-library-controls").disabled = value;
  }
  remember() {
    try {
      sessionStorage.setItem("heavy-earth-dungeon", this.current.id);
    } catch {}
  }
  renderList(selectCurrent = false) {
    const select = $("dungeon-select"),
      chosen = selectCurrent
        ? this.current?.id
        : select.value || this.current?.id;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Choose a saved dungeon";
    select.replaceChildren(
      empty,
      ...this.items.map((d) => {
        const o = document.createElement("option");
        o.value = d.id;
        o.textContent = `${d.name} · ${d.panels} panel${d.panels === 1 ? "" : "s"} · ${d.levels} level${d.levels === 1 ? "" : "s"}`;
        return o;
      }),
    );
    select.value = this.items.some((d) => d.id === chosen) ? chosen : "";
    $("dungeon-current").textContent = this.current
      ? `Editing: ${this.current.name}`
      : "New unsaved dungeon";
  }
  async refreshList() {
    const result = await this.request("/api/dungeons");
    this.items = result.dungeons;
    this.renderList();
    if (result.warnings.length) this.status(result.warnings.join(" "));
  }
  async save(copy = false) {
    clearTimeout(this.timer);
    if (this.saving) {
      await this.saving;
      if (!copy && !this.pending) return;
    }
    if (!copy && !this.pending && this.current) return;
    const generation = this.generation,
      name = this.name.trim();
    if (!name) throw Error("Enter a dungeon name before saving.");
    const draft = this.workshop.draft();
    this.workshop.validate(draft);
    this.status("Saving dungeon…");
    const operation = (async () => {
      const result = await this.request("/api/dungeons/save", {
        id: copy ? null : (this.current?.id ?? null),
        revision: copy ? null : (this.current?.revision ?? null),
        name,
        draft,
      });
      this.current = result;
      this.saved = generation;
      this.workshop._dirty = false;
      this.remember();
      this.items = this.items.filter((d) => d.id !== result.id);
      this.items.unshift(result);
      this.renderList(copy);
      this.status(
        this.pending
          ? "Saved snapshot · newer edits pending…"
          : `Saved locally · ${result.name} · ${result.panels} panels`,
      );
      if (this.pending) this.schedule();
    })();
    this.saving = operation;
    try {
      await operation;
    } finally {
      if (this.saving === operation) this.saving = null;
    }
  }
  async saveBeforeSwitch() {
    if (this.saving) await this.saving;
    if (this.pending || (!this.current && this.workshop.panels.length))
      await this.save();
  }
  async adopt(record, prepared) {
    this.current = record;
    this.name = record.name;
    $("dungeon-name").value = this.name;
    this.generation = 0;
    this.saved = 0;
    clearTimeout(this.timer);
    this.workshop.replaceDraft(prepared);
    this.remember();
    this.renderList(true);
    this.status(
      `Opened ${record.name} · changes save automatically on this computer.`,
    );
  }
  async create() {
    await this.saveBeforeSwitch();
    const draft = this.workshop.emptyDraft();
    const record = await this.request("/api/dungeons/save", {
      name: "Untitled dungeon",
      draft,
    });
    this.items.unshift(record);
    await this.adopt(record, { draft, images: new Map() });
    this.focusName = true;
  }
  async open(id) {
    if (!id) throw Error("Choose a saved dungeon to open.");
    await this.saveBeforeSwitch();
    const record = await this.request(
      `/api/dungeons/${encodeURIComponent(id)}`,
    );
    const prepared = await this.workshop.prepareDraft(record.draft);
    await this.adopt(record, prepared);
  }
  async import(file) {
    if (!file) return;
    if (file.size > 40_000_000)
      throw Error("Choose a dungeon or panel draft smaller than 40 MB.");
    const data = JSON.parse(await file.text());
    if (data.format === "heavy-earth-dungeon" && data.version !== 1)
      throw Error("Unsupported dungeon format version.");
    const name =
      data.format === "heavy-earth-dungeon"
        ? data.name
        : file.name.replace(/\.json$/i, "");
    if (typeof name !== "string" || !name.trim() || name.length > 80)
      throw Error("Dungeon name must contain 1–80 characters.");
    const prepared = await this.workshop.prepareDraft(
      data.format === "heavy-earth-dungeon" ? data.draft : data,
    );
    await this.saveBeforeSwitch();
    // Import is always a new dungeon; portable IDs never overwrite local projects.
    const record = await this.request("/api/dungeons/save", {
      name,
      draft: prepared.draft,
    });
    this.items.unshift(record);
    await this.adopt(record, prepared);
  }
  export() {
    try {
      const draft = this.workshop.draft();
      this.workshop.validate(draft);
      const name = this.name.trim();
      if (!name) throw Error("Enter a dungeon name before exporting.");
      this.workshop.downloadArtifact(
        { format: "heavy-earth-dungeon", version: 1, name, draft },
        `${name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "dungeon"}.json`,
        "Download dungeon JSON",
      );
      this.status("Dungeon export ready. Local autosave remains active.");
    } catch (e) {
      this.status(e.message);
    }
  }
}
