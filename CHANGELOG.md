# Changelog

## 1.0.1

- Fix: after the extension is updated or reloaded, tabs that were already open no longer log an error every minute. The old page script now stops itself, and the next page load starts a fresh one.
- Fix: picking numbers on a page opened before an update now shows "reload this page" instead of failing silently.
- The settings page describes webhooks without naming specific services.
- The stats JSON (GitHub files, webhooks, export) now includes `fields`: each number's label and order, so tools can name the numbers of picked sites too.

## 1.0.0

First release.

- Built-in readers for 7 coding and security learning sites, plus "Pick numbers" for any other page.
- Outputs: GitHub (stats files and cards in one commit, via a GitHub App), webhooks (optionally HMAC-signed), Discord, and export (JSON, CSV, SVG, PNG).
- Automatic updates: open pages are read about once a minute, and public-data sites every 5 minutes in the background (adjustable).
- No website access at install; each site is asked for only when needed.
