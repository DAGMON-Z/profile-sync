# Changelog

## 1.0.2

- **Your settings follow you to every computer.** What you track and how GitHub is set up are saved as `profile-sync/settings.json` in your repo. On another computer, install the extension and press **Sign in with GitHub**: it finds that file and loads everything, then asks once to allow the sites. Changes on one computer show up on the others within a few minutes. Webhook and Discord addresses are never saved there; set those on each computer.
- **Your accounts are tracked by themselves.** When you're logged in on Codeforces, LeetCode or AtCoder and nothing is tracked there yet, your account is tracked automatically (if that site is allowed). You can turn this off in Settings. On those sites, the icon also offers your logged-in account even when you're not on your profile page.
- Set up with an older version? Signing in on a new computer also finds your existing stats files and tracks those profiles.
- Fix: with two computers, `all.json` no longer drops profiles that only the other computer has read.

## 1.0.1

- Fix: after the extension is updated or reloaded, tabs that were already open no longer log an error every minute. The old page script now stops itself, and the next page load starts a fresh one.
- Fix: picking numbers on a page opened before an update now shows "reload this page" instead of failing silently.
- The settings page describes webhooks without naming specific services.
- Codeforces: "solved" is now the all-time count from your profile page ("N problems solved for all time", which includes group and gym problems), read while a Codeforces tab is open. Background checks keep the last value.
- The stats JSON (GitHub files, webhooks, export) now includes `fields`: each number's label and order, so tools can name the numbers of picked sites too.

## 1.0.0

First release.

- Built-in readers for 7 coding and security learning sites, plus "Pick numbers" for any other page.
- Outputs: GitHub (stats files and cards in one commit, via a GitHub App), webhooks (optionally HMAC-signed), Discord, and export (JSON, CSV, SVG, PNG).
- Automatic updates: open pages are read about once a minute, and public-data sites every 5 minutes in the background (adjustable).
- No website access at install; each site is asked for only when needed.
