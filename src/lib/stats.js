// Stats for any tracker (a built-in platform profile, or numbers picked from
// a page): describing a tracker, comparing stats, keeping a daily history and
// exporting. No browser APIs here, so it can be tested with plain Node.

import { PLATFORMS, cleanFields } from "./platforms.js";

// A tracker is one thing being followed:
//   { id, kind: "builtin", platform: "leetcode", username, auto }
//   { id, kind: "custom", name, url, fields: [{ key, label, selector, kind }], auto }

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
}

export function trackerId(t) {
  return t.kind === "builtin" ? `${t.platform}-${slug(t.username)}` : `site-${slug(t.name)}`;
}

// Everything the rest of the extension needs to know about a tracker.
// "hide": the numbers you chose not to show (they're still read and saved
// in the stats files; only the card, the popup and Discord leave them out).
export function describe(t) {
  const hide = Array.isArray(t.hide) ? t.hide : [];
  if (t.kind === "builtin") {
    const p = PLATFORMS[t.platform];
    return {
      title: t.username,
      site: p.name,
      url: p.profile(t.username),
      fields: p.fields,
      headline: p.headline,
      hide,
    };
  }
  return {
    title: t.name,
    site: hostOf(t.url),
    url: t.url,
    fields: t.fields.map(({ key, label, kind }) => ({ key, label, kind: kind || "number" })),
    headline: null,
    hide,
  };
}

// The same description with only the numbers you chose to show
export function shown(d) {
  const hide = d.hide || [];
  if (!hide.length) return d;
  return {
    ...d,
    fields: d.fields.filter((f) => !hide.includes(f.key)),
    headline: d.headline && !hide.includes(d.headline.key) ? d.headline : null,
  };
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Build the saved stats from a reader's answer
export function makeStats(t, result, now = new Date()) {
  const d = describe(t);
  return {
    id: t.id,
    site: d.site,
    title: t.kind === "builtin" ? result.username || t.username : d.title,
    url: d.url,
    fields: cleanFields(result.fields, d.fields),
    syncedAt: now.toISOString(),
  };
}

// "Top 5%" stays as it is, a number becomes "#1,234"
export function format(value, kind) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "number") return (kind === "rank" ? "#" : "") + value.toLocaleString("en-US");
  if (kind === "text" && /^[a-z]/.test(value)) return value[0].toUpperCase() + value.slice(1);
  return String(value);
}

// A fingerprint of the numbers (without the time), to tell if anything changed
export function fingerprint(stats) {
  if (!stats) return "";
  return JSON.stringify(Object.entries(stats.fields || {}).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// What changed: [{ key, label, kind, from, to }]
export function changes(before, after, fields) {
  if (!before || !after) return [];
  const out = [];
  for (const f of fields) {
    const from = before.fields?.[f.key];
    const to = after.fields?.[f.key];
    if (to !== undefined && from !== to) out.push({ key: f.key, label: f.label, kind: f.kind, from: from ?? null, to });
  }
  return out;
}

// Local date as YYYY-MM-DD
export function day(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// One entry per day (the latest of that day), at most `keep` days
export function addToHistory(history, stats, date = new Date(), keep = 400) {
  const entry = { date: day(date), ...stats.fields };
  const list = (history || []).filter((e) => e.date !== entry.date);
  list.push(entry);
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  return list.slice(-keep);
}

// History as CSV (for spreadsheets)
export function historyCsv(history, fields) {
  const cols = ["date", ...fields.map((f) => f.key)];
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...(history || []).map((e) => cols.map((c) => cell(e[c])).join(","))].join("\n") + "\n";
}

// The JSON written to GitHub, sent to webhooks and exported. "fields" gives
// each number's label and order, so tools reading the file can name them
// (important for picked sites, whose keys are just f1, f2...).
export function exportJson(stats, history, d = null) {
  return {
    id: stats.id,
    site: stats.site,
    title: stats.title,
    url: stats.url,
    stats: stats.fields,
    ...(d ? { fields: d.fields.map(({ key, label, kind }) => ({ key, label, kind })) } : {}),
    syncedAt: stats.syncedAt,
    ...(history ? { history } : {}),
  };
}
