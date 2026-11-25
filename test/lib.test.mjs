// Run with: npm test   (or: node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { PLATFORMS, cleanFields, detect } from "../src/lib/platforms.js";
import { addToHistory, changes, describe, exportJson, fingerprint, format, historyCsv, makeStats, trackerId } from "../src/lib/stats.js";
import { esc, renderCard } from "../src/lib/card.js";
import { cleanPath, discordMessage, discordUrlProblem, originOf, toWebhook, webhookUrlProblem } from "../src/lib/outputs.js";

const thm = { kind: "builtin", platform: "tryhackme", username: "DAGMON" };
thm.id = trackerId(thm);
const custom = { kind: "custom", name: "picoCTF", url: "https://play.picoctf.org/users/me", fields: [{ key: "f1", label: "Score", selector: "#s" }, { key: "f2", label: "Place", selector: "#p", kind: "text" }] };
custom.id = trackerId(custom);
const answer = { ok: true, username: "DAGMON", fields: { level: 2, rank: "Top 50%", rooms: 9, points: 368, badges: 1, streak: 1, league: "silver", email: "x@y.z" } };

test("tracker ids", () => {
  assert.equal(thm.id, "tryhackme-dagmon");
  assert.equal(custom.id, "site-picoctf");
});

test("detect finds platform and username from an address", () => {
  assert.deepEqual(detect("https://tryhackme.com/p/DAGMON?utm=x"), { platform: "tryhackme", username: "DAGMON" });
  assert.deepEqual(detect("https://leetcode.com/u/lee215/"), { platform: "leetcode", username: "lee215" });
  assert.deepEqual(detect("https://leetcode.com/problems/two-sum/"), { platform: "leetcode", username: null });
  assert.deepEqual(detect("https://www.codechef.com/users/gennady.korotkevich"), { platform: "codechef", username: "gennady.korotkevich" });
  assert.equal(detect("https://example.com/p/x"), null);
  assert.equal(detect("not a url"), null);
});

test("every platform is complete", () => {
  for (const [id, p] of Object.entries(PLATFORMS)) {
    assert.ok(p.name && p.home && p.origins.length && p.fields.length, id);
    assert.equal(typeof p.read, "function", id);
    // readers are copied into pages as text: they must stand alone
    assert.doesNotThrow(() => new Function(`return (${p.read.toString()})`)(), id);
    assert.deepEqual(detect(p.profile("someone")), { platform: id, username: "someone" }, id);
  }
});

test("makeStats keeps only known fields", () => {
  const s = makeStats(thm, answer, new Date("2026-01-01T00:00:00Z"));
  assert.deepEqual(s.fields, { level: 2, rank: "Top 50%", rooms: 9, points: 368, badges: 1, streak: 1, league: "silver" });
  assert.equal(s.site, "TryHackMe");
  assert.equal(s.url, "https://tryhackme.com/p/DAGMON");
  assert.equal(cleanFields({ a: "x".repeat(41), b: NaN, c: 3 }, [{ key: "a" }, { key: "b" }, { key: "c" }]).c, 3);
  assert.deepEqual(cleanFields({ a: "x".repeat(41), b: NaN }, [{ key: "a" }, { key: "b" }]), {});
});

test("custom trackers describe themselves", () => {
  const d = describe(custom);
  assert.equal(d.site, "play.picoctf.org");
  assert.deepEqual(d.fields.map((f) => f.kind), ["number", "text"]);
  const s = makeStats(custom, { ok: true, fields: { f1: 1200, f2: "12th" } });
  assert.equal(s.title, "picoCTF");
  assert.deepEqual(s.fields, { f1: 1200, f2: "12th" });
});

test("format", () => {
  assert.equal(format(12345, "rank"), "#12,345");
  assert.equal(format(12345, "number"), "12,345");
  assert.equal(format("Top 5%", "rank"), "Top 5%");
  assert.equal(format("gold", "text"), "Gold");
  assert.equal(format(undefined), "—");
});

