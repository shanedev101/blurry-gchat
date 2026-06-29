/**
 * Tests for the backup UI wiring: export triggers a download and reports status;
 * import confirms, restores a valid file, and surfaces errors for a bad file.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initBackup } from './backup';
import {
  DEFAULT_SETTINGS,
  getSettings,
  getThreads,
  setSettings,
  setThreads,
} from '../core/storage';

/** Build the backup section markup the controller binds to. */
function buildMarkup(): void {
  document.body.innerHTML = `
    <button id="backup-export"></button>
    <button id="backup-import"></button>
    <input id="backup-file" type="file" />
    <button id="backup-reset"></button>
    <div id="backup-status"></div>
    <div id="reset-modal" hidden>
      <button id="reset-cancel"></button>
      <button id="reset-ok"></button>
    </div>`;
}

/** Attach a file to the (read-only) input and fire change. */
function setFile(json: string): void {
  const input = document.getElementById('backup-file') as HTMLInputElement;
  const file = new File([json], 'backup.json', { type: 'application/json' });
  // jsdom's File does not implement Blob.text(); browsers do. Polyfill for the test.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(json), configurable: true });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom does not implement object URLs; stub them for the download path.
  (URL.createObjectURL as unknown) = vi.fn(() => 'blob:stub');
  (URL.revokeObjectURL as unknown) = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initBackup export', () => {
  it('builds a download and reports exported status', async () => {
    // Arrange
    buildMarkup();
    initBackup(document);

    // Act
    (document.getElementById('backup-export') as HTMLElement).click();

    // Assert
    await vi.waitFor(() => {
      expect(document.getElementById('backup-status')?.textContent).toBe('exported ✓');
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});

describe('initBackup import', () => {
  it('restores a valid file after confirmation', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    buildMarkup();
    initBackup(document);
    const bundle = JSON.stringify({
      app: 'shroudly',
      version: 1,
      exportedAt: 0,
      data: { settings: { ...DEFAULT_SETTINGS, opacity: 80 } },
    });

    // Act
    setFile(bundle);

    // Assert
    await vi.waitFor(async () => {
      expect(document.getElementById('backup-status')?.textContent).toBe('imported ✓');
      expect((await getSettings()).opacity).toBe(80);
    });
  });

  it('reports an error for an invalid file and leaves data intact', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    buildMarkup();
    initBackup(document);

    // Act
    setFile('{ not valid json');

    // Assert
    await vi.waitFor(() => {
      expect(document.getElementById('backup-status')?.textContent).toContain('import failed');
    });
  });

  it('does nothing when the user cancels the import confirmation', async () => {
    // Arrange
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    buildMarkup();
    initBackup(document);

    // Act
    setFile(JSON.stringify({ app: 'shroudly', version: 1, exportedAt: 0, data: {} }));

    // Assert: status stays empty (handler returned before importing).
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('backup-status')?.textContent).toBe('');
  });
});

describe('initBackup clear all', () => {
  it('opens a confirm modal and resets everything when confirmed', async () => {
    // Arrange
    await setSettings({ ...DEFAULT_SETTINGS, panic: true });
    await setThreads({
      r1: { threadId: 'r1', pinned: true, following: false, tags: [], updatedAt: 1 },
    });
    buildMarkup();
    initBackup(document);

    // Act: open the reset modal, then confirm
    (document.getElementById('backup-reset') as HTMLElement).click();
    expect(document.getElementById('reset-modal')?.hasAttribute('hidden')).toBe(false);
    (document.getElementById('reset-ok') as HTMLElement).click();

    // Assert
    await vi.waitFor(async () => {
      expect((await getSettings()).panic).toBe(false);
      expect(await getThreads()).toEqual({});
    });
    expect(document.getElementById('reset-modal')?.hasAttribute('hidden')).toBe(true);
  });

  it('does nothing when the reset is cancelled', async () => {
    // Arrange
    await setThreads({
      r1: { threadId: 'r1', pinned: true, following: false, tags: [], updatedAt: 1 },
    });
    buildMarkup();
    initBackup(document);

    // Act
    (document.getElementById('backup-reset') as HTMLElement).click();
    (document.getElementById('reset-cancel') as HTMLElement).click();

    // Assert: modal closed, data intact
    expect(document.getElementById('reset-modal')?.hasAttribute('hidden')).toBe(true);
    expect(await getThreads()).toHaveProperty('r1');
  });
});
