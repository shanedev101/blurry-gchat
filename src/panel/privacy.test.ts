/**
 * Integration tests for the extracted privacy controls. A minimal panel DOM is
 * built in jsdom; `initPrivacy` is then exercised end-to-end against the chrome
 * storage mock to prove load/apply, save-on-interaction, and two-way sync behave
 * exactly as before the extraction.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initPrivacy } from './privacy';
import { DEFAULT_SETTINGS, getSettings, setSettings } from '../core/storage';

const SEG_IDS = [
  'namesMode',
  'previewMode',
  'avatarsMode',
  'chatNamesMode',
  'chatMode',
  'chatAvatarsMode',
];

/** Build the subset of panel markup the privacy controls bind to. */
function buildPrivacyDom(): void {
  document.body.innerHTML = '';

  for (const id of SEG_IDS) {
    const group = document.createElement('div');
    group.className = 'seg-group';
    group.id = id;
    for (const val of ['off', 'blur', 'hide']) {
      const btn = document.createElement('button');
      btn.className = 'seg';
      btn.dataset.val = val;
      group.appendChild(btn);
    }
    document.body.appendChild(group);
  }

  for (const id of ['hoverReveal', 'autoShareProtect', 'panic']) {
    const row = document.createElement('div');
    row.id = `row-${id}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    row.appendChild(input);
    document.body.appendChild(row);
  }

  for (const id of ['blurIntensity', 'opacity']) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = id;
    slider.min = '1';
    slider.max = '90';
    document.body.appendChild(slider);
  }

  for (const id of ['blurVal', 'opacityVal', 'save-status', 'global-dot']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

const seg = (group: string, val: string): HTMLElement =>
  document.querySelector(`#${group} .seg[data-val="${val}"]`) as HTMLElement;
const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('initPrivacy', () => {
  it('applies persisted settings to the controls on load', async () => {
    // Arrange
    await setSettings({ ...DEFAULT_SETTINGS, namesMode: 'hide', panic: true });
    buildPrivacyDom();

    // Act
    initPrivacy();

    // Assert
    await vi.waitFor(() => {
      expect(seg('namesMode', 'hide').classList.contains('active-hide')).toBe(true);
      expect(input('panic').checked).toBe(true);
    });
  });

  it('persists the chosen mode when a segment is clicked', async () => {
    // Arrange
    buildPrivacyDom();
    initPrivacy();
    await vi.waitFor(() =>
      expect(seg('namesMode', 'blur').classList.contains('active-blur')).toBe(true)
    );

    // Act
    seg('avatarsMode', 'hide').click();

    // Assert
    const stored = await getSettings();
    expect(stored.avatarsMode).toBe('hide');
    expect(stored.namesMode).toBe('blur'); // unrelated control left intact
  });

  it('persists a toggle change', async () => {
    // Arrange
    buildPrivacyDom();
    initPrivacy();
    await vi.waitFor(() =>
      expect(seg('namesMode', 'blur').classList.contains('active-blur')).toBe(true)
    );

    // Act
    input('panic').checked = true;
    input('panic').dispatchEvent(new Event('change'));

    // Assert
    expect((await getSettings()).panic).toBe(true);
  });

  it('updates the slider label immediately and debounces the write', async () => {
    // Arrange
    buildPrivacyDom();
    initPrivacy();
    await vi.waitFor(() =>
      expect(seg('namesMode', 'blur').classList.contains('active-blur')).toBe(true)
    );

    // Act
    input('blurIntensity').value = '9';
    input('blurIntensity').dispatchEvent(new Event('input'));

    // Assert: label is instant, the storage write lands after the debounce.
    expect(document.getElementById('blurVal')?.textContent).toBe('9px');
    await vi.waitFor(async () => expect((await getSettings()).blurIntensity).toBe(9));
  });

  it('reflects external setting changes back into the controls', async () => {
    // Arrange
    buildPrivacyDom();
    initPrivacy();
    await vi.waitFor(() =>
      expect(seg('namesMode', 'blur').classList.contains('active-blur')).toBe(true)
    );

    // Act: simulate an in-page hotkey writing settings.
    await setSettings({ ...DEFAULT_SETTINGS, chatMode: 'blur' });

    // Assert
    await vi.waitFor(() =>
      expect(seg('chatMode', 'blur').classList.contains('active-blur')).toBe(true)
    );
  });
});
