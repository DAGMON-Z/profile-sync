// The extension's background part.
//
// Reading stats:
//  - When you click the icon, the popup asks this part to read the tab you're
//    on (allowed by "activeTab": only that tab, only after your click).
//  - With automatic updates on for a site, every open page of that site is
//    read when it loads and once a minute while it's in front (autosync.js
//    tells us), so new stats show up about a minute after you earn them.
//  - Built-in platforms with public data are also re-read in the background
//    every few minutes (Settings: 5, 15, 30 or 60), even with no tab open.
// Then the stats go to every output you turned on, only when they changed
// (or when the last send to that output failed).
//
// Settings follow you (see lib/cloud.js): what's tracked is saved to
// settings.json in your GitHub repo and loaded on your other computers.
// And when you're logged in on a supported site that has nothing tracked yet,
// your account there is tracked by itself (Settings: "Track my accounts").

import { PLATFORMS } from "./lib/platforms.js";
import { addToHistory, describe, fingerprint, makeStats, trackerId } from "./lib/stats.js";
import { toDiscord, toGitHub, toWebhook } from "./lib/outputs.js";
import { getData, getSettings, getTrackers, setData } from "./lib/settings.js";
import { FILE, fromCloud, toCloud, trackersFromStats } from "./lib/cloud.js";
import { cleanPath } from "./lib/outputs.js";
import * as github from "./lib/github.js";

const PAGE_GAP = 60 * 1000; // at most one read per tracker per minute (be gentle with the sites)

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
  // Fields marked "keep" are only known from some reads (e.g. Codeforces'
  // all-time solved count, from an open tab): keep the last value otherwise
  for (const f of describe(t).fields) {
    if (f.keep && result.fields && result.fields[f.key] === undefined && data.latest?.fields?.[f.key] !== undefined) {
      result.fields[f.key] = data.latest.fields[f.key];
    }
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
        const result = await send(cfg, data.latest, st.sent || null, { d: describe(t), history: data.history, all, ids: trackers.map((x) => x.id) });
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
  pushSoon();
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

// Register autosync.js on every site with automatic updates on, if allowed,
// and on allowed sites with nothing tracked yet (to notice your account there)
async function updateAuto() {
  const origins = new Set();
  const trackers = await getTrackers();
  for (const t of trackers) {
    if (t.auto && (await canAccess(t))) originsOf(t).forEach((o) => origins.add(o));
  }
  if ((await getSettings()).autoAccounts) {
    for (const [id, p] of Object.entries(PLATFORMS)) {
      if (!p.me || trackers.some((t) => t.kind === "builtin" && t.platform === id)) continue;
      if (await chrome.permissions.contains({ origins: p.origins })) p.origins.forEach((o) => origins.add(o));
    }
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

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "sync") {
    await pull().catch(() => {});
    await syncAllInBackground();
  }
  if (a.name === "push") await push().catch(() => {});
});

async function setAlarm() {
  const { checkEvery } = await getSettings();
  const old = await chrome.alarms.get("sync");
  if (old?.periodInMinutes !== checkEvery) await chrome.alarms.create("sync", { periodInMinutes: checkEvery, delayInMinutes: 1 });
}

async function setup() {
  await setAlarm();
  await updateAuto().catch(() => {});
  await pull().catch(() => {}); // also writes settings.json the first time
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
// A site was allowed (e.g. after loading settings on a new computer): start
// reading it right away
chrome.permissions.onAdded.addListener(async () => {
  await updateAuto();
  await syncAllInBackground();
});
chrome.permissions.onRemoved.addListener(() => updateAuto());

// Settings changed (an output turned on, a new repo...): send what's missing
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    deliver();
    setAlarm();
    updateAuto().catch(() => {});
    pushSoon();
  }
});

// ---------- settings on GitHub (lib/cloud.js) ----------
// chrome.storage "cloud" = { at, text }: the version last written or loaded,
// so nothing is written back when nothing changed.

async function cloudPlace(settings) {
  const g = settings.outputs.github;
  if (!g.enabled || !g.repo || !(await github.signedIn())) return null;
  return { repo: g.repo, branch: g.branch || "", path: `${cleanPath(g.folder, "profile-sync")}/${FILE}` };
}

const compare = (settings, trackers) => JSON.stringify(toCloud(settings, trackers, 0));

// Write a few seconds after the last change (alarms survive the background
// part going to sleep; 0.1 min is rounded up by the browser, that's fine)
function pushSoon() {
  chrome.alarms.create("push", { delayInMinutes: 0.1 });
}

async function push() {
  const place = await cloudPlace(await getSettings());
  if (!place) return;
  const remote = fromCloud(await github.readFile(place.repo, place.path, place.branch));
  let { cloud } = await chrome.storage.local.get("cloud");
  // Changed on another computer since we last synced (or this computer never
  // synced): take that version, keeping anything added here, so a fresh
  // computer never wipes your list
  if (remote && remote.updatedAt > (cloud?.at || 0)) {
    const local = await getTrackers();
    const extra = local.filter((t) => !remote.trackers.some((x) => x.id === t.id));
    await applyCloud(await getSettings(), { ...remote, trackers: [...remote.trackers, ...extra] }, place.repo);
    if (!extra.length) return;
    cloud = null; // write the combined list
  }
  const settings = await getSettings();
  const trackers = await getTrackers();
  const text = compare(settings, trackers);
  if (cloud?.text === text) return;
  const at = Date.now();
  const body = JSON.stringify(toCloud(settings, trackers, at), null, 2) + "\n";
  await github.writeFiles(place.repo, [{ path: place.path, content: body }], "Profile Sync: settings", place.branch);
  await chrome.storage.local.set({ cloud: { at, text } });
}

