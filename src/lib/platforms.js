// Built-in platforms. Each one knows:
//   detect(url)   which username a profile address belongs to
//   read(user, inPage)  how to get the stats. It must be self-contained (no
//                 outside variables), because it also runs inside the site's
//                 own tab. It returns { ok: true, fields } or { ok: false, error }.
//   anywhere      true if read() also works from the background (public data),
//                 false if it only works inside an open tab of the site.
//   fields        what to show, in order. kind: number | text | rank
//   headline      the one field shown big on the card

const first = (re, url) => (url.match(re) || [])[1] || null;

export const PLATFORMS = {
  tryhackme: {
    name: "TryHackMe",
    home: "https://tryhackme.com/",
    origins: ["https://tryhackme.com/*"],
    profile: (u) => `https://tryhackme.com/p/${encodeURIComponent(u)}`,
    detect: (url) => first(/^https:\/\/tryhackme\.com\/(?:r\/)?p\/([\w.-]+)/, url),
    anywhere: false, // TryHackMe blocks requests from outside its own pages
    headline: { key: "level", label: "LVL" },
    fields: [
      { key: "level", label: "Level", kind: "number" },
      { key: "rank", label: "Rank", kind: "rank" },
      { key: "rooms", label: "Rooms", kind: "number" },
      { key: "points", label: "Points", kind: "number" },
      { key: "badges", label: "Badges", kind: "number" },
      { key: "streak", label: "Streak", kind: "number" },
      { key: "league", label: "League", kind: "text" },
    ],
    read: async function (user) {
      const res = await fetch(`/api/v2/public-profile?username=${encodeURIComponent(user)}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!res.ok) return { ok: false, error: `TryHackMe answered ${res.status}` };
      const j = await res.json();
      const d = j && j.status === "success" ? j.data : null;
      if (!d || String(d.username).toLowerCase() !== user.toLowerCase()) return { ok: false, error: "Profile not found" };
      return {
        ok: true,
        username: d.username,
        fields: {
          level: d.level, rank: d.rank, rooms: d.completedRoomsNumber, points: d.totalPoints,
          badges: d.badgesNumber, streak: d.streak, league: d.leagueTier,
        },
      };
    },
  },

  leetcode: {
    name: "LeetCode",
    home: "https://leetcode.com/",
    origins: ["https://leetcode.com/*"],
    profile: (u) => `https://leetcode.com/u/${encodeURIComponent(u)}/`,
    detect: (url) => first(/^https:\/\/leetcode\.com\/u\/([\w.-]+)/, url),
    anywhere: true,
    headline: { key: "solved", label: "" , suffix: " solved" },
    fields: [
      { key: "solved", label: "Solved", kind: "number" },
      { key: "easy", label: "Easy", kind: "number" },
      { key: "medium", label: "Medium", kind: "number" },
      { key: "hard", label: "Hard", kind: "number" },
      { key: "ranking", label: "Ranking", kind: "rank" },
      { key: "contestRating", label: "Contest rating", kind: "number" },
    ],
    read: async function (user) {
      const query = `query($u: String!) {
        matchedUser(username: $u) { username profile { ranking } submitStatsGlobal { acSubmissionNum { difficulty count } } }
        userContestRanking(username: $u) { rating }
      }`;
      const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { u: user } }),
      });
      if (!res.ok) return { ok: false, error: `LeetCode answered ${res.status}` };
      const d = (await res.json()).data || {};
      const m = d.matchedUser;
      if (!m) return { ok: false, error: "Profile not found" };
      const count = (k) => (m.submitStatsGlobal.acSubmissionNum.find((x) => x.difficulty === k) || {}).count;
      const rating = d.userContestRanking && d.userContestRanking.rating;
      return {
        ok: true,
        username: m.username,
        fields: {
          solved: count("All"), easy: count("Easy"), medium: count("Medium"), hard: count("Hard"),
          ranking: m.profile.ranking, contestRating: rating ? Math.round(rating) : undefined,
        },
      };
    },
  },

  codeforces: {
    name: "Codeforces",
    home: "https://codeforces.com/",
    origins: ["https://codeforces.com/*"],
    profile: (u) => `https://codeforces.com/profile/${encodeURIComponent(u)}`,
    detect: (url) => first(/^https:\/\/codeforces\.com\/profile\/([\w.-]+)/, url),
    anywhere: true,
    headline: { key: "rating", label: "" },
    fields: [
      { key: "rating", label: "Rating", kind: "number" },
      { key: "maxRating", label: "Max rating", kind: "number" },
      { key: "rank", label: "Rank", kind: "text" },
      { key: "maxRank", label: "Max rank", kind: "text" },
      // keep: only known when read from an open Codeforces tab (see read)
      { key: "solved", label: "Solved", kind: "number", keep: true },
      { key: "contribution", label: "Contribution", kind: "number" },
    ],
    read: async function (user, inPage) {
      const api = async (path) => {
        const res = await fetch(`https://codeforces.com/api/${path}`, { credentials: "omit" });
        const j = await res.json().catch(() => null);
        if (!j || j.status !== "OK") throw new Error((j && j.comment) || `Codeforces answered ${res.status}`);
        return j.result;
      };
      try {
        const [u] = await api(`user.info?handles=${encodeURIComponent(user)}`);
        // "N problems solved for all time" is only on the profile page (it also
        // counts group and gym problems, which the API doesn't list). The page
        // can only be read from an open Codeforces tab; otherwise it's left out
        // and the last value read is kept.
        let solved;
        if (inPage) {
          const res = await fetch(`/profile/${encodeURIComponent(user)}`, { credentials: "same-origin" });
          if (res.ok) {
            // Find the words "solved for all time" and the number shown with them
            const doc = new DOMParser().parseFromString(await res.text(), "text/html");
            for (const el of doc.querySelectorAll("div, span")) {
              if (el.children.length || !/^solved for all time$/i.test(el.textContent.trim())) continue;
              const m = (el.parentElement?.textContent || "").match(/([\d,]+)\s*problems?/i);
              if (m) {
                solved = Number(m[1].replace(/,/g, ""));
                break;
              }
            }
          }
        }
        const title = (s) => (s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined);
        return {
          ok: true,
          username: u.handle,
          fields: {
            rating: u.rating, maxRating: u.maxRating, rank: title(u.rank), maxRank: title(u.maxRank),
            solved, contribution: u.contribution,
          },
        };
      } catch (e) {
        return { ok: false, error: /not found/i.test(e.message) ? "Profile not found" : e.message };
      }
    },
  },

  atcoder: {
    name: "AtCoder",
    home: "https://atcoder.jp/",
    origins: ["https://atcoder.jp/*"],
    profile: (u) => `https://atcoder.jp/users/${encodeURIComponent(u)}`,
    detect: (url) => first(/^https:\/\/atcoder\.jp\/users\/([\w.-]+)/, url),
    anywhere: true,
    headline: { key: "rating", label: "" },
    fields: [
      { key: "rating", label: "Rating", kind: "number" },
      { key: "highest", label: "Highest", kind: "number" },
      { key: "rank", label: "Rank", kind: "rank" },
      { key: "matches", label: "Rated matches", kind: "number" },
    ],
    read: async function (user) {
      const res = await fetch(`https://atcoder.jp/users/${encodeURIComponent(user)}?lang=en`, { credentials: "omit" });
      if (res.status === 404) return { ok: false, error: "Profile not found" };
      if (!res.ok) return { ok: false, error: `AtCoder answered ${res.status}` };
      const html = await res.text();
      const cell = (label) => {
        const m = html.match(new RegExp(`<th[^>]*>\\s*${label}\\s*(?:<[^>]*>[^<]*</[^>]*>\\s*)*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`));
        return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
      };
      const n = (s) => {
        const m = s.match(/\d[\d,]*/);
        return m ? Number(m[0].replace(/,/g, "")) : undefined;
      };
      const name = (html.match(/<a[^>]*class="username"[^>]*>\s*<span[^>]*>([^<]+)</) || [])[1];
      return {
        ok: true,
        username: name || user,
        fields: { rating: n(cell("Rating")), highest: n(cell("Highest Rating")), rank: n(cell("Rank")), matches: n(cell("Rated Matches")) },
      };
    },
  },

  codechef: {
    name: "CodeChef",
    home: "https://www.codechef.com/",
    origins: ["https://www.codechef.com/*"],
    profile: (u) => `https://www.codechef.com/users/${encodeURIComponent(u)}`,
    detect: (url) => first(/^https:\/\/www\.codechef\.com\/users\/([\w.-]+)/, url),
    anywhere: true,
    headline: { key: "stars", label: "", suffix: "★" },
    fields: [
      { key: "rating", label: "Rating", kind: "number" },
      { key: "highest", label: "Highest", kind: "number" },
      { key: "stars", label: "Stars", kind: "number" },
      { key: "globalRank", label: "Global rank", kind: "rank" },
      { key: "solved", label: "Solved", kind: "number" },
    ],
    read: async function (user) {
      const res = await fetch(`https://www.codechef.com/users/${encodeURIComponent(user)}`, { credentials: "omit" });
      if (!res.ok) return { ok: false, error: `CodeChef answered ${res.status}` };
      const html = await res.text();
      const n = (re) => {
        const m = html.match(re);
        return m ? Number(m[1]) : undefined;
      };
      if (!/class="rating-number"/.test(html)) return { ok: false, error: "Profile not found" };
      return {
        ok: true,
        username: user,
        fields: {
          rating: n(/class="rating-number"[^>]*>\s*(\d+)/),
          highest: n(/Highest Rating\D{0,40}(\d+)/),
          stars: n(/(\d)&#9733;/) ?? n(/(\d)★/),
          globalRank: n(/class='global-rank'>(\d+)/),
          solved: n(/Total Problems Solved:\s*(\d+)/),
        },
      };
    },
  },

  hackerrank: {
    name: "HackerRank",
    home: "https://www.hackerrank.com/",
    origins: ["https://www.hackerrank.com/*"],
    profile: (u) => `https://www.hackerrank.com/profile/${encodeURIComponent(u)}`,
    detect: (url) => first(/^https:\/\/www\.hackerrank\.com\/profile\/([\w.-]+)/, url),
    anywhere: true,
    headline: { key: "solved", label: "", suffix: " solved" },
    fields: [
      { key: "solved", label: "Solved", kind: "number" },
      { key: "badges", label: "Badges", kind: "number" },
      { key: "stars", label: "Stars", kind: "number" },
      { key: "goldBadges", label: "Gold badges", kind: "number" },
    ],
    read: async function (user) {
      const res = await fetch(`https://www.hackerrank.com/rest/hackers/${encodeURIComponent(user)}/badges`, { credentials: "omit" });
      if (res.status === 404) return { ok: false, error: "Profile not found" };
      const j = await res.json().catch(() => null);
      if (!j || !j.status || !Array.isArray(j.models)) return { ok: false, error: `HackerRank answered ${res.status}` };
      const earned = j.models.filter((b) => b.stars > 0);
      return {
        ok: true,
        username: user,
        fields: {
          solved: j.models.reduce((a, b) => a + (b.solved || 0), 0),
          badges: earned.length,
          stars: earned.reduce((a, b) => a + b.stars, 0),
          goldBadges: earned.filter((b) => b.stars >= 5).length,
        },
      };
    },
  },

  codewars: {
    name: "Codewars",
    home: "https://www.codewars.com/",
    origins: ["https://www.codewars.com/*"],
    profile: (u) => `https://www.codewars.com/users/${encodeURIComponent(u)}`,
    detect: (url) => first(/^https:\/\/www\.codewars\.com\/users\/([\w.%-]+)/, url),
    anywhere: true,
    headline: { key: "rank", label: "" },
    fields: [
      { key: "rank", label: "Rank", kind: "text" },
      { key: "honor", label: "Honor", kind: "number" },
      { key: "position", label: "Leaderboard", kind: "rank" },
      { key: "completed", label: "Kata completed", kind: "number" },
    ],
    read: async function (user) {
      const res = await fetch(`https://www.codewars.com/api/v1/users/${encodeURIComponent(user)}`, { credentials: "omit" });
      if (res.status === 404) return { ok: false, error: "Profile not found" };
      if (!res.ok) return { ok: false, error: `Codewars answered ${res.status}` };
      const j = await res.json();
      return {
        ok: true,
        username: j.username,
        fields: {
          rank: j.ranks && j.ranks.overall && j.ranks.overall.name,
          honor: j.honor,
          position: j.leaderboardPosition || undefined,
          completed: j.codeChallenges && j.codeChallenges.totalCompleted,
        },
      };
    },
  },
};

// Which built-in platform and username an address belongs to
export function detect(url) {
  for (const [id, p] of Object.entries(PLATFORMS)) {
    let host;
    try {
      host = new URL(url).origin + "/*";
    } catch {
      return null;
    }
    if (!p.origins.includes(host)) continue;
    return { platform: id, username: p.detect(url) };
  }
  return null;
}

// Keep only plain numbers and short text, in the platform's field order
export function cleanFields(fields, list) {
  const out = {};
  for (const f of list) {
    const v = fields ? fields[f.key] : undefined;
    if (typeof v === "number" && Number.isFinite(v)) out[f.key] = v;
    else if (typeof v === "string" && v.trim() && v.length <= 40) out[f.key] = v.trim();
  }
  return out;
}
