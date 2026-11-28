// The settings page: tracked profiles and outputs.

import { PLATFORMS } from "./lib/platforms.js";
import { describe, format, shown } from "./lib/stats.js";
import { renderCard } from "./lib/card.js";
import { discordUrlProblem, originOf, webhookUrlProblem } from "./lib/outputs.js";
import { getData, getSettings, getTrackers } from "./lib/settings.js";
import * as github from "./lib/github.js";

const $ = (id) => document.getElementById(id);
const ask = (msg) => chrome.runtime.sendMessage(msg);
const DISCORD_ORIGINS = ["https://discord.com/*", "https://discordapp.com/*", "https://ptb.discord.com/*", "https://canary.discord.com/*"];
const SAMPLE = {
  stats: { id: "sample", site: "TryHackMe", title: "you", fields: { level: 7, rank: "Top 5%", rooms: 42, points: 6120, badges: 9, streak: 12, league: "gold" } },
  d: describe({ kind: "builtin", platform: "tryhackme", username: "you" }),
};

let settings;

async function store(change) {
  settings = { ...settings, ...change, outputs: { ...settings.outputs, ...(change.outputs || {}) } };
  await chrome.storage.local.set({ settings });
}

const originsOf = (t) => (t.kind === "builtin" ? PLATFORMS[t.platform].origins : [`${new URL(t.url).protocol}//${new URL(t.url).hostname}/*`]);

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

function note(el, text, kind = "") {
  el.textContent = text;
  el.className = `status ${kind}`;
}

// ---------- tracked ----------

async function showTrackers() {
  const ul = $("trackers");
  ul.replaceChildren();
  const trackers = await getTrackers();
  if (!trackers.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "Nothing tracked yet.";
    ul.append(li);
  }
  for (const t of trackers) {
    const d = describe(t);
    const data = await getData(t.id);
    const li = document.createElement("li");
    const info = document.createElement("div");
    const name = document.createElement("a");
    name.href = d.url;
    name.target = "_blank";
    name.rel = "noopener";
    name.textContent = `${data.latest?.title || d.title}`;
    const meta = document.createElement("span");
    meta.className = "muted small";
    const first = shown(d).fields.find((f) => data.latest?.fields[f.key] !== undefined);
    const read = data.status.read;
    meta.textContent = ` · ${d.site}${first ? ` · ${first.label} ${format(data.latest.fields[first.key], first.kind)}` : ""}${read ? ` · ${read.ok ? `checked ${ago(read.at)}` : read.note}` : ""}`;
    info.append(name, meta);

    const auto = document.createElement("label");
    auto.className = "check small";
    const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: Boolean(t.auto) });
    const allowed = await chrome.permissions.contains({ origins: originsOf(t) });
    if (t.auto && !allowed) auto.title = "Not allowed yet: tick again to allow";
    box.checked = Boolean(t.auto && allowed);
    box.onchange = async () => {
      if (box.checked && !(await chrome.permissions.request({ origins: originsOf(t) }))) box.checked = false;
      await ask({ type: "setAuto", id: t.id, auto: box.checked });
      showTrackers();
    };
    auto.append(box, " Automatic");

    const remove = Object.assign(document.createElement("button"), { textContent: "Remove", className: "link" });
    remove.onclick = async () => {
      if (!confirm(`Stop tracking ${d.title} on ${d.site}? Its saved history is deleted. Files already on GitHub stay.`)) return;
      await ask({ type: "remove", id: t.id });
      showTrackers();
    };
    // Which numbers to show (card, popup, Discord)
    const pickNums = document.createElement("details");
    pickNums.className = "nums";
    const sum = document.createElement("summary");
    const hidden = d.hide.filter((k) => d.fields.some((f) => f.key === k)).length;
    sum.textContent = hidden ? `Numbers: ${d.fields.length - hidden} of ${d.fields.length} shown` : "Numbers: all shown";
    pickNums.append(sum);
    for (const f of d.fields) {
      const lab = document.createElement("label");
      lab.className = "check small";
      const cb = Object.assign(document.createElement("input"), { type: "checkbox", checked: !d.hide.includes(f.key) });
      cb.onchange = async () => {
        const hide = [...pickNums.querySelectorAll("input")].map((x, i) => (!x.checked ? d.fields[i].key : null)).filter(Boolean);
        await ask({ type: "setHide", id: t.id, hide });
        sum.textContent = hide.length ? `Numbers: ${d.fields.length - hide.length} of ${d.fields.length} shown` : "Numbers: all shown";
        preview();
      };
      lab.append(cb, ` ${f.label}`);
      pickNums.append(lab);
    }
    const hint = document.createElement("p");
    hint.className = "muted small";
    hint.textContent = "Hidden numbers aren't shown on the card, in this window or on Discord. They're still saved in the stats files.";
    pickNums.append(hint);
    li.append(info, auto, remove, pickNums);
    ul.append(li);
  }
}

