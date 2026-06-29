/**
 * Privacy controls for the side panel.
 *
 * This module owns the original privacy UI: the six 3-state segmented controls
 * (sidebar + open-chat names/messages/avatars), the hover-reveal / screen-share
 * / panic toggles, and the blur/opacity sliders. It reads and writes the
 * `gcp-settings` key through the typed storage layer and mirrors external changes
 * (e.g. in-page hotkeys) back into the controls.
 *
 * Behavior is intentionally identical to the previous inline implementation in
 * `popup.ts`; this is a structural extraction (UI separated into its own module),
 * not a behavior change.
 */

import type { GCPSettings, PrivacyMode } from '../types';
import {
  DEFAULT_SETTINGS,
  getSettings,
  onKeyChanged,
  setSettings,
  STORAGE_KEYS,
} from '../core/storage';

/** Debounced write window for slider drags, so storage is not hammered per pixel. */
const SLIDER_DEBOUNCE_MS = 150;
/** How long the "saved" status stays lit before reverting to "ready". */
const SAVED_STATUS_MS = 1200;

/**
 * Wire up the privacy controls: load persisted settings into the UI, persist on
 * change, and keep the UI in sync when settings change elsewhere.
 *
 * Safe to call once after the panel DOM exists. All element lookups are guarded,
 * so a missing control never throws.
 */
export function initPrivacy(): void {
  const $ = (id: string): HTMLElement | null => document.getElementById(id);

  // Element refs (all guarded - never crash if null).
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

  // The master `enabled` flag is owned by power.ts but lives in the same
  // settings object, so we track it here to avoid clobbering it on save.
  let masterEnabled = DEFAULT_SETTINGS.enabled;

  // --- SEG GROUP HELPERS ---

  const setSegActive = (group: HTMLElement | null, val: PrivacyMode): void => {
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
  };

  const getSegVal = (group: HTMLElement | null): PrivacyMode => {
    if (!group) return 'off';
    const activeBtn = group.querySelector(
      '.seg.active-blur, .seg.active-hide'
    ) as HTMLElement | null;
    return (activeBtn?.dataset.val as PrivacyMode) ?? 'off';
  };

  // --- SYNC VISUAL STATE ---

  const syncUI = (s: GCPSettings): void => {
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
      { id: 'row-autoShareProtect', val: s.autoShareProtect },
      { id: 'row-panic', val: s.panic },
    ];
    rowMap.forEach(({ id, val }) => $(id)?.classList.toggle('active', !!val));
  };

  const applyToUI = (s: GCPSettings): void => {
    masterEnabled = s.enabled;
    setSegActive(SEG.namesMode, s.namesMode);
    setSegActive(SEG.previewMode, s.previewMode);
    setSegActive(SEG.avatarsMode, s.avatarsMode);
    setSegActive(SEG.chatNamesMode, s.chatNamesMode);
    setSegActive(SEG.chatMode, s.chatMode);
    setSegActive(SEG.chatAvatarsMode, s.chatAvatarsMode);

    if (TOGGLE.hoverReveal) TOGGLE.hoverReveal.checked = s.hoverReveal;
    if (TOGGLE.autoShareProtect) TOGGLE.autoShareProtect.checked = s.autoShareProtect;
    if (TOGGLE.panic) TOGGLE.panic.checked = s.panic;

    if (SLIDER.blurIntensity) SLIDER.blurIntensity.value = String(s.blurIntensity);
    if (SLIDER.opacity) SLIDER.opacity.value = String(s.opacity);

    syncUI(s);
  };

  // --- LOAD & EXTERNAL SYNC ---

  void getSettings().then(applyToUI);

  // Reflect changes made elsewhere (in-page hotkeys, a second open panel).
  onKeyChanged(STORAGE_KEYS.settings, () => {
    void getSettings().then(applyToUI);
  });

  // --- SAVE ---

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let sliderSaveTimer: ReturnType<typeof setTimeout> | null = null;

  const save = (): void => {
    const s: GCPSettings = {
      enabled: masterEnabled,
      namesMode: getSegVal(SEG.namesMode),
      previewMode: getSegVal(SEG.previewMode),
      avatarsMode: getSegVal(SEG.avatarsMode),
      chatNamesMode: getSegVal(SEG.chatNamesMode),
      chatMode: getSegVal(SEG.chatMode),
      chatAvatarsMode: getSegVal(SEG.chatAvatarsMode),
      hoverReveal: TOGGLE.hoverReveal?.checked ?? DEFAULT_SETTINGS.hoverReveal,
      autoShareProtect: TOGGLE.autoShareProtect?.checked ?? DEFAULT_SETTINGS.autoShareProtect,
      panic: TOGGLE.panic?.checked ?? DEFAULT_SETTINGS.panic,
      blurIntensity: Number(SLIDER.blurIntensity?.value ?? DEFAULT_SETTINGS.blurIntensity),
      opacity: Number(SLIDER.opacity?.value ?? DEFAULT_SETTINGS.opacity),
    };

    void setSettings(s);
    syncUI(s);

    if (saveStatus) {
      saveStatus.textContent = 'saved ✓';
      saveStatus.classList.add('saved');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveStatus.textContent = 'ready';
        saveStatus.classList.remove('saved');
      }, SAVED_STATUS_MS);
    }
  };

  // Slider changes update the label immediately but debounce the storage write.
  const saveSlider = (): void => {
    if (sliderSaveTimer) clearTimeout(sliderSaveTimer);
    sliderSaveTimer = setTimeout(save, SLIDER_DEBOUNCE_MS);
  };

  // --- EVENT LISTENERS ---

  Object.values(SEG).forEach((group) => {
    if (!group) return;
    group.querySelectorAll('.seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSegActive(group, (btn as HTMLElement).dataset.val as PrivacyMode);
        save();
      });
    });
  });

  Object.values(TOGGLE).forEach((el) => {
    el?.addEventListener('change', save);
  });

  SLIDER.blurIntensity?.addEventListener('input', () => {
    if (blurVal && SLIDER.blurIntensity) blurVal.textContent = `${SLIDER.blurIntensity.value}px`;
    saveSlider();
  });

  SLIDER.opacity?.addEventListener('input', () => {
    if (opacityVal && SLIDER.opacity) opacityVal.textContent = `${SLIDER.opacity.value}%`;
    saveSlider();
  });
}
