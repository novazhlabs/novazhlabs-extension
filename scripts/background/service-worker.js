/**
 * Service worker — minimal MV3 worker.
 *
 * Responsibilities:
 *  - Open the new tab page on first install.
 *  - Resolve favicons for the shortcut manager (the page itself also resolves
 *    them directly, this is a fallback channel).
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'chrome://newtab/' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_FAVICON') {
    resolveFavicon(message.url)
      .then((iconUrl) => sendResponse({ iconUrl }))
      .catch(() => sendResponse({ iconUrl: null }));
    return true;
  }
});

function resolveFavicon(url) {
  try {
    const urlObj = new URL(url);
    return Promise.resolve(
      `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`
    );
  } catch {
    return Promise.resolve(null);
  }
}
