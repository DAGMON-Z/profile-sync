// Added only to sites where you turned on automatic updates. It tells the
// background part that the page is open (and again every minute while it's
// in front); the background part then reads your stats from it, at most once
// a minute per profile.

const EVERY = 60 * 1000;
let timer = null;

// After the extension is updated or reloaded, this copy (still running in an
// already-open tab) loses its connection to the extension. Then it stops
// itself instead of failing every minute; the page's next load starts a new one.
function connected() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function stop() {
  clearInterval(timer);
  document.removeEventListener("visibilitychange", ping);
}

function ping() {
  if (!connected()) return stop();
  if (document.visibilityState !== "visible") return;
  try {
    chrome.runtime.sendMessage({ type: "page-open" }).catch(() => {});
  } catch {
    stop();
  }
}

ping();
timer = setInterval(ping, EVERY);
document.addEventListener("visibilitychange", ping);
