/**
 * Tests for the master on/off switch: enabling is immediate, disabling requires
 * confirming the modal, cancel reverts, and the switch tracks external changes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initPower } from './power';
import { DEFAULT_SETTINGS, getSettings, setSettings } from '../core/storage';

/** Build the header switch + confirm modal markup. */
function buildMarkup(): void {
  document.body.className = '';
  document.body.innerHTML = `
    <input type="checkbox" id="master-toggle" checked />
    <span id="master-label">ON</span>
    <div class="modal-overlay" id="confirm-modal" hidden>
      <button id="confirm-cancel"></button>
      <button id="confirm-ok"></button>
    </div>`;
}

const toggle = (): HTMLInputElement => document.getElementById('master-toggle') as HTMLInputElement;
const modal = (): HTMLElement => document.getElementById('confirm-modal') as HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('initPower disabling', () => {
  it('asks for confirmation before disabling and does not change settings yet', async () => {
    // Arrange
    buildMarkup();
    initPower(document);

    // Act: attempt to switch off
    toggle().checked = false;
    toggle().dispatchEvent(new Event('change'));

    // Assert: modal shown, switch reverted to on, settings untouched
    expect(modal().hasAttribute('hidden')).toBe(false);
    expect(toggle().checked).toBe(true);
    expect((await getSettings()).enabled).toBe(true);
  });

  it('disables after confirming and dims the panel', async () => {
    // Arrange
    buildMarkup();
    initPower(document);
    toggle().checked = false;
    toggle().dispatchEvent(new Event('change'));

    // Act
    (document.getElementById('confirm-ok') as HTMLElement).click();

    // Assert
    await vi.waitFor(async () => {
      expect((await getSettings()).enabled).toBe(false);
    });
    expect(modal().hasAttribute('hidden')).toBe(true);
    expect(document.body.classList.contains('panel-disabled')).toBe(true);
    expect(document.getElementById('master-label')?.textContent).toBe('OFF');
  });

  it('keeps the extension enabled when the user cancels', async () => {
    // Arrange
    buildMarkup();
    initPower(document);
    toggle().checked = false;
    toggle().dispatchEvent(new Event('change'));

    // Act
    (document.getElementById('confirm-cancel') as HTMLElement).click();

    // Assert
    expect(modal().hasAttribute('hidden')).toBe(true);
    expect(toggle().checked).toBe(true);
    expect((await getSettings()).enabled).toBe(true);
  });
});

describe('initPower enabling', () => {
  it('re-enables immediately without a modal', async () => {
    // Arrange: start disabled
    await setSettings({ ...DEFAULT_SETTINGS, enabled: false });
    buildMarkup();
    initPower(document);
    await vi.waitFor(() => expect(toggle().checked).toBe(false));

    // Act
    toggle().checked = true;
    toggle().dispatchEvent(new Event('change'));

    // Assert
    await vi.waitFor(async () => expect((await getSettings()).enabled).toBe(true));
    expect(modal().hasAttribute('hidden')).toBe(true);
  });
});

describe('initPower external sync', () => {
  it('reflects an enabled change made elsewhere', async () => {
    // Arrange
    buildMarkup();
    initPower(document);
    await vi.waitFor(() => expect(toggle().checked).toBe(true));

    // Act
    await setSettings({ ...DEFAULT_SETTINGS, enabled: false });

    // Assert
    await vi.waitFor(() => expect(toggle().checked).toBe(false));
  });
});
