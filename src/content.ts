import { GCPSettings, PrivacyMode } from './types';
import { decorateItem, initInject, setInjectionEnabled } from './content/inject';

const STORAGE_KEY = 'gcp-settings';

const defaultSettings: GCPSettings = {
  enabled: true,
  namesMode: 'blur',
  previewMode: 'blur',
  avatarsMode: 'off',
  chatNamesMode: 'off',
  chatMode: 'off',
  chatAvatarsMode: 'off',
  hoverReveal: true,
  autoShareProtect: false,
  panic: false,
  blurIntensity: 3,
  opacity: 55,
};

let settings: GCPSettings = { ...defaultSettings };

// Snapshot includes all fields that autoShareProtect temporarily overrides
let preShareSnapshot: {
  namesMode: PrivacyMode;
  previewMode: PrivacyMode;
  avatarsMode: PrivacyMode;
  chatNamesMode: PrivacyMode;
  chatMode: PrivacyMode;
} | null = null;

let indicatorTimer: ReturnType<typeof setTimeout> | null = null;
let observerDebounce: ReturnType<typeof setTimeout> | null = null;

// --- DOM TAGGER ---
// Tags sidebar list items with [data-gcp-el] attributes so CSS can use them as
// stable fallback selectors when Google changes their class names.

const ITEM_SELECTORS = [
  'nav [role="listitem"]',
  '[role="navigation"] [role="listitem"]',
  'span[role="listitem"]',
  '[role="treeitem"]',
  '[data-thread-id]',
  '[data-member-id]',
  '[data-room-id]',
].join(', ');

// Material Symbols / Material Icons render a ligature string as a glyph, and
// `aria-hidden` marks elements as decorative. Such text is not a real name.
const ICON_CLASS_RE = /\b(google-symbols|google-material-icons|material-icons)\b/;

/** True for icon-font glyphs, decorative nodes, and our own injected elements. */
function isNonContent(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const cls = el.getAttribute('class') || '';
  return ICON_CLASS_RE.test(cls) || /\bgcp-/.test(cls);
}

function tagItem(item: HTMLElement) {
  if (item.dataset.gcpDone) return;
  item.dataset.gcpDone = '1';

  item.querySelectorAll('img[src]').forEach((img) => {
    (img as HTMLElement).dataset.gcpEl = 'avatar';
  });

  const leaves: HTMLElement[] = [];
  const walk = (el: HTMLElement, depth: number) => {
    if (depth > 7) return;
    for (const child of Array.from(el.children)) {
      const htmlChild = child as HTMLElement;
      if (htmlChild.tagName === 'IMG') continue;
      // Skip icon-font glyphs and our own injected nodes: a Material Symbols
      // <i> renders its text as an ICON (e.g. "spool"), so treating it as the
      // conversation name would mis-place the alias/name onto the thread icon.
      if (isNonContent(htmlChild)) continue;
      if (htmlChild.children.length === 0) {
        const text = htmlChild.textContent?.trim();
        if (text && text.length > 1) leaves.push(htmlChild);
      } else {
        walk(htmlChild, depth + 1);
      }
    }
  };
  walk(item, 0);

  const meaningful = leaves.filter((el) => {
    const t = el.textContent?.trim() || '';
    return t.length > 2 && !/^\d+$/.test(t);
  });

  if (meaningful[0]) meaningful[0].dataset.gcpEl = 'name';
  for (let i = 1; i < meaningful.length; i++) {
    meaningful[i].dataset.gcpEl = 'preview';
  }

  // Now that the item is tagged (name element exists), layer on the Unflow
  // toolbar / alias / badges. Decoration is idempotent and guarded internally.
  decorateItem(item);
}

function tagAll() {
  document.querySelectorAll(ITEM_SELECTORS).forEach((el) => {
    tagItem(el as HTMLElement);
  });
}

