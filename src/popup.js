// The window that opens when you click the extension's icon.

import { PLATFORMS, detect } from "./lib/platforms.js";
import { describe, exportJson, format, historyCsv } from "./lib/stats.js";
import { renderCard } from "./lib/card.js";
import { getData, getSettings, getTrackers } from "./lib/settings.js";

const $ = (id) => document.getElementById(id);
const ask = (msg) => chrome.runtime.sendMessage(msg);

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

const originsOf = (t) => (t.kind === "builtin" ? PLATFORMS[t.platform].origins : [`${new URL(t.url).protocol}//${new URL(t.url).hostname}/*`]);
const samePage = (a, b) => {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
};

let tab = null;

// ---------- "this page" ----------

async function showHere(trackers) {
  const box = $("here");
  if (!tab?.url || !/^https?:/.test(tab.url)) return (box.hidden = true);
  box.hidden = false;
  const found = detect(tab.url);
  const note = $("here-note");
  $("here-pick").hidden = true;
  $("here-user").hidden = true;
  $("here-auto-row").hidden = false;
  const main = $("here-main");

  if (found) {
    const p = PLATFORMS[found.platform];
    let user = found.username;
    let mine = false;
    // Not on a profile page: which account is logged in here?
    if (!user && p.me) {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: p.me }).catch(() => []);
      if (typeof res?.result === "string" && /^[\w.-]{1,40}$/.test(res.result)) [user, mine] = [res.result, true];
    }
    const tracked = user && trackers.find((t) => t.kind === "builtin" && t.platform === found.platform && t.username.toLowerCase() === user.toLowerCase());
    if (tracked) {
      $("here-text").textContent = `${p.name}: ${user}. Already tracked.`;
      $("here-auto-row").hidden = true;
      main.textContent = "Update now";
      main.onclick = () => run(main, { type: "sync", id: tracked.id, tabId: tab.id });
      return;
    }
    $("here-text").textContent = user ? `${p.name} ${mine ? "account (you're logged in)" : "profile"}: ${user}` : `${p.name}. Which username?`;
    $("here-user").hidden = Boolean(user);
    main.textContent = `Track on ${p.name}`;
    main.onclick = () => {
      const name = user || $("here-username").value.trim();
      if (!/^[\w.-]{1,40}$/.test(name)) return (note.textContent = "Enter your username first.");
      const tracker = { kind: "builtin", platform: found.platform, username: name, auto: $("here-auto").checked };
      track(main, tracker);
    };
    note.textContent = p.anywhere ? "" : `${p.name} updates while you have it open in a tab.`;
    return;
  }

  // any other site: pick numbers
  const custom = trackers.find((t) => t.kind === "custom" && samePage(tab.url, t.url));
  $("here-text").textContent = custom ? `${custom.name}: tracked on this page.` : "Track numbers from this page?";
  $("here-auto-row").hidden = Boolean(custom);
  if (custom) {
    main.textContent = "Update now";
    main.onclick = () => run(main, { type: "sync", id: custom.id, tabId: tab.id });
    $("here-pick").hidden = false;
    $("here-pick").onclick = pick;
  } else {
    main.textContent = "Pick numbers on this page";
    main.onclick = pick;
  }
  note.textContent = "";
}

async function run(btn, msg) {
  btn.disabled = true;
  $("here-note").textContent = "Reading…";
  const r = await ask(msg);
  btn.disabled = false;
  $("here-note").textContent = r?.ok ? (r.skipped ? "Updated a moment ago." : r.changed ? "New stats!" : "No change since last time.") : r?.error || "Couldn't read.";
  render();
}

function track(btn, tracker) {
  // Permission prompts only work right after a click: ask first
  const allowed = tracker.auto ? chrome.permissions.request({ origins: originsOf(tracker) }) : Promise.resolve(false);
  run(btn, { type: "track", tracker, tabId: tab.id });
  allowed.then((ok) => !ok && tracker.auto && ($("here-note").textContent += " Automatic updates weren't allowed: it updates when you click Update."));
}

