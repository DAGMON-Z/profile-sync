// Added only to sites where you turned on automatic updates. It tells the
// background part that the page is open (and again every few minutes while
// it's in front); the background part then reads your stats from it.

const EVERY = 3 * 60 * 1000;

function ping() {
  if (document.visibilityState === "visible") chrome.runtime.sendMessage({ type: "page-open" }).catch(() => {});
}

ping();
setInterval(ping, EVERY);
document.addEventListener("visibilitychange", ping);
