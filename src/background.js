// The extension's background part.
//
// Reading stats:
//  - When you click the icon, the popup asks this part to read the tab you're
//    on (allowed by "activeTab": only that tab, only after your click).
//  - Built-in platforms with public data are re-read every 30 minutes, if you
//    allowed automatic updates for that site.
//  - TryHackMe and picked pages are re-read while you have them open, if you
//    allowed automatic updates for that site (autosync.js tells us).
// Then the stats go to every output you turned on, only when they changed
// (or when the last send to that output failed).

import { PLATFORMS } from "./lib/platforms.js";
import { addToHistory, describe, fingerprint, makeStats, trackerId } from "./lib/stats.js";
import { toDiscord, toGitHub, toWebhook } from "./lib/outputs.js";
import { getData, getSettings, getTrackers, setData } from "./lib/settings.js";

const EVERY_MIN = 30; // background updates
const PAGE_GAP = 3 * 60 * 1000; // at most one read per tracker every 3 minutes from open pages

// ---------- reading ----------

// Runs inside a picked page: reads the numbers at the saved spots.
// Must be self-contained (it is copied into the page).
async function readPicked(fields) {
  const find = (sel) => {
    try {
      return document.querySelector(sel);
    } catch {
      return null;
    }
  };
  // pages that build themselves with JavaScript may need a moment
  const empty = (f) => !(find(f.selector)?.textContent || "").trim();
  for (let i = 0; i < 20 && fields.some(empty); i++) {
    await new Promise((ok) => setTimeout(ok, 250));
  }
  const out = {};
  let found = 0;
  for (const f of fields) {
    const el = find(f.selector);
    if (!el || empty(f)) continue;
    found++;
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const m = text.replace(/(\d)[,\s'](?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/);
    out[f.key] = f.kind === "text" || !m ? text.slice(0, 40) : Number(m[0]);
  }
  if (!found) return { ok: false, error: "The picked numbers weren't found on this page (did it change?)" };
  return { ok: true, fields: out };
}

async function readInTab(tabId, t) {
  const [res] =
    t.kind === "builtin"
      ? await chrome.scripting.executeScript({ target: { tabId }, func: PLATFORMS[t.platform].read, args: [t.username, true] })
      : await chrome.scripting.executeScript({ target: { tabId }, func: readPicked, args: [t.fields] });
  return res?.result || { ok: false, error: "Couldn't read the page" };
}

async function readAnywhere(t) {
  try {
    return await PLATFORMS[t.platform].read(t.username, false);
  } catch (e) {
    return { ok: false, error: `Couldn't reach ${PLATFORMS[t.platform].name}` };
  }
}

export function originsOf(t) {
  if (t.kind === "builtin") return PLATFORMS[t.platform].origins;
  const u = new URL(t.url);
  return [`${u.protocol}//${u.hostname}/*`];
}

const canAccess = (t) => chrome.permissions.contains({ origins: originsOf(t) });

// Save a reader's answer, then send it to the outputs
async function record(t, result) {
  const data = await getData(t.id);
  const now = Date.now();
  if (!result.ok) {
    data.status.read = { ok: false, at: now, note: result.error };
    await setData(t.id, data);
    return { ok: false, error: result.error };
  }
  const stats = makeStats(t, result);
  if (!Object.keys(stats.fields).length) {
    data.status.read = { ok: false, at: now, note: "No numbers found" };
    await setData(t.id, data);
    return { ok: false, error: "No numbers found" };
  }
  const changed = fingerprint(stats) !== fingerprint(data.latest);
  // keep the time of the last change, so cards don't change for nothing
  if (changed) data.latest = stats;
  data.history = addToHistory(data.history, data.latest);
  data.status.read = { ok: true, at: now, note: changed ? "new stats" : "no change" };
  await setData(t.id, data);
  await deliver(t.id);
  return { ok: true, changed };
}

async function syncTracker(t, { tabId = null, force = false } = {}) {
  const data = await getData(t.id);
  if (!force && data.status.read?.at && Date.now() - data.status.read.at < PAGE_GAP) return { ok: true, skipped: true };
  if (tabId !== null) return record(t, await readInTab(tabId, t));
  if (t.kind === "builtin" && PLATFORMS[t.platform].anywhere && (await canAccess(t))) return record(t, await readAnywhere(t));
  // needs an open tab of the site
  if (await canAccess(t)) {
    const tabs = await chrome.tabs.query({ url: originsOf(t) });
    const tab = t.kind === "custom" ? tabs.find((x) => samePage(x.url, t.url)) : tabs[0];
    if (tab) return record(t, await readInTab(tab.id, t));
  }
  return { ok: false, error: `Open ${t.kind === "builtin" ? PLATFORMS[t.platform].name : "the page"} and click the extension's icon there` };
}

export function samePage(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

// ---------- outputs ----------

const SENDERS = { github: toGitHub, webhook: toWebhook, discord: toDiscord };

// One delivery round at a time
let queue = Promise.resolve();
function deliver(id = null, opts = {}) {
  queue = queue.then(() => deliverNow(id, opts)).catch(() => {});
  return queue;
}

async function deliverNow(onlyId, { only = null, force = false }) {
  const settings = await getSettings();
  const trackers = await getTrackers();
  const all = [];
  for (const t of trackers) {
    const d = await getData(t.id);
    if (d.latest) all.push(d.latest);
  }
  for (const t of trackers) {
    if (onlyId && t.id !== onlyId) continue;
    const data = await getData(t.id);
    if (!data.latest) continue;
    const print = fingerprint(data.latest);
    for (const [name, send] of Object.entries(SENDERS)) {
      if (only && name !== only) continue;
      const cfg = settings.outputs[name];
      if (!cfg.enabled && !only) continue;
      const st = data.status[name] || {};
      if (!force && st.ok && st.print === print) continue; // already sent these stats
      try {
        const result = await send(cfg, data.latest, st.sent || null, { d: describe(t), history: data.history, all });
        data.status[name] = { ok: true, at: Date.now(), print, sent: data.latest, note: typeof result === "string" ? result : "sent" };
      } catch (e) {
        data.status[name] = { ...st, ok: false, at: Date.now(), note: String(e.message || e).slice(0, 200) };
      }
      await setData(t.id, data);
    }
  }
}

// ---------- trackers and automatic updates ----------

async function saveTrackers(list) {
  await chrome.storage.local.set({ trackers: list });
  await updateAuto();
}

async function addTracker(t) {
  t.id = trackerId(t);
  const list = (await getTrackers()).filter((x) => x.id !== t.id);
  list.push(t);
  await saveTrackers(list);
  return t;
}

async function removeTracker(id) {
  await saveTrackers((await getTrackers()).filter((x) => x.id !== id));
  await chrome.storage.local.remove(`t:${id}`);
}

// Register autosync.js on the sites that need an open tab, if allowed
async function updateAuto() {
  const origins = new Set();
  for (const t of await getTrackers()) {
    const needsTab = t.kind === "custom" || !PLATFORMS[t.platform].anywhere;
    if (t.auto && needsTab && (await canAccess(t))) originsOf(t).forEach((o) => origins.add(o));
  }
  const old = await chrome.scripting.getRegisteredContentScripts({ ids: ["autosync"] });
  if (old.length) await chrome.scripting.unregisterContentScripts({ ids: ["autosync"] });
  if (origins.size) {
    await chrome.scripting.registerContentScripts([
      { id: "autosync", matches: [...origins], js: ["autosync.js"], runAt: "document_idle", persistAcrossSessions: true },
    ]);
  }
}

async function syncAllInBackground() {
  for (const t of await getTrackers()) {
    if (t.auto && t.kind === "builtin" && PLATFORMS[t.platform].anywhere) await syncTracker(t).catch(() => {});
  }
}

chrome.alarms.onAlarm.addListener((a) => a.name === "sync" && syncAllInBackground());

async function setup() {
  await chrome.alarms.create("sync", { periodInMinutes: EVERY_MIN, delayInMinutes: 1 });
  await updateAuto().catch(() => {});
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.permissions.onAdded.addListener(() => updateAuto());
chrome.permissions.onRemoved.addListener(() => updateAuto());

// Settings changed (an output turned on, a new repo...): send what's missing
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) deliver();
});

// ---------- messages ----------

const HANDLERS = {
  // from the popup / settings page
  async track({ tracker, tabId }) {
    const t = await addTracker({ ...tracker });
    const r = await syncTracker(t, { tabId: tabId ?? null, force: true });
    return { ...r, id: t.id };
  },
  async sync({ id, tabId }) {
    const t = (await getTrackers()).find((x) => x.id === id);
    if (!t) return { ok: false, error: "Unknown tracker" };
    return syncTracker(t, { tabId: tabId ?? null, force: true });
  },
  async setAuto({ id, auto }) {
    const list = await getTrackers();
    const t = list.find((x) => x.id === id);
    if (t) t.auto = Boolean(auto);
    await saveTrackers(list);
    return { ok: true };
  },
  async remove({ id }) {
    await removeTracker(id);
    return { ok: true };
  },
  async deliver({ id, only, force }) {
    await deliver(id || null, { only: only || null, force: Boolean(force) });
    return { ok: true };
  },
  async pick({ tabId }) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] });
    return { ok: true };
  },
};