async function pick() {
  await ask({ type: "pick", tabId: tab.id });
  window.close(); // the picker is on the page now
}

// ---------- the list ----------

function download(name, type, data) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function png(svg) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: img.naturalWidth * 2, height: img.naturalHeight * 2 });
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob(ok, "image/png"));
}

async function exportAs(kind, t, data, theme) {
  const d = describe(t);
  const svg = renderCard(data.latest, d, { theme });
  const json = JSON.stringify(exportJson(data.latest, data.history, d), null, 2);
  switch (kind) {
    case "json": return download(`${t.id}.json`, "application/json", json);
    case "csv": return download(`${t.id}-history.csv`, "text/csv", historyCsv(data.history, d.fields));
    case "svg": return download(`${t.id}.svg`, "image/svg+xml", svg);
    case "png": return download(`${t.id}.png`, "image/png", await png(svg));
    case "copy": return navigator.clipboard.writeText(json);
  }
}

// Sites tracked (e.g. loaded from GitHub) that this browser must still allow
async function showAllow() {
  const r = await ask({ type: "missing" }).catch(() => null);
  const origins = r?.origins || [];
  $("allow").hidden = !origins.length;
  if (!origins.length) return;
  const names = origins.map((o) => o.replace(/^https?:\/\/(www\.)?|\/\*$/g, ""));
  $("allow-text").textContent = `To update ${names.join(", ")} on this computer too, allow Profile Sync to read ${origins.length === 1 ? "it" : "them"}.`;
  $("allow-btn").onclick = async () => {
    if (await chrome.permissions.request({ origins })) render();
  };
}

async function render() {
  showAllow();
  const trackers = await getTrackers();
  const { outputs } = await getSettings();
  await showHere(trackers);
  $("empty").hidden = trackers.length > 0;
  const list = $("list");
  list.replaceChildren();
  for (const t of trackers) {
    const data = await getData(t.id);
    const d = describe(t);
    const node = $("tracker").content.cloneNode(true);
    const el = (s) => node.querySelector(s);
    el(".title").textContent = data.latest?.title || d.title;
    el(".title").href = d.url;
    el(".site").textContent = d.site;
    const tiles = el(".tiles");
    for (const f of d.fields.slice(0, 6)) {
      const v = data.latest?.fields[f.key];
      if (v === undefined) continue;
      const tile = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = f.label;
      const value = document.createElement("b");
      value.textContent = format(v, f.kind);
      tile.append(label, value);
      tiles.append(tile);
    }
    // status: reading, then each output that's on
    const problems = [];
    if (data.status.read && !data.status.read.ok) problems.push(data.status.read.note);
    for (const name of ["github", "webhook", "discord"]) {
      const st = data.status[name];
      if (outputs[name].enabled && st && !st.ok) problems.push(`${name}: ${st.note}`);
    }
    el(".dot").className = `dot ${problems.length ? "bad" : data.latest ? "good" : ""}`;
    el(".state").textContent = problems.length
      ? problems.join(" · ")
      : data.status.read?.at ? `Checked ${ago(data.status.read.at)}${t.auto ? " · automatic" : ""}` : "Not read yet";
    el(".update").onclick = async (e) => {
      e.target.disabled = true;
      const onPage = tab && (t.kind === "custom" ? samePage(tab.url, t.url) : detect(tab.url)?.platform === t.platform);
      const r = await ask({ type: "sync", id: t.id, tabId: onPage ? tab.id : undefined });
      if (!r?.ok) e.target.closest(".tracker").querySelector(".state").textContent = r?.error || "Couldn't read.";
      else render();
      e.target.disabled = false;
    };
    const sel = el(".export");
    sel.disabled = !data.latest;
    sel.onchange = async () => {
      const kind = sel.value;
      sel.value = "";
      if (kind) await exportAs(kind, t, data, outputs.github.theme);
    };
    list.append(node);
  }
}

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  render();
})();