function fillPlatforms() {
  for (const [id, p] of Object.entries(PLATFORMS)) $("add-platform").add(new Option(p.name, id));
}

$("add").addEventListener("click", async () => {
  const platform = $("add-platform").value;
  const username = $("add-username").value.trim();
  const out = $("add-note");
  if (!/^[\w.-]{1,40}$/.test(username)) return (out.textContent = "Usernames have letters, numbers, dots, dashes or underscores.");
  const p = PLATFORMS[platform];
  // automatic updates need access to the site: ask now, while the click counts
  const allowed = await chrome.permissions.request({ origins: p.origins });
  const r = await ask({ type: "track", tracker: { kind: "builtin", platform, username, auto: allowed } });
  out.textContent = r?.ok
    ? `Added ${username} on ${p.name}.`
    : allowed && p.anywhere
      ? `Added, but: ${r?.error}`
      : `Added. Open your ${p.name} profile and click the extension's icon to read it${p.anywhere ? " (or allow automatic updates)" : ""}.`;
  $("add-username").value = "";
  showTrackers();
});

$("check-every").addEventListener("change", () => store({ checkEvery: Number($("check-every").value) }));
$("auto-accounts").addEventListener("change", () => store({ autoAccounts: $("auto-accounts").checked }));

// Sites this browser still has to allow (e.g. settings loaded from GitHub)
async function showAllow() {
  const r = await ask({ type: "missing" }).catch(() => null);
  const origins = r?.origins || [];
  $("allow").hidden = !origins.length;
  if (!origins.length) return;
  const names = origins.map((o) => o.replace(/^https?:\/\/(www\.)?|\/\*$/g, ""));
  $("allow-text").textContent = `Allow Profile Sync to read ${names.join(", ")} in this browser, so they update automatically here too.`;
  $("allow-btn").onclick = async () => {
    if (await chrome.permissions.request({ origins })) showAllow(), showTrackers();
  };
}

// ---------- GitHub ----------

async function showGitHub() {
  const ok = github.configured();
  $("github-unconfigured").hidden = ok;
  const auth = ok ? await github.signedIn() : null;
  $("github-out").hidden = !ok || Boolean(auth);
  $("github-in").hidden = !auth;
  if (!auth) return;
  $("github-login").textContent = auth.login;
  $("github-install").href = github.installUrl();
  await loadRepos();
}

async function loadRepos() {
  const select = $("github-repo");
  const chosen = settings.outputs.github.repo;
  select.replaceChildren(new Option("Loading…", ""));
  try {
    const list = await github.repos();
    select.replaceChildren(new Option(list.length ? "Choose a repo" : "No repos yet: give access first (link below)", ""));
    for (const r of list) select.add(new Option(r, r, false, r === chosen));
    if (chosen && !list.includes(chosen)) select.add(new Option(`${chosen} (no access)`, chosen, false, true));
  } catch (e) {
    select.replaceChildren(new Option(`Couldn't load: ${e.message}`, chosen || ""));
  }
}

$("github-signin").addEventListener("click", async () => {
  if (!(await chrome.permissions.request({ origins: github.ORIGINS }))) return;
  const btn = $("github-signin");
  btn.disabled = true;
  try {
    const code = await github.startSignIn();
    $("github-user-code").textContent = code.user_code;
    $("github-code").hidden = false;
    chrome.tabs.create({ url: code.verification_uri });
    await github.finishSignIn(code);
    $("github-code").hidden = true;
    // Look for settings saved from another computer
    note($("github-status"), "Looking for your settings on GitHub…");
    const r = await ask({ type: "connect" }).catch((e) => ({ ok: false, error: e.message }));
    const text = !r?.ok
      ? `Signed in. Couldn't look for saved settings: ${r?.error || "unknown error"}`
      : r.found === "settings" || r.found === "stats"
        ? `✓ Loaded your settings from ${r.repo}: ${r.count} tracked profile${r.count === 1 ? "" : "s"}.`
        : r.found === "repo"
          ? `✓ Signed in. Stats will go to ${r.repo}.`
          : "✓ Signed in. Choose the repo for your stats below.";
    sessionStorage.setItem("connected", text);
    location.reload(); // show the loaded settings
  } catch (e) {
    $("github-code").hidden = true;
    note($("github-status"), `✗ ${e.message}`, "bad");
  } finally {
    btn.disabled = false;
  }
});
$("github-copy").addEventListener("click", () => navigator.clipboard.writeText($("github-user-code").textContent));
$("github-signout").addEventListener("click", async () => {
  await github.signOut();
  await showGitHub();
});
$("github-refresh").addEventListener("click", loadRepos);

function readGitHub() {
  return {
    ...settings.outputs.github,
    enabled: $("github-enabled").checked,
    repo: $("github-repo").value || settings.outputs.github.repo,
    branch: $("github-branch").value.trim(),
    folder: $("github-folder").value.trim() || "profile-sync",
    json: $("github-json").checked,
    card: $("github-card").checked,
    theme: $("github-theme").value,
    history: $("github-history").checked,
  };
}

