<p align="center"><img src="src/icons/128.png" width="96" alt=""></p>

<h1 align="center">Profile Sync</h1>

<p align="center">Your coding and security stats, wherever you want them.<br>
A browser extension for Chrome, Brave, Edge, Opera, Vivaldi and Firefox.</p>

---

Profile Sync reads your stats from TryHackMe, LeetCode, Codeforces and more (or from **any** page you pick numbers on). It keeps a daily history and sends your stats to the places you choose:

- **GitHub**: a stats file and a card image in one of your repos, ready for a profile README.
- **Webhook**: JSON to any address (your website, a server, Zapier, Make, n8n), optionally signed.
- **Discord**: a message in a channel when you level up, solve problems or move up in rank.
- **Export**: JSON, CSV history, or the card as SVG or PNG.

It only sends when your stats change, and it never sees your passwords.

## Supported sites

| Site | What it reads | Updates |
|---|---|---|
| TryHackMe | level, rank, rooms, points, badges, streak, league | while a TryHackMe tab is open |
| LeetCode | solved (easy / medium / hard), ranking, contest rating | automatically, every 30 minutes |
| Codeforces | rating, max rating, rank, solved problems, contribution | automatically |
| AtCoder | rating, highest rating, rank, rated matches | automatically |
| CodeChef | rating, highest rating, stars, global rank, solved | automatically |
| HackerRank | problems solved, badges, stars, gold badges | automatically |
| Codewars | rank, honor, leaderboard position, kata completed | automatically |
| **Any other site** | the numbers you pick on the page | while that page is open |

Want a site built in? [Open an issue](../../issues).

## How to use it

1. **Track a profile.** Open your profile page on a supported site (for example `leetcode.com/u/you`) and click the extension's icon, then **Track**.
2. **Or pick numbers on any site.** Open the page, click the icon, choose **Pick numbers on this page**, click each number you want and name it, then press **Save**.
3. **Choose where your stats go** in **Settings**: GitHub, a webhook, Discord, or just export.

### A card for your GitHub profile

Turn on GitHub in the settings, sign in and pick a repo (for example your profile repo `you/you`). Profile Sync writes:

```
profile-sync/<site>-<username>.svg    the card
profile-sync/<site>-<username>.json   the stats
profile-sync/all.json                 every tracked profile in one file
```

Then add the card to your README:

```markdown
![My TryHackMe stats](profile-sync/tryhackme-you.svg)
```

Cards come in three styles: dark, light and hacker. When your stats change, Profile Sync updates the `.svg`, and your profile shows the new numbers by itself.

#### What you'll see on GitHub

- **One commit per change, under your own name**, for example `LeetCode: you, solved 120`. Nothing is committed when nothing changed.
- **Only the repos you picked.** When you give Profile Sync access, choose "Only select repositories". It can't see or touch any other repo.
- **It never edits your README.** It only writes files in its own folder (`profile-sync/` by default); adding the card to your README is up to you.
- **Nothing passes through anyone else.** Your browser talks to GitHub directly; the extension's author can't see your stats or your repos.

#### Checking or removing access

On GitHub, open **Settings → Applications**:

- **Installed GitHub Apps → Profile Sync Extension → Configure**: see or change which repos it may write to, or uninstall it.
- **Authorized GitHub Apps → Profile Sync Extension → Revoke**: sign it out everywhere.

In the extension, **Settings → GitHub → Sign out** forgets the sign-in in your browser.

### Webhooks

Profile Sync sends a `POST` with JSON like this whenever stats change:

```json
{
  "event": "stats",
  "id": "leetcode-you",
  "site": "LeetCode",
  "title": "you",
  "url": "https://leetcode.com/u/you/",
  "stats": { "solved": 120, "easy": 60, "medium": 50, "hard": 10, "ranking": 350000 },
  "syncedAt": "2026-11-25T18:00:00.000Z",
  "changes": [{ "key": "solved", "label": "Solved", "kind": "number", "from": 119, "to": 120 }]
}
```

If you set a signing secret, each request has an `X-Profile-Sync-Signature: sha256=<hex>` header: the HMAC-SHA256 of the body with your secret. Check it on your server to know the request really came from you.

## Privacy and permissions

- At install, Profile Sync asks for **no** access to websites. It only reads the tab you're on, after you click its icon (`activeTab`).
- Automatic updates and outputs ask for access to one site at a time, when you turn them on.
- Your stats and settings stay in your browser. They only go to the GitHub repo, webhook or Discord channel **you** set up.
- No analytics, no tracking, no servers of our own.

Read the full [privacy policy](PRIVACY.md).

## Building it yourself

No build tools or dependencies are needed; the code in `src/` runs as it is.

```bash
npm test          # unit tests (Node 20+)
npm run build     # makes dist/profile-sync-chrome-<version>.zip and -firefox-<version>.zip
```

To try it without the store: open `chrome://extensions` (or `brave://extensions`), turn on **Developer mode**, click **Load unpacked** and choose the `src` folder. In Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and choose `dist/firefox/manifest.json` (run `npm run build` first).

"Sign in with GitHub" needs a GitHub App; see [docs/github-app.md](docs/github-app.md).

## Disclaimer

Profile Sync is an independent project. It isn't affiliated with, endorsed by or made by TryHackMe, LeetCode, Codeforces, AtCoder, CodeChef, HackerRank, Codewars, GitHub or Discord. All names belong to their owners.

## License

[MIT](LICENSE)