const FROM_PAGES = {
  // autosync.js: a page of a site with automatic updates is open
  async "page-open"(msg, tab) {
    for (const t of await getTrackers()) {
      if (!t.auto) continue;
      const match = t.kind === "custom" ? samePage(tab.url, t.url) : !PLATFORMS[t.platform].anywhere && originsOf(t).some((o) => tab.url.startsWith(o.slice(0, -1)));
      if (match) await syncTracker(t, { tabId: tab.id });
    }
    return { ok: true };
  },
  // picker.js: the user picked numbers on this page
  async picked(msg, tab) {
    const u = new URL(tab.url);
    const fields = (msg.fields || []).slice(0, 12).map((f, i) => ({
      key: `f${i + 1}`,
      label: String(f.label || `Value ${i + 1}`).slice(0, 40),
      selector: String(f.selector).slice(0, 500),
      kind: f.kind === "text" ? "text" : "number",
    }));
    if (!fields.length) return { ok: false };
    const t = await addTracker({
      kind: "custom",
      name: String(msg.name || u.hostname).slice(0, 40),
      url: u.origin + u.pathname,
      fields,
      auto: false,
    });
    return syncTracker(t, { tabId: tab.id, force: true });
  },
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  // Our own pages (popup, settings) have the extension's address; scripts we
  // added to websites have the website's address.
  const fromExtension = Boolean(sender.url?.startsWith(chrome.runtime.getURL("")));
  const fromPage = !fromExtension && Boolean(sender.tab);
  const run = fromExtension ? HANDLERS[msg.type] : fromPage ? FROM_PAGES[msg.type] : null;
  if (!run) return;
  Promise.resolve(fromExtension ? run(msg) : run(msg, sender.tab)).then(reply, (e) => reply({ ok: false, error: String(e.message || e) }));
  return true; // the answer comes later
});
