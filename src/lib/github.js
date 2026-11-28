// GitHub: "Sign in with GitHub" (device flow), keeping the sign-in fresh,
// listing the repos you allowed, and writing files in one commit.
//
// The sign-in uses a GitHub App. Its client ID is public (it's in config.js);
// the device flow needs no secret, so nothing secret ships in the extension.
// The token can only write to the repos you picked when installing the app.

import { GITHUB } from "../config.js";

const API = "https://api.github.com";
export const ORIGINS = ["https://github.com/*", "https://api.github.com/*"];

export const configured = () => Boolean(GITHUB.clientId && GITHUB.appSlug);
export const installUrl = () => `https://github.com/apps/${GITHUB.appSlug}/installations/new`;

async function post(url, params) {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, {
    method: "POST",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

// 1. Ask GitHub for a code the user types at github.com/login/device
export async function startSignIn() {
  const r = await post("https://github.com/login/device/code", { client_id: GITHUB.clientId });
  if (!r.device_code) throw new Error(r.error_description || r.error || "GitHub didn't give a code");
  return r; // { device_code, user_code, verification_uri, expires_in, interval }
}

// 2. Wait until the user entered the code. Returns the saved sign-in.
export async function finishSignIn(code, { signal } = {}) {
  let wait = (code.interval || 5) * 1000;
  const end = Date.now() + (code.expires_in || 900) * 1000;
  while (Date.now() < end) {
    await new Promise((ok) => setTimeout(ok, wait));
    if (signal?.aborted) throw new Error("Cancelled");
    const r = await post("https://github.com/login/oauth/access_token", {
      client_id: GITHUB.clientId,
      device_code: code.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (r.access_token) return save(r);
    if (r.error === "authorization_pending") continue;
    if (r.error === "slow_down") {
      wait = ((r.interval || code.interval || 5) + 5) * 1000;
      continue;
    }
    if (r.error === "access_denied") throw new Error("Sign-in was cancelled on GitHub");
    if (r.error === "expired_token" || r.error === "token_expired") break;
    throw new Error(r.error_description || r.error || "Sign-in failed");
  }
  throw new Error("The code expired. Please try again.");
}

async function save(r) {
  const now = Date.now();
  const auth = {
    token: r.access_token,
    refresh: r.refresh_token || null,
    expires: r.expires_in ? now + r.expires_in * 1000 : null,
    refreshExpires: r.refresh_token_expires_in ? now + r.refresh_token_expires_in * 1000 : null,
  };
  const user = await call("/user", { token: auth.token });
  auth.login = user.login;
  await chrome.storage.local.set({ githubAuth: auth });
  return auth;
}

export async function signOut() {
  await chrome.storage.local.remove("githubAuth");
}

export async function signedIn() {
  const { githubAuth } = await chrome.storage.local.get("githubAuth");
  return githubAuth || null;
}

// A working token, refreshed first if it is about to expire.
// Refreshing needs no secret for device-flow sign-ins.
let refreshing = null;
async function token() {
  const auth = await signedIn();
  if (!auth) throw new Error("Not signed in to GitHub");
  if (!auth.expires || auth.expires - Date.now() > 5 * 60 * 1000) return auth.token;
  if (!auth.refresh || (auth.refreshExpires && auth.refreshExpires < Date.now())) {
    await signOut();
    throw new Error("GitHub sign-in expired. Please sign in again.");
  }
  refreshing ||= (async () => {
    try {
      const r = await post("https://github.com/login/oauth/access_token", {
        client_id: GITHUB.clientId,
        grant_type: "refresh_token",
        refresh_token: auth.refresh,
      });
      if (!r.access_token) {
        await signOut();
        throw new Error("GitHub sign-in expired. Please sign in again.");
      }
      return (await save(r)).token;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function call(path, { method = "GET", body, token: given } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${given || (await token())}`,
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`GitHub: ${data.message || res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Repos the app was installed on that you can write to: ["owner/name", ...]
export async function repos() {
  const out = [];
  const { installations } = await call("/user/installations?per_page=100");
  for (const inst of installations) {
    const r = await call(`/user/installations/${inst.id}/repositories?per_page=100`);
    for (const repo of r.repositories) {
      if (repo.permissions?.push) out.push(repo.full_name);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// One file's text, or null if it isn't there
export async function readFile(repo, path, branch = "") {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  try {
    const r = await call(`/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}${ref}`);
    if (!r || Array.isArray(r) || r.encoding !== "base64") return null;
    const bytes = Uint8Array.from(atob(r.content.replace(/\s/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Write several files in ONE commit. Skips the commit if nothing changed.
// files: [{ path, content }]. Returns "committed" or "unchanged".
export async function writeFiles(repo, files, message, branch = "") {
  const base = `/repos/${repo}`;
  if (!branch) branch = (await call(base)).default_branch;
  let ref;
  try {
    ref = await call(`${base}/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch (e) {
    if (e.status === 404 || e.status === 409) {
      throw new Error(`The repo has no branch "${branch}" yet. Add a README on GitHub first.`);
    }
    throw e;
  }
  const parent = await call(`${base}/git/commits/${ref.object.sha}`);
  const tree = await call(`${base}/git/trees`, {
    method: "POST",
    body: {
      base_tree: parent.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    },
  });
  if (tree.sha === parent.tree.sha) return "unchanged";
  const commit = await call(`${base}/git/commits`, {
    method: "POST",
    body: { message, tree: tree.sha, parents: [ref.object.sha] },
  });
  await call(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: { sha: commit.sha, force: false },
  });
  return "committed";
}
