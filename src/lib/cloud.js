// Settings that follow you to every computer, through your own GitHub repo.
//
// What's tracked and how GitHub is set up is saved as <folder>/settings.json
// in the repo you picked. Another computer only needs the extension and one
// "Sign in with GitHub": it finds that file and loads everything.
//
// Webhook and Discord addresses are never written there (they work like
// passwords, and the repo may be public): set those on each computer.
// No browser APIs here, so it can be tested with plain Node.

import { PLATFORMS, detect } from "./platforms.js";
import { trackerId } from "./stats.js";

export const FILE = "settings.json";
const NAME = /^[\w.-]{1,40}$/;
const THEMES = ["dark", "light", "hacker"];
const EVERY = [5, 15, 30, 60];

function cleanTracker(t) {
  if (!t || typeof t !== "object") return null;
  if (t.kind === "builtin") {
    if (!PLATFORMS[t.platform] || !NAME.test(String(t.username || ""))) return null;
    const out = { kind: "builtin", platform: t.platform, username: t.username, auto: Boolean(t.auto) };
    return { ...out, id: trackerId(out) };
  }
  if (t.kind === "custom") {
    let u;
    try {
      u = new URL(t.url);
    } catch {
      return null;
    }
    if (u.protocol !== "https:") return null;
    const fields = (Array.isArray(t.fields) ? t.fields : []).slice(0, 12).map((f, i) => ({
      key: `f${i + 1}`,
      label: String(f?.label || `Value ${i + 1}`).slice(0, 40),
      selector: String(f?.selector || "").slice(0, 500),
      kind: f?.kind === "text" ? "text" : "number",
    })).filter((f) => f.selector);
    if (!fields.length) return null;
    const out = { kind: "custom", name: String(t.name || u.hostname).slice(0, 40), url: u.origin + u.pathname, fields, auto: Boolean(t.auto) };
    return { ...out, id: trackerId(out) };
  }
  return null;
}

// What goes into settings.json
export function toCloud(settings, trackers, updatedAt) {
  const g = settings.outputs.github;
  return {
    app: "profile-sync",
    version: 1,
    updatedAt,
    checkEvery: settings.checkEvery,
    autoAccounts: settings.autoAccounts,
    github: { branch: g.branch, folder: g.folder, json: g.json, card: g.card, theme: g.theme, history: g.history },
    trackers: trackers.map(cleanTracker).filter(Boolean).map(({ id, ...t }) => t),
  };
}

// Read settings.json back, keeping only what makes sense
export function fromCloud(text) {
  let j;
  try {
    j = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return null;
  }
  if (!j || j.app !== "profile-sync" || !Array.isArray(j.trackers)) return null;
  const g = j.github || {};
  const seen = new Set();
  const trackers = j.trackers.map(cleanTracker).filter((t) => t && !seen.has(t.id) && seen.add(t.id));
  return {
    updatedAt: Number(j.updatedAt) || 0,
    checkEvery: EVERY.includes(j.checkEvery) ? j.checkEvery : undefined,
    autoAccounts: typeof j.autoAccounts === "boolean" ? j.autoAccounts : undefined,
    github: {
      ...(typeof g.branch === "string" ? { branch: g.branch.slice(0, 100) } : {}),
      ...(typeof g.folder === "string" && g.folder ? { folder: g.folder.slice(0, 100) } : {}),
      ...(typeof g.json === "boolean" ? { json: g.json } : {}),
      ...(typeof g.card === "boolean" ? { card: g.card } : {}),
      ...(THEMES.includes(g.theme) ? { theme: g.theme } : {}),
      ...(typeof g.history === "boolean" ? { history: g.history } : {}),
    },
    trackers,
  };
}

// No settings.json yet (written by an older version): rebuild the built-in
// trackers from the stats files already in the repo (all.json)
export function trackersFromStats(text) {
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    return [];
  }
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const found = s && typeof s.url === "string" ? detect(s.url) : null;
    if (!found?.username) continue;
    const t = cleanTracker({ kind: "builtin", platform: found.platform, username: found.username, auto: true });
    if (t && !out.some((x) => x.id === t.id)) out.push(t);
  }
  return out;
}
