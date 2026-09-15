import { DungeonRenderer } from "./renderer.js";
import { PanelWorkshop } from "./panels.js";
const $ = (id) => document.getElementById(id);
let state = null,
  busy = false,
  mode = "live",
  journal = null,
  toastTimer,
  logSignature = "",
  title = true;
const renderer = new DungeonRenderer($("dungeon-canvas"), command);
const workshop = new PanelWorkshop(toast);
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
}
async function api(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Heavy-Earth": "1" },
          body: JSON.stringify(body),
        },
  );
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(text || "The local game server did not respond.");
  }
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
function stats(target, values) {
  target.replaceChildren(
    ...["STR", "INT", "WIS", "CON", "DEX", "CHA"].map((name, i) => {
      const el = document.createElement("div");
      el.className = "stat";
      el.textContent = name;
      const n = document.createElement("strong");
      n.textContent = values[i];
      el.append(n);
      return el;
    }),
  );
}
function button(label, fn, primary = false) {
  const b = document.createElement("button");
  b.textContent = label;
  if (primary) b.className = "primary";
  b.addEventListener("click", fn);
  return b;
}
function showScreen(screen) {
  const changed = $(screen + "-screen").hidden;
  for (const name of ["title", "game", "panel"])
    $(name + "-screen").hidden = name !== screen;
  $("panels-tab").classList.toggle("active", screen === "panel");
  $("play-tab").classList.toggle("active", screen !== "panel");
  if (changed) window.scrollTo(0, 0);
  if (screen === "panel") workshop.draw();
  if (screen === "game") renderer.draw();
}
async function saves() {
  try {
    const list = await api("/api/saves");
    $("saves").replaceChildren();
    if (!list.length) {
      $("saves").textContent =
        "No expeditions yet. The first descent is yours.";
      $("saves").classList.add("muted");
    }
    for (const s of list) {
      const b = button("", async () => {
        if (busy) return;
        busy = true;
        try {
          state = await api("/api/resume", { id: s.id });
          title = false;
          mode = "live";
          render();
        } catch (e) {
          toast(e.message);
        } finally {
          busy = false;
        }
      });
      b.className = "save-row";
      b.disabled = !!s.invalid;
      const label = document.createElement("div");
      label.textContent = s.name;
      const small = document.createElement("small");
      small.textContent = s.invalid
        ? "Invalid save — original file preserved"
        : `${s.class} · Level ${s.level} · ${s.dungeon} · ${s.phase}`;
      label.append(small);
      b.append(label, document.createTextNode("↗"));
      $("saves").append(b);
    }
  } catch (e) {
    toast(e.message);
  }
}
async function roll() {
  if (busy) return;
  busy = true;
  try {
    const draft = await api("/api/roll", {
      name: $("name").value,
      class: $("class").value,
      dungeon: $("dungeon").value,
    });
    stats($("roll-stats"), draft.player.stats);
    $("roll-hp").textContent =
      `${draft.player.max_hp} vitality · ${draft.player.slots.join(" / ")} spell charges`;
    $("roll-result").hidden = false;
    $("create-form").querySelector("button").textContent = "Roll again ↗";
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
}
$("create-form").addEventListener("submit", (e) => {
  e.preventDefault();
  roll();
});
$("reroll").onclick = roll;
for (const id of ["name", "class", "dungeon"])
  $(id).addEventListener("input", () => {
    $("roll-result").hidden = true;
    $("create-form").querySelector("button").textContent =
      "Roll a character ↗";
  });
$("class").addEventListener("change", () => {
  $("class-note").textContent = {
    fighter: "Steel and endurance. Fighters need a wand to cast spells.",
    cleric: "Faith and resilience. Healing, protection, and clerical magic.",
    magician:
      "Knowledge and power. A full book of magic, and little room for error.",
  }[$("class").value];
});
$("begin").onclick = async () => {
  if (busy) return;
  busy = true;
  try {
    state = await api("/api/begin", {});
    mode = "live";
    title = false;
    $("roll-result").hidden = true;
    render();
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
};
function setState(next) {
  state = next;
  render();
}
async function command(text) {
  if (!state || busy) return;
  text = text.trim();
  const first = text.toLowerCase().split(/\s+/)[0];
  if (["help", "h", "?", "0"].includes(first)) {
    guide();
    return;
  }
  if (["spells", "b"].includes(first)) {
    spellbook();
    return;
  }
  if (first === "map") {
    const arg = text.split(/\s+/)[1],
      level = arg === undefined ? state.depth : Number(arg);
    if (!Number.isInteger(level) || level < 1 || level > 20) {
      toast("Map level must be 1–20.");
      return;
    }
    await showJournal(level);
    return;
  }
  if (first === "status") {
    showStatus();
    return;
  }
  busy = true;
  $("save-status").textContent = "Saving…";
  document
    .querySelectorAll("#actions button")
    .forEach((b) => (b.disabled = true));
  try {
    const next = await api("/api/command", {
      command: text,
      revision: state.revision,
    });
    mode = "live";
    setState(next);
    if (["quit", "q"].includes(first)) {
      title = true;
      showScreen("title");
      await saves();
    } else if (first === "save") toast("Adventure saved.");
  } catch (e) {
    toast(e.message);
    try {
      state = await api("/api/state");
      render();
    } catch {
      $("save-status").textContent = "Server unavailable — restart to resume";
    }
  } finally {
    busy = false;
    document
      .querySelectorAll("#actions button")
      .forEach((b) => (b.disabled = false));
  }
}
function ledger(target, entries) {
  target.replaceChildren(
    ...entries.map(([k, v]) => {
      const row = document.createElement("div"),
        label = document.createElement("span"),
        n = document.createElement("strong");
      label.textContent = k;
      n.textContent = v;
      row.append(label, n);
      return row;
    }),
  );
}
function render() {
  if (!state || state.phase === "Title") {
    title = true;
    showScreen("title");
    saves();
    return;
  }
  if (!title) showScreen("game");
  const p = state.player;
  $("player-name").textContent = p.name;
  $("player-subtitle").textContent =
    `Level ${p.level} ${p.class}${p.immortal ? " · Immortal" : ""}`;
  $("hp-label").textContent = `${p.hp} / ${p.max_hp}`;
  $("hp-bar").style.width = `${Math.max(0, (p.hp / p.max_hp) * 100)}%`;
  stats($("player-stats"), p.stats);
  $("xp").textContent =
    `${p.xp.toLocaleString()} / ${state.nextXp.toLocaleString()}`;
  $("gold").textContent = p.gold.toLocaleString();
  $("bank").textContent = p.bank.toLocaleString();
  ledger($("equipment"), [
    ["Weapon", `+${p.weapon}`],
    ["Armor", `+${p.armor}`],
    ["Shield", p.shield < 0 ? "None" : `+${p.shield}`],
    ["Ring", `+${p.ring}`],
    ["Boots / cloak", `+${p.boots} / +${p.cloak}`],
    ["Wand", `${p.wand} charges`],
    ...(p.orb ? [["Orb of Zot", "Carried"]] : []),
  ]);
  $("charges").replaceChildren(
    ...p.slots.map((n, i) => {
      const d = document.createElement("div");
      d.className = "charge";
      const small = document.createElement("small");
      small.textContent = `TIER ${i + 1}`;
      d.append(small, document.createTextNode(n));
      return d;
    }),
  );
  $("effects").textContent = state.effects
    .map((e) => `${e.name} · ${e.permanent ? "∞" : e.turns}`)
    .join(" / ");
  $("location").textContent = state.dungeon;
  $("location-caption").textContent =
    state.phase === "Town"
      ? "AT THE EDGE OF THE UNDERWORLD"
      : `DUNGEON LEVEL ${String(state.depth).padStart(2, "0")}`;
  $("coordinates").textContent =
    `X ${String(state.position.x + 1).padStart(2, "0")} / Y ${String(state.position.y + 1).padStart(2, "0")}`;
  $("turns").textContent = `TURN ${String(state.turns).padStart(4, "0")}`;
  $("phase-label").textContent =
    state.phase === "Choice"
      ? "A ROOM OF CONSEQUENCE"
      : state.phase.toUpperCase();
  const phrases = {
    Town: ["You are in town.", "Banked gold buys equipment. Enter when ready."],
    Exploring: [
      "The silence is never empty.",
      "Choose a direction. Each action may bring an encounter.",
    ],
    Combat: [
      state.encounter?.name,
      `Level ${state.encounter?.level} · ${state.encounter?.hp} / ${state.encounter?.maxHp} vitality`,
    ],
    Treasure: [state.encounter?.name, "Take it, or leave it to the dark."],
    Choice: [state.encounter?.name, "Choose how to approach this room."],
    Dead: [
      "The earth keeps another.",
      "This adventure is over. Start a new character from Adventures.",
    ],
    Won: [
      "You brought it back.",
      "The Orb grants immortality. Your story can continue.",
    ],
  };
  $("encounter-title").textContent = phrases[state.phase][0];
  $("encounter-note").textContent = phrases[state.phase][1];
  $("actions").replaceChildren(
    ...state.actions.map(([label, cmd], i) =>
      button(label, () => command(cmd), i === 0 && state.phase !== "Exploring"),
    ),
  );
  if (["Combat", "Exploring", "Choice"].includes(state.phase))
    $("actions").append(button("Cast spell", spellbook));
  if (state.phase === "Town")
    $("actions").append(button("Outfitter", store), button("Travel", travel));
  if (state.phase === "Dead")
    $("actions").append(button("New adventurer", goTitle, true));
  if (state.phase === "Choice") {
    const f = state.encounter.name;
    if (f === "Altar")
      $("actions").append(button("Give gold", () => commandEntry("give ")));
    if (f === "Transporter")
      $("actions").append(
        button("Choose level", () =>
          choiceForm(
            "Transporter destination",
            "Level (1–20)",
            "number",
            (v) => v,
          ),
        ),
      );
    if (f === "Trove")
      $("actions").append(
        button("Try combination", () =>
          choiceForm(
            "Treasure trove",
            "Two colors: R / G / B / O",
            "text",
            (v) => v,
          ),
        ),
      );
  }
  const signature = JSON.stringify(state.log);
  if (signature !== logSignature) {
    logSignature = signature;
    $("log").replaceChildren(
      ...state.log.map((entry, i) => {
        const li = document.createElement("li");
        const n = document.createElement("span");
        n.textContent = String(i + 1).padStart(3, "0");
        li.append(n, document.createTextNode(entry));
        return li;
      }),
    );
    $("log").scrollTop = $("log").scrollHeight;
    $("log").scrollLeft = $("log").scrollWidth;
  }
  $("save-status").textContent = "Saved · every action";
  renderMap();
}
function renderMap() {
  const isJournal = mode === "journal";
  $("live-mode").classList.toggle("selected", !isJournal);
  $("journal-mode").classList.toggle("selected", isJournal);
  $("journal-level-wrap").hidden = !isJournal;
  $("town-overlay").hidden = isJournal || state.phase !== "Town";
  $("view-note").textContent = isJournal
    ? "EXPLORATION RECORD · movement paused"
    : state.phase === "Town"
      ? ""
      : "CURRENT SIGHT · darkness conceals the rest";
  renderer.set(state, isJournal && journal ? journal : state.map);
}
async function showJournal(level = state?.depth) {
  if (!state || state.phase === "Title") return;
  try {
    journal = await api(`/api/map?level=${level}`);
    mode = "journal";
    $("journal-level").value = String(level);
    renderMap();
  } catch (e) {
    toast(e.message);
  }
}
for (let i = 1; i <= 20; i++) {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = i;
  $("journal-level").append(opt);
}
$("journal-level").onchange = () =>
  showJournal(Number($("journal-level").value));
$("journal-mode").onclick = () => showJournal();
$("live-mode").onclick = () => {
  mode = "live";
  renderMap();
};
$("zoom-in").onclick = () => renderer.setZoom(renderer.zoom * 1.2);
$("zoom-out").onclick = () => renderer.setZoom(renderer.zoom / 1.2);
$("center-view").onclick = () => renderer.center();
$("enter-dungeon").onclick = () => command("enter");
$("save-button").onclick = () => command("save");
$("spellbook").onclick = spellbook;
function goTitle() {
  title = true;
  showScreen("title");
  saves();
}
$("return-title").onclick = goTitle;
$("home").onclick = (e) => {
  e.preventDefault();
  goTitle();
};
$("refresh-saves").onclick = saves;
$("play-tab").onclick = () => {
  title = !state || state.phase === "Title";
  showScreen(title ? "title" : "game");
  if (!title) render();
};
$("panels-tab").onclick = () => showScreen("panel");
$("help").onclick = guide;
function dialog(title, nodes) {
  $("dialog-title").textContent = title;
  $("dialog-content").replaceChildren(...nodes);
  if (!$("book-dialog").open) $("book-dialog").showModal();
}
$("close-dialog").onclick = () => $("book-dialog").close();
function commandEntry(value) {
  $("book-dialog").close();
  $("command").value = value;
  $("command").focus();
}
function spellbook() {
  if (!state || state.phase === "Title") {
    toast("Begin an adventure to open your spellbook.");
    return;
  }
  const header = document.createElement("div");
  header.className = "spell-direction";
  const label = document.createElement("label");
  label.textContent = "Direction for Pass Wall";
  const dir = document.createElement("select");
  for (const d of ["north", "east", "south", "west"]) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    dir.append(opt);
  }
  label.append(dir);
  header.append(label);
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent =
    state.player.class === "Fighter"
      ? `Wand: ${state.player.wand} charges. Each cast costs TIER charges.`
      : `Available charges by tier: ${state.player.slots.join(" / ")}`;
  const rows = state.spells.map((s) => {
    const row = document.createElement("div");
    row.className = "spell";
    const info = document.createElement("div"),
      h = document.createElement("h3"),
      p = document.createElement("p");
    h.textContent = `${s.tier}.${s.number}  ${s.name}`;
    p.textContent = s.description + (s.combat ? " · Combat" : "");
    info.append(h, p);
    const b = button("Cast ↗", () => {
      $("book-dialog").close();
      command(
        `cast ${s.tier} ${s.number}${s.name === "Pass Wall" ? " " + dir.value : ""}`,
      );
    });
    row.append(info, b);
    return row;
  });
  dialog("The spellbook", [note, header, ...rows]);
}
function choiceForm(title, label, type, format) {
  const form = document.createElement("form"),
    l = document.createElement("label"),
    input = document.createElement("input"),
    b = document.createElement("button");
  l.textContent = label;
  input.type = type;
  input.required = true;
  if (type === "number") {
    input.min = 1;
    input.max = 20;
  } else input.maxLength = 2;
  l.append(input);
  b.textContent = "Submit";
  b.className = "primary";
  b.style.marginTop = "18px";
  form.append(l, b);
  form.onsubmit = (e) => {
    e.preventDefault();
    $("book-dialog").close();
    command(format(input.value));
  };
  dialog(title, [form]);
  input.focus();
}
function store() {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = `${state.player.bank.toLocaleString()} banked gold available. The original store determines prices and credits your existing equipment.`;
  const form = document.createElement("form"),
    row = document.createElement("div");
  row.className = "form-row";
  const item = document.createElement("select");
  item.setAttribute("aria-label", "Item");
  for (const name of [
    "weapon",
    "armor",
    "shield",
    "ring",
    "boots",
    "cloak",
    "book",
    "map",
  ]) {
    const o = document.createElement("option");
    o.textContent = name;
    item.append(o);
  }
  const n = document.createElement("input");
  n.type = "number";
  n.min = 1;
  n.max = 20;
  n.value = 1;
  n.required = true;
  n.setAttribute("aria-label", "Quality or map level");
  row.append(item, n);
  const b = document.createElement("button");
  b.textContent = "Buy with banked gold";
  b.className = "primary";
  form.append(row, b);
  form.onsubmit = (e) => {
    e.preventDefault();
    $("book-dialog").close();
    command(`buy ${item.value} ${n.value}`);
  };
  dialog("The outfitter", [p, form]);
}
function travel() {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = `Travel costs ${state.player.level * 1000} banked gold.`;
  const rows = ["telengard", "shvenk", "lamorte", "warren", "cavern"].map((d) =>
    button(d, () => {
      $("book-dialog").close();
      command("travel " + d);
    }),
  );
  dialog("Choose your dungeon", [p, ...rows]);
}
function showStatus() {
  const pre = document.createElement("p");
  pre.className = "guide";
  pre.textContent = `${state.player.name} · ${state.player.class} · Level ${state.player.level} · ${state.player.hp}/${state.player.max_hp} vitality · ${state.player.gold} carried gold · ${state.player.bank} banked gold. ${state.effects.map((e) => e.name).join(", ")}`;
  dialog("Character status", [pre]);
}
function guide() {
  const d = document.createElement("div");
  d.className = "guide";
  d.innerHTML = `<p>Find the Orb of Zot and return to the surface. Returning banks carried gold, awards treasure experience, and restores health and spells. Mortal death is permanent.</p><h3>Find your way</h3><p><kbd>W</kbd> / ↑ north (upper right) · <kbd>D</kbd> / → east (lower right)<br><kbd>X</kbd> / ↓ south (lower left) · <kbd>A</kbd> / ← west (upper left)<br>Click an adjacent visible tile to take one step. Drag to pan, scroll to zoom. Movement is instantaneous.</p><p><kbd>S</kbd> wait · <kbd>R</kbd> search · <kbd>I</kbd> interact / ignore<br><kbd>U</kbd> / 9 upstairs · 3 downstairs<br><kbd>F</kbd> fight · <kbd>E</kbd> evade · <kbd>C</kbd> / <kbd>B</kbd> spells<br><kbd>M</kbd> explored map · <kbd>H</kbd> field guide · <kbd>:</kbd> command<br><kbd>F5</kbd> save · <kbd>Q</kbd> save and return to title</p><h3>Light and memory</h3><p>The live view shows current surroundings only. Doors and walls block sight. Light helps identify room contents. The explored map is a separate, persistent record; it never reveals undiscovered secret doors. Select a level to consult previously explored or purchased maps.</p><h3>A command for every choice</h3><p>The command line accepts the existing DND commands: <code>cast 1 6</code>, <code>give 100</code>, <code>buy ring 1</code>, <code>travel lamorte</code>, <code>map 2</code>. At troves, use two color letters (R/G/B/O); at transporters, a level from 1 to 20. Fountain and trove color names remain in the rules even though the artwork is grayscale.</p><h3>Your adventure is saved</h3><p>Each submitted action is saved locally. Return to Adventures to change characters. Closing the browser does not stop the local Rust server; Ctrl-C in its terminal does. Restart the launcher to resume.</p><h3>Built from the old dungeons</h3><p>Heavy Earth uses an unchanged snapshot of the DND Rust recreation and its original 100 maps. Its existing fidelity limitations also apply here. The Panel Workshop prepares art drafts; custom panels are not playable yet.</p>`;
  dialog("A field guide to the depths", [d]);
}
$("command-form").onsubmit = (e) => {
  e.preventDefault();
  const value = $("command").value;
  $("command").value = "";
  command(value);
};
document.addEventListener("keydown", (e) => {
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.repeat ||
    $("book-dialog").open ||
    $("game-screen").hidden ||
    e.target.closest("input,select,textarea,a")
  )
    return;
  const k = e.key.toLowerCase();
  if (e.target.closest("button") && ["enter", " "].includes(k)) return;
  if (k === "h") {
    e.preventDefault();
    guide();
    return;
  }
  if (k === "m") {
    e.preventDefault();
    if (mode === "live") showJournal();
    else {
      mode = "live";
      renderMap();
    }
    return;
  }
  if (k === "b" || k === "c") {
    e.preventDefault();
    spellbook();
    return;
  }
  if (k === ":") {
    e.preventDefault();
    commandEntry("");
    return;
  }
  if (k === "f5" || k === "q") {
    e.preventDefault();
    command(k === "q" ? "quit" : "save");
    return;
  }
  if (mode === "journal") return;
  const feature = state.encounter?.name;
  const choices = {
    Fountain: { enter: "drink", y: "drink" },
    Altar: { w: "worship", d: "desecrate" },
    Throne: { s: "sit", p: "pry", r: "read" },
    Mirror: { enter: "look", y: "look" },
    Down: { d: "down" },
    Pit: { d: "down" },
    Up: { u: "up" },
    Stairs: { u: "up", d: "down" },
  };
  const keys = {
    arrowup: "north",
    w: "north",
    arrowright: "east",
    d: "east",
    arrowdown: "south",
    x: "south",
    arrowleft: "west",
    a: "west",
    s: "wait",
    5: "wait",
    r: "search",
    u: "up",
    9: "up",
    3: "down",
    f: "fight",
    1: "fight",
    e: "evade",
    7: "evade",
    y: "take",
    delete: "ignore",
    i: state.phase === "Exploring" ? "interact" : "ignore",
    enter: state.actions[0]?.[1],
  };
  const cmd =
    (state.phase === "Choice" ? choices[feature]?.[k] : null) || keys[k];
  if (cmd) {
    e.preventDefault();
    command(cmd);
  }
});
try {
  state = await api("/api/state");
  title = state.phase === "Title";
  render();
} catch (e) {
  toast("Start the local Rust server to play. " + e.message);
}
