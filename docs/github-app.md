# Setting up "Sign in with GitHub"

"Sign in with GitHub" uses a **GitHub App**. You register it once, on GitHub's website, and its public **client ID** goes into `src/config.js`. You don't need a server, a client secret or a private key: the extension uses GitHub's device sign-in, which works without them.

Users then choose which repos the app may write to, and it can't touch any other repo.

## 1. Register the app

Open https://github.com/settings/apps/new and fill in:

| Field | Value |
|---|---|
| **GitHub App name** | `Profile Sync` (if that's taken, for example `Profile Sync Extension`) |
| **Homepage URL** | `https://github.com/DAGMON-Z/profile-sync` |
| **Callback URL** | leave empty |
| **Expire user authorization tokens** | keep ticked |
| **Request user authorization (OAuth) during installation** | leave unticked |
| **Enable Device Flow** | **tick this** |
| **Setup URL** | leave empty |
| **Webhook → Active** | **untick this** (the extension needs no webhook) |

Under **Permissions → Repository permissions**, set:

| Permission | Access |
|---|---|
| **Contents** | **Read and write** (to write the stats and card files) |
| Metadata | Read-only (GitHub sets this by itself) |

Leave every other permission at **No access**, and leave "Subscribe to events" empty.

**Where can this GitHub App be installed?** Choose **Any account**, so everyone can use the extension.

Press **Create GitHub App**.

## 2. Copy two values

On the app's page:

- **Client ID**: it looks like `Iv23li…`.
- **The app's short name ("slug")**: it's in the app's public link, `https://github.com/apps/<slug>`. For example, `profile-sync`.

**Don't** generate a client secret or a private key; they aren't needed.

## 3. Put them in the extension

Edit `src/config.js`:

```js
export const GITHUB = {
  clientId: "Iv23li…",
  appSlug: "profile-sync",
};
```

The client ID isn't a secret. GitHub shows it publicly, and it's safe in the extension's code.

## How it works for users

1. In **Settings → GitHub**, they press **Sign in with GitHub**. The extension shows an 8-character code and opens `github.com/login/device`, where they enter it and approve.
2. They press **Give Profile Sync access to it** and choose one or more repos.
3. They pick the repo in the list. From then on the extension writes `profile-sync/…` files there, in one commit per change.

Sign-ins last 8 hours and renew by themselves for up to 6 months. After that, users sign in again.
