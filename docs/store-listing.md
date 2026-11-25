# Store listing texts

Ready to paste into the Chrome Web Store and Firefox Add-ons forms.

## Name

Profile Sync – coding & security stats

## Short description (Chrome "summary", max 132 characters; Firefox "summary", max 250)

Track your stats on TryHackMe, LeetCode, Codeforces and more, or any site, and send them to GitHub, webhooks or Discord.

## Long description

Keep your coding and security progress in one place, and show it wherever you want.

Profile Sync reads your public stats from the sites you learn on and keeps them up to date:
• TryHackMe: level, rank, rooms, points, badges, streak
• LeetCode: problems solved (easy / medium / hard), ranking, contest rating
• Codeforces: rating, max rating, rank, solved problems
• AtCoder: rating, highest rating, rank
• CodeChef: rating, stars, global rank, solved problems
• HackerRank: problems solved, badges, stars
• Codewars: rank, honor, leaderboard position, kata completed
• Any other site: pick the numbers you care about on the page, and Profile Sync keeps reading them.

Then send your stats where you want them:
• GitHub: a stats file and a good-looking card image for your profile README, in your own repo
• Webhooks: JSON to your website, server, Zapier, Make or n8n, with an optional signature
• Discord: a message in your channel when you level up or solve more problems
• Export: JSON, CSV history, or the card as SVG or PNG

How to use it:
1. Open your profile page on a supported site and click the icon, then Track.
2. On any other site, click the icon and choose "Pick numbers on this page".
3. In Settings, turn on GitHub, a webhook or Discord.

Private by design:
• No access to any website at install. It only reads the tab you're on after you click its icon.
• Access to a site is asked for only when you turn on automatic updates for that site.
• Your data stays in your browser and goes only to the places you set up. No analytics, no tracking, no servers of our own.
• Open source: https://github.com/DAGMON-Z/profile-sync

Profile Sync is independent and not affiliated with TryHackMe, LeetCode, Codeforces, AtCoder, CodeChef, HackerRank, Codewars, GitHub or Discord.

## Category

- Chrome: **Developer Tools** (or Productivity)
- Firefox: **Social & Communication** and **Other**

## Chrome: privacy practices tab

**Single purpose:**
Profile Sync keeps a user's stats from coding and security learning sites (and numbers they pick on other pages) up to date, and sends them to the destinations the user sets up (their GitHub repo, a webhook, Discord) or exports them.

**Permission justifications:**
- `activeTab`: to read the stats from the page the user is on, only after they click the extension's icon.
- `scripting`: to run the stats reader and the "pick numbers" tool on that page, and to read open pages of sites the user turned automatic updates on for.
- `storage`: to save the user's tracked profiles, settings, stats history and GitHub sign-in on their device.
- `alarms`: to check for new stats every 30 minutes on sites the user turned automatic updates on for.
- Optional host permissions (`https://*/*`, `http://localhost/*`, `http://127.0.0.1/*`): asked for one site at a time when the user turns on automatic updates for a site, signs in with GitHub, or adds a webhook or Discord address. Webhooks can be any address the user owns, so the optional pattern can't be narrower.

**Remote code:** No, I am not using remote code.

**Data usage** (tick these):
- Authentication information (the GitHub sign-in token, stored locally and only sent to GitHub)
- Website content (the stats read from the pages the user chose)

Certify all three statements: the data is not sold to third parties, not used or transferred for purposes unrelated to the single purpose, and not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://github.com/DAGMON-Z/profile-sync/blob/main/PRIVACY.md

## Firefox: extra fields

- **License:** MIT
- **Privacy policy:** paste the text of PRIVACY.md
- **Notes to reviewer:**
  No build step, minification or remote code: the uploaded files are the source (also at https://github.com/DAGMON-Z/profile-sync). The functions in `src/lib/platforms.js` named `read` are run inside the matching site's tab with `scripting.executeScript` after the user clicks the icon (`activeTab`), or with an optional host permission the user granted for automatic updates. To test without accounts: open https://codeforces.com/profile/tourist, click the icon, then Track.

## Images to upload

All in the `store/` folder:

| File | Size | Where |
|---|---|---|
| `src/icons/128.png` | 128×128 | Chrome and Firefox: icon |
| `store/1-stats.png` | 1280×800 | screenshot 1: the popup with tracked profiles |
| `store/2-cards.png` | 1280×800 | screenshot 2: the GitHub cards |
| `store/3-pick.png` | 1280×800 | screenshot 3: picking numbers on any site |
| `store/4-send.png` | 1280×800 | screenshot 4: GitHub, webhook and Discord settings |
| `store/promo-440x280.png` | 440×280 | Chrome: small promo tile |
