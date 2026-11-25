// Added only to sites where you turned on automatic updates. It tells the
// background part that the page is open (and again every minute while it's
// in front); the background part then reads your stats from it, at most once
// a minute per profile.

const EVERY = 60 * 1000;

function ping() {
  if (document.visibilityState === "visible") chrome.runtime.sendMessage({ type: "page-open" }).catch(() => {});
}

ping();
setInterval(ping, EVERY);
document.addEventListener("visibilitychange", ping);
