// The stats card: an SVG image people can put in a GitHub README.
// It uses no outside fonts or images, so it shows the same everywhere.

import { format, shown } from "./stats.js";

export const THEMES = {
  dark: { bg: "#1a1b26", border: "#2f334d", title: "#7aa2f7", text: "#c0caf5", muted: "#787c99", accent: "#9ece6a", bar: "#292e42" },
  light: { bg: "#ffffff", border: "#d0d7de", title: "#2e5bd8", text: "#1f2328", muted: "#656d76", accent: "#1a7f37", bar: "#eaeef2" },
  hacker: { bg: "#0d1117", border: "#1f6f3f", title: "#3fb950", text: "#c9d1d9", muted: "#6e7681", accent: "#3fb950", bar: "#161b22" },
};

// Make text safe to put inside SVG
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// stats: saved stats; d: describe(tracker)
export function renderCard(stats, d, { theme = "dark" } = {}) {
  d = shown(d);
  const t = THEMES[theme] || THEMES.dark;
  const font = "font-family=\"'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif\"";
  const head = d.headline;
  const pillValue = head ? stats.fields[head.key] : undefined;
  const pill = pillValue === undefined ? "" : `${head.label ? head.label + " " : ""}${format(pillValue, "number")}${head.suffix || ""}`;
  const cells = d.fields.filter((f) => !head || f.key !== head.key || !pill).slice(0, 6);
  const rows = Math.max(1, Math.ceil(cells.length / 3));
  const height = 110 + rows * 52;
  const cell = (f, i) => {
    const x = 25 + (i % 3) * 150;
    const y = 104 + Math.floor(i / 3) * 52;
    return (
      `<text x="${x}" y="${y}" fill="${t.muted}" font-size="12" ${font}>${esc(cut(f.label, 22))}</text>` +
      `<text x="${x}" y="${y + 22}" fill="${t.text}" font-size="18" font-weight="600" ${font}>${esc(cut(format(stats.fields[f.key], f.kind), 14))}</text>`
    );
  };
  const pillWidth = Math.max(60, pill.length * 9 + 24);
  const updated = stats.syncedAt ? `Updated ${stats.syncedAt.slice(0, 10)}` : "";
  const summary = cells.slice(0, 3).map((f) => `${f.label} ${format(stats.fields[f.key], f.kind)}`).join(", ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="${height}" viewBox="0 0 495 ${height}" role="img" aria-label="${esc(stats.title)} on ${esc(stats.site)}">
<title>${esc(stats.title)} on ${esc(stats.site)}: ${esc(summary)}</title>
<rect x="0.5" y="0.5" width="494" height="${height - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<text x="25" y="40" fill="${t.title}" font-size="20" font-weight="700" ${font}>${esc(cut(stats.title, 28))}</text>
<text x="25" y="62" fill="${t.muted}" font-size="13" ${font}>${esc(stats.site)}</text>
${pill ? `<rect x="${470 - pillWidth}" y="22" width="${pillWidth}" height="30" rx="15" fill="${t.bar}"/>
<text x="${470 - pillWidth / 2}" y="42" fill="${t.accent}" font-size="14" font-weight="700" text-anchor="middle" ${font}>${esc(pill)}</text>` : ""}
${cells.map(cell).join("\n")}
<text x="470" y="${height - 12}" fill="${t.muted}" font-size="10" text-anchor="end" ${font}>${esc(updated)}</text>
</svg>
`;
}
