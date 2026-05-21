/**
 * background.ts — Service Worker
 * Detects when the Google Chat tab is being screen-captured
 * and notifies the content script.
 */

chrome.tabCapture.onStatusChanged.addListener((info) => {
  const isCapturing = info.status === 'active';

  if (info.tabId) {
    chrome.tabs
      .sendMessage(info.tabId, {
        type: 'GCP_SCREEN_SHARE',
        active: isCapturing,
      })
      .catch(() => {
        // Tab may not have content script loaded yet — ignore
      });
  }
});
