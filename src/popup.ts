import { GCPSettings, PrivacyMode } from './types';

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

/* ── Safe getElementById ── */
const $ = (id: string): HTMLElement | null => document.getElementById(id);

/* ── Element refs (all guarded — never crash if null) ── */
const SEG: Record<string, HTMLElement | null> = {
  namesMode: $('namesMode'),
  previewMode: $('previewMode'),
  avatarsMode: $('avatarsMode'),
  chatNamesMode: $('chatNamesMode'),
  chatMode: $('chatMode'),
  chatAvatarsMode: $('chatAvatarsMode'),
};

const TOGGLE: Record<string, HTMLInputElement | null> = {
  hoverReveal: $('hoverReveal') as HTMLInputElement | null,
  sidebar: $('sidebar') as HTMLInputElement | null,
  focusMode: $('focusMode') as HTMLInputElement | null,
  autoShareProtect: $('autoShareProtect') as HTMLInputElement | null,
  panic: $('panic') as HTMLInputElement | null,
};

const SLIDER: Record<string, HTMLInputElement | null> = {
  blurIntensity: $('blurIntensity') as HTMLInputElement | null,
  opacity: $('opacity') as HTMLInputElement | null,
};

const blurVal = $('blurVal');
const opacityVal = $('opacityVal');
const saveStatus = $('save-status');
const globalDot = $('global-dot');

/* ━━━━ SEG GROUP HELPERS ━━━━ */

function setSegActive(group: HTMLElement | null, val: PrivacyMode) {
  if (!group) return;
  group.querySelectorAll('.seg').forEach((btn) => {
    const element = btn as HTMLElement;
    element.classList.remove('active-blur', 'active-hide', 'active-off');
    if (element.dataset.val === val) {
      if (val === 'blur') element.classList.add('active-blur');
      if (val === 'hide') element.classList.add('active-hide');
      if (val === 'off') element.classList.add('active-off');
    }
  });
}

function getSegVal(group: HTMLElement | null): PrivacyMode {
  if (!group) return 'off';
  const activeBtn = group.querySelector('.seg.active-blur, .seg.active-hide') as HTMLElement | null;
  return (activeBtn?.dataset.val as PrivacyMode) ?? 'off';
}

/* ━━━━ LOAD ━━━━ */

chrome.storage.local.get(STORAGE_KEY, (result) => {
  if (chrome.runtime.lastError) return;

  const s: GCPSettings = { ...defaultSettings, ...(result[STORAGE_KEY] || {}) };

  setSegActive(SEG.namesMode, s.namesMode);
  setSegActive(SEG.previewMode, s.previewMode);
  setSegActive(SEG.avatarsMode, s.avatarsMode);
  setSegActive(SEG.chatNamesMode, s.chatNamesMode);
  setSegActive(SEG.chatMode, s.chatMode);
  setSegActive(SEG.chatAvatarsMode, s.chatAvatarsMode);

  if (TOGGLE.hoverReveal) TOGGLE.hoverReveal.checked = s.hoverReveal;
  if (TOGGLE.sidebar) TOGGLE.sidebar.checked = s.sidebarCollapse;
  if (TOGGLE.focusMode) TOGGLE.focusMode.checked = s.focusMode;
  if (TOGGLE.autoShareProtect) TOGGLE.autoShareProtect.checked = s.autoShareProtect;
  if (TOGGLE.panic) TOGGLE.panic.checked = s.panic;

  if (SLIDER.blurIntensity) SLIDER.blurIntensity.value = String(s.blurIntensity);
  if (SLIDER.opacity) SLIDER.opacity.value = String(s.opacity);

  syncUI(s);
});

/* ━━━━ SYNC VISUAL STATE ━━━━ */

function syncUI(s: GCPSettings) {
  if (blurVal) blurVal.textContent = `${s.blurIntensity}px`;
  if (opacityVal) opacityVal.textContent = `${s.opacity}%`;

  const anyPrivacy =
    s.namesMode !== 'off' ||
    s.previewMode !== 'off' ||
    s.avatarsMode !== 'off' ||
    s.chatNamesMode !== 'off' ||
    s.chatMode !== 'off' ||
    s.chatAvatarsMode !== 'off' ||
    s.panic;
  globalDot?.classList.toggle('off', !anyPrivacy);

  const rowMap = [
    { id: 'row-hoverReveal', val: s.hoverReveal },
    { id: 'row-sidebar', val: s.sidebarCollapse },
    { id: 'row-focusMode', val: s.focusMode },
    { id: 'row-autoShareProtect', val: s.autoShareProtect },
    { id: 'row-panic', val: s.panic },
  ];
  rowMap.forEach(({ id, val }) => $(id)?.classList.toggle('active', !!val));
}

/* ━━━━ SAVE ━━━━ */

let saveTimer: number;

function save() {
  const s: GCPSettings = {
    namesMode: getSegVal(SEG.namesMode),
    previewMode: getSegVal(SEG.previewMode),
    avatarsMode: getSegVal(SEG.avatarsMode),
    chatNamesMode: getSegVal(SEG.chatNamesMode),
    chatMode: getSegVal(SEG.chatMode),
    chatAvatarsMode: getSegVal(SEG.chatAvatarsMode),
    hoverReveal: TOGGLE.hoverReveal?.checked ?? defaultSettings.hoverReveal,
    sidebarCollapse: TOGGLE.sidebar?.checked ?? defaultSettings.sidebarCollapse,
    focusMode: TOGGLE.focusMode?.checked ?? defaultSettings.focusMode,
    autoShareProtect: TOGGLE.autoShareProtect?.checked ?? defaultSettings.autoShareProtect,
    panic: TOGGLE.panic?.checked ?? defaultSettings.panic,
    blurIntensity: Number(SLIDER.blurIntensity?.value ?? defaultSettings.blurIntensity),
    opacity: Number(SLIDER.opacity?.value ?? defaultSettings.opacity),
  };

  chrome.storage.local.set({ [STORAGE_KEY]: s });
  syncUI(s);

  if (saveStatus) {
    saveStatus.textContent = 'saved ✓';
    saveStatus.classList.add('saved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveStatus.textContent = 'ready';
      saveStatus.classList.remove('saved');
    }, 1200);
  }
}

/* ━━━━ EVENT LISTENERS ━━━━ */

// Seg groups
Object.values(SEG).forEach((group) => {
  if (!group) return;
  group.querySelectorAll('.seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSegActive(group, (btn as HTMLElement).dataset.val as PrivacyMode);
      save();
    });
  });
});

// Toggles
Object.values(TOGGLE).forEach((el) => {
  el?.addEventListener('change', save);
});

// Sliders
SLIDER.blurIntensity?.addEventListener('input', () => {
  if (blurVal && SLIDER.blurIntensity) blurVal.textContent = `${SLIDER.blurIntensity.value}px`;
  save();
});

SLIDER.opacity?.addEventListener('input', () => {
  if (opacityVal && SLIDER.opacity) opacityVal.textContent = `${SLIDER.opacity.value}%`;
  save();
});
