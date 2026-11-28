// Settings and saved data. Everything lives in chrome.storage.local:
//   settings          which outputs are on, and how
//   trackers          the list of trackers (see stats.js)
//   t:<tracker id>    that tracker's { latest, history, status }

export const CHECK_EVERY = [5, 15, 30, 60]; // background check, in minutes

export const DEFAULTS = {
  checkEvery: 5,
  autoAccounts: true, // track your logged-in account on supported sites by itself
  outputs: {
    github: { enabled: false, repo: "", branch: "", folder: "profile-sync", json: true, card: true, theme: "dark", history: false },
    webhook: { enabled: false, url: "", secret: "" },
    discord: { enabled: false, url: "" },
  },
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const out = settings?.outputs || {};
  return {
    checkEvery: CHECK_EVERY.includes(settings?.checkEvery) ? settings.checkEvery : DEFAULTS.checkEvery,
    autoAccounts: settings?.autoAccounts ?? DEFAULTS.autoAccounts,
    outputs: {
      github: { ...DEFAULTS.outputs.github, ...out.github },
      webhook: { ...DEFAULTS.outputs.webhook, ...out.webhook },
      discord: { ...DEFAULTS.outputs.discord, ...out.discord },
    },
  };
}

export async function getTrackers() {
  const { trackers } = await chrome.storage.local.get("trackers");
  return trackers || [];
}

export async function getData(id) {
  const key = `t:${id}`;
  const got = await chrome.storage.local.get(key);
  return { history: [], status: {}, ...(got[key] || {}) };
}

export async function setData(id, data) {
  await chrome.storage.local.set({ [`t:${id}`]: data });
}
