// Makes the store packages:
//   dist/profile-sync-chrome-<version>.zip   (Chrome, Brave, Edge, Opera, Vivaldi)
//   dist/profile-sync-firefox-<version>.zip  (Firefox)
// Usage: npm run build
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const base = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));

const targets = {
  chrome(m) {
    m.background = { service_worker: "background.js", type: "module" };
    return m;
  },
  firefox(m) {
    m.background = { scripts: ["background.js"], type: "module" };
    m.browser_specific_settings = {
      gecko: {
        id: "profile-sync@dagmon-z.github.io",
        strict_min_version: "140.0",
        // Firefox asks users about this at install. The extension reads stats
        // from pages (websiteContent) and keeps a GitHub sign-in (authenticationInfo);
        // both only go where the user sends them.
        data_collection_permissions: { required: ["websiteContent", "authenticationInfo"] },
      },
    };
    return m;
  },
};

fs.rmSync(DIST, { recursive: true, force: true });
for (const [name, adapt] of Object.entries(targets)) {
  const dir = path.join(DIST, name);
  fs.cpSync(SRC, dir, { recursive: true });
  const manifest = adapt(structuredClone(base));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const zip = path.join(DIST, `profile-sync-${name}-${base.version}.zip`);
  execFileSync("zip", ["-q", "-r", "-X", zip, "."], { cwd: dir });
  console.log(`${path.relative(ROOT, zip)}  (${Math.round(fs.statSync(zip).size / 1024)} KB)`);
}