function initObserver() {
  tagAll();
  // Debounce to max once per 150ms - Google Chat has very frequent DOM mutations
  const observer = new MutationObserver(() => {
    if (observerDebounce) clearTimeout(observerDebounce);
    observerDebounce = setTimeout(tagAll, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- SELECTOR HEALTH CHECK ---
// Runs 5s after load. Detects when Google changes class names and logs a warning.
// Primary (stable) selectors checked first; if primary matches nothing, falls back
// to class-based and warns in console.

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
    requires: '[data-is-message="true"]',
  },
  {
    label: 'Chat sender name',
    primary: '.njhDLd',
    fallback: null,
    requires: '[data-is-message="true"]',
  },
  {
    label: 'Chat avatar',
    primary: '.hy2WD',
    fallback: null,
    requires: '[data-is-message="true"]',
  },
  {
    label: 'Sidebar conversation name',
    primary: '.Vb5pDe',
    fallback: null,
    requires: 'nav, [role="navigation"]',
  },
  {
    label: 'Sidebar message preview',
    primary: '.rHUJK',
    fallback: null,
    requires: 'nav, [role="navigation"]',
  },
];

function runHealthCheck() {
  let issues = 0;
  let checksRun = 0;

  for (const check of HEALTH_CHECKS) {
    if (check.requires && !document.querySelector(check.requires)) continue;

    checksRun++;
    const primaryHits = document.querySelectorAll(check.primary).length;
    if (primaryHits > 0) continue;

    issues++;
    if (check.fallback) {
      const fallbackHits = document.querySelectorAll(check.fallback).length;
      if (fallbackHits > 0) {
        console.warn(
          `[Shroudly] Selector degraded - "${check.label}": primary (${check.primary}) missing, fallback (${check.fallback}) active.`
        );
      } else {
        console.error(
          `[Shroudly] Selector BROKEN - "${check.label}": both primary and fallback return 0 matches. Google may have updated its DOM.`
        );
      }
    } else {
      console.warn(
        `[Shroudly] Selector miss - "${check.label}": ${check.primary} returned 0 matches. May need update.`
      );
    }
  }

  if (checksRun > 0 && issues === 0) {
    console.info(`[Shroudly] Selector health check passed (${checksRun} checks).`);
  }
}

// --- APPLY SETTINGS ---

function applySettings() {
  const b = document.body;
  const r = document.documentElement;

  // Master switch: when off, the extension applies nothing. Every privacy class
  // is gated by `on`, and the in-page Unflow decoration is torn down.
  const on = settings.enabled;
  b.classList.toggle('gcp-disabled', !on);
  setInjectionEnabled(on);

  r.style.setProperty('--gcp-blur', `${settings.blurIntensity}px`);
  r.style.setProperty('--gcp-opacity', String(settings.opacity / 100));

  b.classList.toggle('gcp-names-blur', on && settings.namesMode === 'blur');
  b.classList.toggle('gcp-names-hide', on && settings.namesMode === 'hide');
  b.classList.toggle('gcp-preview-blur', on && settings.previewMode === 'blur');
  b.classList.toggle('gcp-preview-hide', on && settings.previewMode === 'hide');
  b.classList.toggle('gcp-avatars-blur', on && settings.avatarsMode === 'blur');
  b.classList.toggle('gcp-avatars-hide', on && settings.avatarsMode === 'hide');
  b.classList.toggle('gcp-chat-names-blur', on && settings.chatNamesMode === 'blur');
  b.classList.toggle('gcp-chat-names-hide', on && settings.chatNamesMode === 'hide');
  b.classList.toggle('gcp-chat-blur', on && settings.chatMode === 'blur');
  b.classList.toggle('gcp-chat-hide', on && settings.chatMode === 'hide');
  b.classList.toggle('gcp-chat-avatars-blur', on && settings.chatAvatarsMode === 'blur');
  b.classList.toggle('gcp-chat-avatars-hide', on && settings.chatAvatarsMode === 'hide');

  // When panic is on, suppress hover-reveal so it cannot override panic blur via CSS specificity
  b.classList.toggle('gcp-hover-reveal', on && settings.hoverReveal && !settings.panic);
  b.classList.toggle('gcp-panic', on && settings.panic);

  showIndicator();
}

// --- INDICATOR ---

function showIndicator() {
  let el = document.getElementById('gcp-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gcp-indicator';
    document.body.appendChild(el);
  }

  if (!settings.enabled) {
    el.textContent = '[x] SHROUDLY OFF';
    el.className = '';
  } else if (settings.panic) {
    el.textContent = '[!] PANIC MODE';
    el.className = 'panic';
  } else {
    const parts: string[] = [];
    if (settings.namesMode !== 'off') parts.push(`names:${settings.namesMode}`);
    if (settings.previewMode !== 'off') parts.push(`msg:${settings.previewMode}`);
    if (settings.avatarsMode !== 'off') parts.push(`avatar:${settings.avatarsMode}`);
    el.textContent = parts.length ? `[*] ${parts.join(' · ')}` : '[-] privacy OFF';
    el.className = '';
  }

  el.classList.add('show');
  if (indicatorTimer) clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => el?.classList.remove('show'), 2000);
}

// --- LOAD & SYNC ---

function persist() {
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
  applySettings();
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  settings = { ...defaultSettings, ...(result[STORAGE_KEY] || {}) };
  applySettings();
  initObserver();
  void initInject();
  setTimeout(runHealthCheck, 5000);
});

chrome.storage.onChanged.addListener((changes) => {
  // Ignore changes from other extensions or unrelated keys
  if (!changes[STORAGE_KEY]) return;
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    settings = { ...defaultSettings, ...(result[STORAGE_KEY] || {}) };
    applySettings();
  });
});

// --- SCREEN SHARE AUTO-PROTECT ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'GCP_SCREEN_SHARE') return;

  if (msg.active && settings.autoShareProtect) {
    preShareSnapshot = {
      namesMode: settings.namesMode,
      previewMode: settings.previewMode,
      avatarsMode: settings.avatarsMode,
      chatNamesMode: settings.chatNamesMode,
      chatMode: settings.chatMode,
    };
    settings.namesMode = 'blur';
    settings.previewMode = 'blur';
    settings.avatarsMode = 'blur';
    settings.chatNamesMode = 'blur';
    settings.chatMode = 'blur';
    applySettings();
  } else if (!msg.active && preShareSnapshot) {
    Object.assign(settings, preShareSnapshot);
    preShareSnapshot = null;
    applySettings();
  }
});

// --- HOTKEYS ---

document.addEventListener('keydown', (e) => {
  // Support both Cmd (Mac) and Ctrl (Windows/Linux)
  if ((!e.metaKey && !e.ctrlKey) || !e.shiftKey) return;
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
});
