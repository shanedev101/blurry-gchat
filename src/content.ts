import { GCPSettings, PrivacyMode } from './types';

declare global {
  interface Window {
    __gcpTimeout?: number;
  }
}

const STORAGE_KEY = 'gcp-settings';

const defaultSettings: GCPSettings = {
  namesMode: 'blur',
  previewMode: 'blur',
  avatarsMode: 'off',
  chatNamesMode: 'off',
  chatMode: 'off',
  chatAvatarsMode: 'off',
  hoverReveal: true,
  sidebarCollapse: true,
  focusMode: false,
  autoShareProtect: false,
  panic: false,
  blurIntensity: 3,
  opacity: 55,
};

let settings: GCPSettings = { ...defaultSettings };
let preShareSnapshot: {
  namesMode: PrivacyMode;
  previewMode: PrivacyMode;
  avatarsMode: PrivacyMode;
} | null = null;

/* ══════════════════════════════════════════
   DOM TAGGER
   Broad selectors to cover sidebar items,
   thread items, and reply previews in Spaces.
   ══════════════════════════════════════════ */

// All possible container selectors for conversation / thread items
const ITEM_SELECTORS = [
  'nav [role="listitem"]',
  '[role="navigation"] [role="listitem"]',
  'span[role="listitem"]',
  '[role="treeitem"]', // thread/reply items in Spaces
  '[data-thread-id]', // thread containers
  '[data-member-id]', // DM items
  '[data-room-id]', // Space items
].join(', ');

function tagItem(item: HTMLElement) {
  if (item.dataset.gcpDone) return;
  item.dataset.gcpDone = '1';
  item.dataset.gcpItem = '1'; // parent marker used by hover CSS

  // Tag avatars — any img with a src inside the item
  item.querySelectorAll('img[src]').forEach((img) => {
    (img as HTMLElement).dataset.gcpEl = 'avatar';
  });

  // Collect leaf text nodes (no child elements, meaningful text)
  const leaves: HTMLElement[] = [];
  const walk = (el: HTMLElement, depth: number) => {
    if (depth > 7) return;
    for (const child of Array.from(el.children)) {
      const htmlChild = child as HTMLElement;
      if (htmlChild.tagName === 'IMG') continue;
      if (htmlChild.children.length === 0) {
        const text = htmlChild.textContent?.trim();
        if (text && text.length > 1) leaves.push(htmlChild);
      } else {
        walk(htmlChild, depth + 1);
      }
    }
  };
  walk(item, 0);

  // Filter out noise: badges, timestamps (very short or numeric-only)
  const meaningful = leaves.filter((el) => {
    const t = el.textContent?.trim() || '';
    return t.length > 2 && !/^\d+$/.test(t);
  });

  if (meaningful[0]) meaningful[0].dataset.gcpEl = 'name';
  for (let i = 1; i < meaningful.length; i++) {
    meaningful[i].dataset.gcpEl = 'preview';
  }
}

function tagAll() {
  document.querySelectorAll(ITEM_SELECTORS).forEach((el) => {
    tagItem(el as HTMLElement);
  });
}

