# Privacy policy

*Last updated: November 25, 2026*

Profile Sync is a browser extension that reads your public stats from coding and security sites and sends them where you choose. This policy explains what it handles and where that goes.

## What the extension reads

- **Stats from supported sites.** This means the public profile numbers of the usernames you choose to track, such as level, rank, points and problems solved. It reads them from the site you're on after you click the extension's icon. Or, if you turn on automatic updates, it reads them directly from that site.
- **Numbers you pick on other pages.** Only the parts of the page you clicked while picking, and only on that page.
- **Nothing else.** The extension doesn't read your browsing history, other pages, passwords, cookies or messages.

## What the extension stores

Everything is stored in your browser's own extension storage, on your device:

- the profiles you track and the numbers you picked;
- your stats and a daily history (up to about 400 days);
- your settings: which outputs are on, the repo you chose, your webhook address and optional signing secret, and your Discord webhook address;
- if you sign in with GitHub: a GitHub access token, which only works for the repos you gave the app access to.

Removing a tracked profile deletes its stats and history. Uninstalling the extension deletes everything.

## Where your data goes

Only to the places **you** turn on:

- **GitHub:** your stats and card images are written to the repo you chose, using your GitHub sign-in.
- **Webhook:** your stats are sent to the address you entered.
- **Discord:** a message about your stats is posted through the Discord webhook you entered.
- **The sites themselves:** to read your stats, the extension asks the site for that profile's public data, the same way the site's own pages do.

Profile Sync has **no servers of its own**. It doesn't collect analytics, doesn't track you, doesn't sell or share data with anyone, and doesn't use your data for advertising or any purpose other than syncing the stats you chose.

## Permissions

- `activeTab` and `scripting`: read the page you're on, only after you click the icon.
- `storage`: keep your settings and stats on your device.
- `alarms`: check for new stats every few minutes (5 by default, adjustable), for sites with automatic updates.
- Access to specific websites is optional. It's asked for one site at a time, only when you turn on automatic updates for a site or turn on an output.

## Contact

Questions? Open an issue at https://github.com/DAGMON-Z/profile-sync/issues.
