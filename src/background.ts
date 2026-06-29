// background.ts - Service Worker
// Opens the side panel when the extension icon is clicked.
// Also detects when the Google Chat tab is being captured via Chrome's tabCapture API
// and notifies the content script.
//
// NOTE: tabCapture only fires for capture initiated by Chrome Extension APIs.
// It does NOT detect OS-level screen recording (OBS, macOS Screenshot) or
// browser-level screen share started by the user in a meeting - that uses
// navigator.mediaDevices.getDisplayMedia which is invisible to extensions.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.tabCapture.onStatusChanged.addListener((info) => {
  const isCapturing = info.status === 'active';

  if (info.tabId) {
    chrome.tabs
      .sendMessage(info.tabId, {
        type: 'GCP_SCREEN_SHARE',
        active: isCapturing,
      })
      .catch(() => {
        // Tab may not have content script loaded yet - ignore
      });
  }
});
