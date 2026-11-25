// Sending stats to the places the user turned on: GitHub, a webhook, Discord.
// Each output gets the same clean stats; nothing else from the sites is sent.

import { changes, exportJson, format } from "./stats.js";
import { renderCard } from "./card.js";
import * as github from "./github.js";

// ---------- address checks (also used by the settings page) ----------

// Webhooks must be https, except on this computer (for local tools like n8n)
export function webhookUrlProblem(text) {
  let u;
  try {
    u = new URL(text);
  } catch {
    return "That isn't a web address.";
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    return "Use an https:// address (http:// only works for localhost).";
  }
  if (u.username || u.password) return "Don't put a password in the address.";
  return "";
}

export function discordUrlProblem(text) {
  try {
    const u = new URL(text);
    const hosts = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];
    if (u.protocol === "https:" && hosts.includes(u.hostname) && /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname)) {
      return "";
    }
  } catch {}
  return "Paste a Discord webhook address (Channel settings → Integrations → Webhooks).";
}

// The permission pattern for one address, e.g. "https://example.com/*"
export function originOf(text) {
  const u = new URL(text);
  return `${u.protocol}//${u.hostname}/*`;
}

// ---------- outputs ----------
// Each gets (cfg, stats, before, info), where info = { d: describe(tracker), history, all }

async function send(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`The address answered ${res.status}`);
}

async function hmac(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function toWebhook(cfg, stats, before, { d }) {
  if (webhookUrlProblem(cfg.url)) throw new Error("The webhook address isn't valid");
  const body = JSON.stringify({ event: "stats", ...exportJson(stats), changes: changes(before, stats, d.fields) });
  const headers = { "x-profile-sync-event": "stats" };
  if (cfg.secret) headers["x-profile-sync-signature"] = `sha256=${await hmac(cfg.secret, body)}`;
  await send(cfg.url, body, headers);
}

export function discordMessage(stats, before, d) {
  const diff = changes(before, stats, d.fields);
  const lines = diff.length
    ? diff.map((c) => `**${c.label}:** ${format(c.from, c.kind)} → ${format(c.to, c.kind)}`)
    : d.fields.filter((f) => stats.fields[f.key] !== undefined).map((f) => `**${f.label}:** ${format(stats.fields[f.key], f.kind)}`);
  const head = d.headline && diff.find((c) => c.key === d.headline.key);
  return {
    username: "Profile Sync",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: (head
          ? `${stats.title}: ${head.label} ${format(head.from, head.kind)} → ${format(head.to, head.kind)} on ${stats.site}!`
          : diff.length ? `${stats.title} made progress on ${stats.site}` : `Now tracking ${stats.title} on ${stats.site}`).slice(0, 256),
        url: /^https:\/\//.test(stats.url) ? stats.url : undefined,
        description: lines.join("\n").slice(0, 4000),
        color: head ? 0x9ece6a : 0x7aa2f7,
        timestamp: stats.syncedAt,
        footer: { text: "Profile Sync" },
      },
    ],
  };
}

export async function toDiscord(cfg, stats, before, { d }) {
  if (discordUrlProblem(cfg.url)) throw new Error("The Discord address isn't valid");
  await send(cfg.url, JSON.stringify(discordMessage(stats, before, d)));
}

// Clean a folder typed by the user: "profile-sync", no leading slash or ".."
export function cleanPath(text, fallback) {
  const p = String(text || "").trim().replace(/^\/+|\/+$/g, "");
  if (!p || p.split("/").some((part) => part === ".." || part === "." || part === "")) return fallback;
  return p;
}

// GitHub: <folder>/<id>.json, <folder>/<id>.svg and <folder>/all.json, in one commit
export async function toGitHub(cfg, stats, before, { d, history, all }) {
  if (!cfg.repo) throw new Error("Pick a repo in the settings");
  const dir = cleanPath(cfg.folder, "profile-sync");
  const files = [];
  if (cfg.json !== false) {
    files.push({ path: `${dir}/${stats.id}.json`, content: JSON.stringify(exportJson(stats, cfg.history ? history : undefined), null, 2) + "\n" });
    files.push({ path: `${dir}/all.json`, content: JSON.stringify(all.map((s) => exportJson(s)), null, 2) + "\n" });
  }
  if (cfg.card !== false) {
    files.push({ path: `${dir}/${stats.id}.svg`, content: renderCard(stats, d, { theme: cfg.theme }) });
  }
  if (!files.length) return "nothing to write";
  const first = d.fields.find((f) => stats.fields[f.key] !== undefined);
  const message = `${stats.site}: ${stats.title}${first ? `, ${first.label.toLowerCase()} ${format(stats.fields[first.key], first.kind)}` : ""}`;
  try {
    return await github.writeFiles(cfg.repo, files, message, cfg.branch || "");
  } catch (e) {
    // Someone pushed at the same moment: try once more on top of it
    if (e.status === 422) return github.writeFiles(cfg.repo, files, message, cfg.branch || "");
    throw e;
  }
}