test("fingerprint ignores time, changes lists what moved", () => {
  const a = makeStats(thm, answer, new Date(1));
  const b = makeStats(thm, answer, new Date(2));
  assert.equal(fingerprint(a), fingerprint(b));
  const c = { ...a, fields: { ...a.fields, level: 3, points: 500 } };
  assert.notEqual(fingerprint(a), fingerprint(c));
  assert.deepEqual(changes(a, c, describe(thm).fields).map((x) => x.key), ["level", "points"]);
  assert.deepEqual(changes(null, a, describe(thm).fields), []);
});

test("history: one entry per day, sorted, capped; csv", () => {
  const s = makeStats(thm, answer);
  let h = addToHistory([], s, new Date(2026, 0, 2));
  h = addToHistory(h, { ...s, fields: { ...s.fields, points: 400 } }, new Date(2026, 0, 2));
  h = addToHistory(h, s, new Date(2026, 0, 1));
  assert.deepEqual(h.map((e) => [e.date, e.points]), [["2026-01-01", 368], ["2026-01-02", 400]]);
  for (let i = 0; i < 10; i++) h = addToHistory(h, s, new Date(2026, 1, i + 1), 5);
  assert.equal(h.length, 5);
  const csv = historyCsv([{ date: "2026-01-01", f1: 1, f2: "12th, wow" }], describe(custom).fields);
  assert.equal(csv, 'date,f1,f2\n2026-01-01,1,"12th, wow"\n');
});

test("export json", () => {
  const j = exportJson(makeStats(thm, answer, new Date("2026-01-01T00:00:00Z")));
  assert.equal(j.id, "tryhackme-dagmon");
  assert.equal(j.stats.rooms, 9);
  assert.equal("history" in j, false);
});

test("card: escapes text, headline pill, height fits rows", () => {
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  const s = makeStats(thm, { ...answer, username: "<script>" });
  const svg = renderCard(s, describe(thm), { theme: "light" });
  assert.ok(svg.startsWith("<svg") && !svg.includes("<script>"));
  assert.ok(svg.includes("LVL 2"));
  assert.ok(svg.includes("#ffffff"));
  const small = renderCard(makeStats(custom, { ok: true, fields: { f1: 5 } }), describe(custom));
  assert.match(small, /height="162"/);
});

test("address rules", () => {
  assert.equal(webhookUrlProblem("https://example.com/hook"), "");
  assert.equal(webhookUrlProblem("http://localhost:5678/webhook/x"), "");
  assert.notEqual(webhookUrlProblem("http://example.com/hook"), "");
  assert.notEqual(webhookUrlProblem("https://user:pw@example.com/"), "");
  assert.equal(originOf("http://localhost:5678/x"), "http://localhost/*");
  assert.equal(discordUrlProblem("https://discord.com/api/webhooks/123/abc-DEF_9"), "");
  assert.notEqual(discordUrlProblem("https://evil.com/api/webhooks/123/abc"), "");
  assert.equal(cleanPath("/a/b/", "d"), "a/b");
  assert.equal(cleanPath("a/../b", "d"), "d");
});

test("discord message names the change and never pings", () => {
  const a = makeStats(thm, answer);
  const b = { ...a, fields: { ...a.fields, level: 3 } };
  const m = discordMessage(b, a, describe(thm));
  assert.match(m.embeds[0].title, /Level 2 → 3 on TryHackMe/);
  assert.deepEqual(m.allowed_mentions, { parse: [] });
  assert.match(discordMessage(a, null, describe(thm)).embeds[0].title, /Now tracking/);
});

test("webhook sends json with a correct signature", async () => {
  let got;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      got = { headers: req.headers, body };
      res.end("ok");
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  const a = makeStats(thm, answer);
  await toWebhook({ url, secret: "s3cret" }, { ...a, fields: { ...a.fields, rooms: 10 } }, a, { d: describe(thm) });
  server.close();
  const body = JSON.parse(got.body);
  assert.equal(body.event, "stats");
  assert.equal(body.stats.rooms, 10);
  assert.deepEqual(body.changes.map((c) => c.key), ["rooms"]);
  const want = "sha256=" + crypto.createHmac("sha256", "s3cret").update(got.body).digest("hex");
  assert.equal(got.headers["x-profile-sync-signature"], want);
});
