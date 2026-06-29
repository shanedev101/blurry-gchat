/**
 * Backup section UI wiring for the side panel.
 *
 * Connects the EXPORT / IMPORT controls to the pure backup logic in
 * `features/backup.ts`: export downloads a JSON bundle; import reads a chosen
 * file, confirms the destructive action, restores it, and reports status. All
 * validation and storage work lives in the feature module, so this file only
 * deals with the DOM, the file dialog, and the download.
 */

import {
  backupFilename,
  exportAll,
  importFromText,
  resetAll,
  serializeBackup,
} from '../features/backup';

/**
 * Wire the backup controls.
 *
 * @param root Scope containing the backup markup. Defaults to `document`.
 */
export function initBackup(root: ParentNode = document): void {
  const exportBtn = root.querySelector<HTMLButtonElement>('#backup-export');
  const importBtn = root.querySelector<HTMLButtonElement>('#backup-import');
  const fileInput = root.querySelector<HTMLInputElement>('#backup-file');
  const status = root.querySelector<HTMLElement>('#backup-status');

  const setStatus = (message: string, ok = true): void => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('saved', ok);
    status.classList.toggle('err', !ok);
  };

  exportBtn?.addEventListener('click', async () => {
    try {
      const json = serializeBackup(await exportAll());
      downloadJson(json, backupFilename());
      setStatus('exported ✓');
    } catch {
      setStatus('export failed', false);
    }
  });

  importBtn?.addEventListener('click', () => fileInput?.click());

  // --- CLEAR ALL (destructive reset, guarded by a modal) ---
  const resetBtn = root.querySelector<HTMLButtonElement>('#backup-reset');
  const resetModal = root.querySelector<HTMLElement>('#reset-modal');
  const resetOk = root.querySelector<HTMLElement>('#reset-ok');
  const resetCancel = root.querySelector<HTMLElement>('#reset-cancel');

  resetBtn?.addEventListener('click', () => resetModal?.removeAttribute('hidden'));
  resetCancel?.addEventListener('click', () => resetModal?.setAttribute('hidden', ''));
  resetOk?.addEventListener('click', async () => {
    resetModal?.setAttribute('hidden', '');
    try {
      await resetAll();
      setStatus('all data cleared ✓');
    } catch {
      setStatus('clear failed', false);
    }
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    // Import overwrites current state, so confirm before proceeding.
    if (!confirm('Import will overwrite current settings, layout, and threads. Continue?')) {
      fileInput.value = '';
      return;
    }
    try {
      await importFromText(await file.text());
      setStatus('imported ✓');
    } catch (error) {
      setStatus(`import failed: ${(error as Error).message}`, false);
    } finally {
      fileInput.value = '';
    }
  });
}

/** Trigger a browser download of `json` under `filename`. */
function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