function initObserver() {
  tagAll();
  // Observe full body — threads/panels can open anywhere
  const observer = new MutationObserver(tagAll);
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ══════════════════════════════════════════
   SELECTOR HEALTH CHECK
   Runs 5s after load. Detects when Google
   changes class names and logs a warning.
   Primary (stable) selectors checked first;
   if primary matches nothing, falls back to
   class-based and warns in console.
   ══════════════════════════════════════════ */

interface HealthCheckItem {
  label: string;
  primary: string;
  fallback: string | null;
  requires: string;
}

const HEALTH_CHECKS: HealthCheckItem[] = [
  {
    label: 'Chat message content',
    primary: '[jsname="bgckF"]',
    fallback: '.DTp27d',
    requires: '[data-is-message="true"]', // Only check when a chat is actually open
  },
  {
    label: 'Chat sender name',
    primary: '[data-gcp-el="name"]',
    fallback: '.njhDLd',
    requires: '[data-is-message="true"]',
  },
  {
    label: 'Chat avatar',
    primary: 'img[data-gcp-el="avatar"]',
    fallback: '.hy2WD',
    requires: '[data-is-message="true"]',
  },
  {
    label: 'Sidebar conversation name',
    primary: '.Vb5pDe',
    fallback: null,
    requires: 'nav, [role="navigation"]', // Only check if sidebar exists
  },
  {
    label: 'Sidebar message preview',
    primary: '.rHUJK',
    fallback: null,
    requires: 'nav, [role="navigation"]',
  },
];

function runHealthCheck() {
  let allOk = true;
  let checksRun = 0;

  for (const check of HEALTH_CHECKS) {
    // Skip checking if the required UI context is not yet loaded/rendered
    if (check.requires && !document.querySelector(check.requires)) {
      continue;
    }

    checksRun++;
    const primaryHits = document.querySelectorAll(check.primary).length;
    if (primaryHits > 0) continue; // stable selector working

    if (check.fallback) {
      const fallbackHits = document.querySelectorAll(check.fallback).length;
      if (fallbackHits > 0) {
        // Primary gone, fallback still works
        console.warn(
          `[Blurry GChat] Selector degraded — "${check.label}": primary (${check.primary}) missing, fallback (${check.fallback}) active.`
        );
      } else {
        // Both gone
        console.error(
          `[Blurry GChat] ⚠ Selector BROKEN — "${check.label}": both primary and fallback return 0 matches. Google may have updated its DOM.`
        );
        allOk = false;
      }
    } else {
      console.warn(
        `[Blurry GChat] Selector miss — "${check.label}": ${check.primary} returned 0 matches. May need update.`
      );
    }
  }

  if (checksRun > 0 && allOk) {
    console.info(
      `[Blurry GChat] Selector health check passed (${checksRun} active controls validated).`
    );
  }
}

/* ══════════════════════════════════════════
   APPLY SETTINGS
   ══════════════════════════════════════════ */

function applySettings() {
  const b = document.body;
  const r = document.documentElement;

  r.style.setProperty('--gcp-blur', `${settings.blurIntensity}px`);
  r.style.setProperty('--gcp-opacity', String(settings.opacity / 100));

  b.classList.toggle('gcp-names-blur', settings.namesMode === 'blur');
  b.classList.toggle('gcp-names-hide', settings.namesMode === 'hide');
  b.classList.toggle('gcp-preview-blur', settings.previewMode === 'blur');
  b.classList.toggle('gcp-preview-hide', settings.previewMode === 'hide');
  b.classList.toggle('gcp-avatars-blur', settings.avatarsMode === 'blur');
  b.classList.toggle('gcp-avatars-hide', settings.avatarsMode === 'hide');
  b.classList.toggle('gcp-chat-names-blur', settings.chatNamesMode === 'blur');
  b.classList.toggle('gcp-chat-names-hide', settings.chatNamesMode === 'hide');
  b.classList.toggle('gcp-chat-blur', settings.chatMode === 'blur');
  b.classList.toggle('gcp-chat-hide', settings.chatMode === 'hide');
  b.classList.toggle('gcp-chat-avatars-blur', settings.chatAvatarsMode === 'blur');
  b.classList.toggle('gcp-chat-avatars-hide', settings.chatAvatarsMode === 'hide');

  b.classList.toggle('gcp-hover-reveal', settings.hoverReveal);
  b.classList.toggle('gcp-sidebar-collapse', settings.sidebarCollapse);
  b.classList.toggle('gcp-focus', settings.focusMode);
  b.classList.toggle('gcp-panic', settings.panic);

  showIndicator();
}

/* ══════════════════════════════════════════
   INDICATOR
   ══════════════════════════════════════════ */

function showIndicator() {
  let el = document.getElementById('gcp-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gcp-indicator';
    document.body.appendChild(el);
  }

  if (settings.panic) {
    el.textContent = '😱 PANIC MODE';
    el.className = 'panic';
  } else {
    const parts = [];
    if (settings.namesMode !== 'off') parts.push(`names:${settings.namesMode}`);
    if (settings.previewMode !== 'off') parts.push(`msg:${settings.previewMode}`);
    if (settings.avatarsMode !== 'off') parts.push(`avatar:${settings.avatarsMode}`);
    el.textContent = parts.length ? `🛡 ${parts.join(' · ')}` : '👀 privacy OFF';
    el.className = '';
  }

  el.classList.add('show');
  if (window.__gcpTimeout) {
    clearTimeout(window.__gcpTimeout);
  }
  window.__gcpTimeout = setTimeout(() => el?.classList.remove('show'), 2000);
}

/* ══════════════════════════════════════════
   LOAD & SYNC
   ══════════════════════════════════════════ */

function persist() {
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
  applySettings();
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  settings = { ...defaultSettings, ...(result[STORAGE_KEY] || {}) };
  applySettings();
  initObserver();
  // Run health check after 5s to let Google Chat fully render
  setTimeout(runHealthCheck, 5000);
});

chrome.storage.onChanged.addListener(() => {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    settings = { ...defaultSettings, ...(result[STORAGE_KEY] || {}) };
    applySettings();
  });
});

/* ══════════════════════════════════════════
   SCREEN SHARE AUTO-PROTECT
   ══════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'GCP_SCREEN_SHARE') return;

  if (msg.active && settings.autoShareProtect) {
    preShareSnapshot = {
      namesMode: settings.namesMode,
      previewMode: settings.previewMode,
      avatarsMode: settings.avatarsMode,
    };
    settings.namesMode = 'blur';
    settings.previewMode = 'blur';
    settings.avatarsMode = 'blur';
    applySettings();
  } else if (!msg.active && preShareSnapshot) {
    Object.assign(settings, preShareSnapshot);
    preShareSnapshot = null;
    applySettings();
  }
});

/* ══════════════════════════════════════════
   HOTKEYS
   ══════════════════════════════════════════ */

document.addEventListener('keydown', (e) => {
  if (!e.metaKey || !e.shiftKey) return;
  const k = e.key.toLowerCase();

  if (k === 'p') {
    settings.panic = !settings.panic;
    persist();
  }
  if (k === 'l') {
    const cycle: Record<PrivacyMode, PrivacyMode> = { off: 'blur', blur: 'hide', hide: 'off' };
    settings.namesMode = cycle[settings.namesMode] ?? 'blur';
    persist();
  }
  if (k === 'f') {
    settings.focusMode = !settings.focusMode;
    persist();
  }
});