async function preview() {
  let { stats, d } = SAMPLE;
  for (const t of await getTrackers()) {
    const data = await getData(t.id);
    if (data.latest) {
      stats = data.latest;
      d = describe(t);
      break;
    }
  }
  const img = new Image();
  img.alt = "Card preview";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderCard(stats, d, { theme: $("github-theme").value }))}`;
  $("card-preview").replaceChildren(img);
}
$("github-theme").addEventListener("change", preview);

async function saveGitHub(send) {
  const cfg = readGitHub();
  const needed = cfg.enabled || send;
  const allowed = needed ? chrome.permissions.request({ origins: github.ORIGINS }) : Promise.resolve(true);
  if (!(await allowed)) return note($("github-status"), "✗ GitHub access wasn't allowed", "bad");
  if (needed && !cfg.repo) return note($("github-status"), "✗ Choose a repo first", "bad");
  await store({ outputs: { github: cfg } });
  if (!send) return note($("github-status"), "✓ Saved", "good");
  note($("github-status"), "Sending…");
  await ask({ type: "deliver", only: "github", force: true });
  showStatus();
}
$("github-save").addEventListener("click", () => saveGitHub(false));
$("github-test").addEventListener("click", () => saveGitHub(true));

// ---------- webhook and Discord ----------

function hook(name, { problem, origins }) {
  const save = async (send) => {
    const url = $(`${name}-url`).value.trim();
    const enabled = $(`${name}-enabled`).checked;
    const bad = url ? problem(url) : enabled || send ? "Enter an address first." : "";
    if (bad) return note($(`${name}-status`), `✗ ${bad}`, "bad");
    const allowed = url && (enabled || send) ? chrome.permissions.request({ origins: origins(url) }) : Promise.resolve(true);
    if (!(await allowed)) return note($(`${name}-status`), "✗ Access to that address wasn't allowed", "bad");
    const cfg = { ...settings.outputs[name], enabled, url };
    if (name === "webhook") cfg.secret = $("webhook-secret").value;
    await store({ outputs: { [name]: cfg } });
    if (!send) return note($(`${name}-status`), "✓ Saved", "good");
    note($(`${name}-status`), "Sending…");
    await ask({ type: "deliver", only: name, force: true });
    showStatus();
  };
  $(`${name}-save`).addEventListener("click", () => save(false));
  $(`${name}-test`).addEventListener("click", () => save(true));
}
hook("webhook", { problem: webhookUrlProblem, origins: (url) => [originOf(url)] });
hook("discord", { problem: discordUrlProblem, origins: () => DISCORD_ORIGINS });

// Status of each output: the worst over all tracked profiles
async function showStatus() {
  const trackers = await getTrackers();
  for (const name of ["github", "webhook", "discord"]) {
    const el = $(`${name}-status`);
    let latest = null;
    let failed = null;
    let any = false;
    for (const t of trackers) {
      const data = await getData(t.id);
      if (data.latest) any = true;
      const st = data.status[name];
      if (!st) continue;
      if (!st.ok) failed = st;
      if (!latest || st.at > latest.at) latest = st;
    }
    if (!any) note(el, "Nothing to send yet: track a profile first.");
    else if (failed) note(el, `✗ ${failed.note}`, "bad");
    else if (latest) note(el, `✓ ${latest.note === "unchanged" ? "Up to date" : "Sent"} ${ago(latest.at)}`, "good");
    else note(el, "");
  }
}

// ---------- start ----------

async function start() {
  settings = await getSettings();
  const g = settings.outputs.github;
  $("github-enabled").checked = g.enabled;
  $("github-folder").value = g.folder;
  $("github-branch").value = g.branch;
  $("github-json").checked = g.json;
  $("github-card").checked = g.card;
  $("github-theme").value = g.theme;
  $("github-history").checked = g.history;
  $("webhook-enabled").checked = settings.outputs.webhook.enabled;
  $("webhook-url").value = settings.outputs.webhook.url;
  $("webhook-secret").value = settings.outputs.webhook.secret;
  $("discord-enabled").checked = settings.outputs.discord.enabled;
  $("discord-url").value = settings.outputs.discord.url;
  fillPlatforms();
  $("check-every").value = String(settings.checkEvery);
  $("auto-accounts").checked = settings.autoAccounts;
  await Promise.all([showTrackers(), showGitHub(), preview(), showStatus(), showAllow()]);
  const connected = sessionStorage.getItem("connected");
  if (connected) {
    sessionStorage.removeItem("connected");
    note($("github-status"), connected, connected.startsWith("✓") ? "good" : "");
    $("github").scrollIntoView();
  }
}

let timer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || changes.settings) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    showTrackers();
    showStatus();
    preview();
    showAllow();
  }, 300);
});

start();