// Load the newer settings.json (written by another computer)
async function pull() {
  const settings = await getSettings();
  const place = await cloudPlace(settings);
  if (!place) return { ok: false };
  const { cloud } = await chrome.storage.local.get("cloud");
  // Something changed here that isn't on GitHub yet: push() combines both
  if (!cloud || cloud.text !== compare(settings, await getTrackers())) {
    await push();
    return { ok: true };
  }
  const remote = fromCloud(await github.readFile(place.repo, place.path, place.branch));
  if (!remote || remote.updatedAt <= cloud.at) return { ok: true, changed: false };
  await applyCloud(settings, remote, place.repo);
  return { ok: true, changed: true };
}

async function applyCloud(settings, remote, repo) {
  const next = {
    ...settings,
    ...(remote.checkEvery ? { checkEvery: remote.checkEvery } : {}),
    ...(remote.autoAccounts !== undefined ? { autoAccounts: remote.autoAccounts } : {}),
    outputs: { ...settings.outputs, github: { ...settings.outputs.github, ...remote.github, enabled: true, repo } },
  };
  await chrome.storage.local.set({
    settings: next,
    trackers: remote.trackers,
    cloud: { at: remote.updatedAt, text: compare(next, remote.trackers) },
  });
  await updateAuto().catch(() => {});
}

// After signing in on a new computer: find the repo with your settings
async function connect() {
  const settings = await getSettings();
  const folder = cleanPath(settings.outputs.github.folder, "profile-sync");
  let repos = await github.repos();
  const chosen = settings.outputs.github.repo;
  if (chosen && repos.includes(chosen)) repos = [chosen, ...repos.filter((r) => r !== chosen)];
  repos = repos.slice(0, 30);
  for (const repo of repos) {
    const remote = fromCloud(await github.readFile(repo, `${folder}/${FILE}`).catch(() => null));
    if (remote) {
      const local = await getTrackers();
      await applyCloud(settings, remote, repo);
      // anything already tracked on this computer is added to it
      const extra = local.filter((t) => !remote.trackers.some((x) => x.id === t.id));
      if (extra.length) await saveTrackers([...remote.trackers, ...extra]);
      return { ok: true, found: "settings", repo, count: remote.trackers.length + extra.length };
    }
  }
  // Made with an older version: no settings.json, but stats files are there
  for (const repo of repos) {
    const found = trackersFromStats(await github.readFile(repo, `${folder}/all.json`).catch(() => null));
    if (!found.length) continue;
    const local = await getTrackers();
    const list = [...local, ...found.filter((t) => !local.some((x) => x.id === t.id))];
    await chrome.storage.local.set({ settings: { ...settings, outputs: { ...settings.outputs, github: { ...settings.outputs.github, enabled: true, repo } } } });
    await saveTrackers(list);
    return { ok: true, found: "stats", repo, count: found.length };
  }
  if (repos.length === 1) {
    await chrome.storage.local.set({ settings: { ...settings, outputs: { ...settings.outputs, github: { ...settings.outputs.github, enabled: true, repo: repos[0] } } } });
    return { ok: true, found: "repo", repo: repos[0], count: 0 };
  }
  return { ok: true, found: "none", count: 0 };
}

// Sites tracked here that this browser isn't allowed to read yet
async function missingSites() {
  const out = new Set();
  for (const t of await getTrackers()) {
    if (!t.auto) continue;
    for (const o of originsOf(t)) if (!(await chrome.permissions.contains({ origins: [o] }))) out.add(o);
  }
  return [...out];
}

// ---------- your account on a site ----------

const lastLook = {}; // platform -> time, so a site is asked at most every 10 minutes
const NAME = /^[\w.-]{1,40}$/;

async function noticeAccount(tab) {
  if (!(await getSettings()).autoAccounts) return;
  const platform = Object.keys(PLATFORMS).find((id) => PLATFORMS[id].origins.some((o) => tab.url.startsWith(o.slice(0, -1))));
  const p = PLATFORMS[platform];
  if (!p?.me) return;
  if ((await getTrackers()).some((t) => t.kind === "builtin" && t.platform === platform)) return;
  if (Date.now() - (lastLook[platform] || 0) < 10 * 60 * 1000) return;
  lastLook[platform] = Date.now();
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: p.me }).catch(() => []);
  const user = res?.result;
  if (typeof user !== "string" || !NAME.test(user)) return;
  const t = await addTracker({ kind: "builtin", platform, username: user, auto: true });
  await syncTracker(t, { tabId: tab.id, force: true });
}

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
  async connect() {
    return connect();
  },
  async pull() {
    return pull();
  },
  async missing() {
    return { ok: true, origins: await missingSites() };
  },
  async pick({ tabId }) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] });
    return { ok: true };
  },
};

const FROM_PAGES = {
  // autosync.js: a page of a site with automatic updates is open
  async "page-open"(msg, tab) {
    await noticeAccount(tab).catch(() => {});
    for (const t of await getTrackers()) {
      if (!t.auto) continue;
      const match = t.kind === "custom" ? samePage(tab.url, t.url) : originsOf(t).some((o) => tab.url.startsWith(o.slice(0, -1)));
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
