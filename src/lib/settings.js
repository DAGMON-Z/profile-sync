// Settings and saved data. Everything lives in chrome.storage.local:
//   settings          which outputs are on, and how
//   trackers          the list of trackers (see stats.js)
//   t:<tracker id>    that tracker's { latest, history, status }

export const DEFAULTS = {
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
