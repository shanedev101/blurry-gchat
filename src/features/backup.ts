/**
 * Backup / restore logic: bundle all persisted state into a portable JSON file
 * and restore it on another machine or browser.
 *
 * This module is pure data logic (no DOM, no file I/O) so it is fully
 * unit-testable; the side panel's `panel/backup.ts` wires it to the actual
 * download/upload affordances.
 *
 * Restore is deliberately defensive: it validates the envelope, runs each slice
 * through the same normalizers as a storage read, and skips any missing slice so
 * a partial bundle never wipes existing data.
 */

import type { BackupFile } from '../types';
import {
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
  getLayout,
  getSettings,
  getThreads,
  migrateLayout,
  migrateSettings,
  migrateThreads,
  setLayout,
  setSettings,
  setThreads,
} from '../core/storage';

/** Bundle schema versions this build can import. */
export const SUPPORTED_BACKUP_VERSIONS = [1];
/** Version stamped onto bundles this build exports. */
export const CURRENT_BACKUP_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read all three storage keys into a versioned, self-describing bundle.
 *
 * @returns A {@link BackupFile} ready to serialize and download.
 */
export async function exportAll(): Promise<BackupFile> {
  const [settings, layout, threads] = await Promise.all([getSettings(), getLayout(), getThreads()]);
  return {
    app: 'shroudly',
    version: CURRENT_BACKUP_VERSION,
    exportedAt: Date.now(),
    data: { settings, layout, threads },
  };
}

/**
 * Serialize a bundle to pretty-printed JSON.
 *
 * @param file The bundle to serialize.
 * @returns The JSON string to write to disk.
 */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Build a dated backup filename, e.g. `shroudly-backup-20260628.json`.
 *
 * @param date Date to stamp (defaults to now).
 * @returns The filename.
 */
export function backupFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `shroudly-backup-${y}${m}${d}.json`;
}

/**
 * Parse and validate a backup JSON string.
 *
 * @param json Raw file contents.
 * @returns The validated {@link BackupFile}.
 * @throws Error with a user-facing message when the file is not a supported
 *   Shroudly backup.
 */
export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (!isObject(raw)) throw new Error('Invalid backup file');
  if (raw.app !== 'shroudly') throw new Error('Not a Shroudly backup');
  if (typeof raw.version !== 'number' || !SUPPORTED_BACKUP_VERSIONS.includes(raw.version)) {
    throw new Error('Unsupported backup version');
  }
  if (!isObject(raw.data)) throw new Error('Invalid backup data');

  return raw as unknown as BackupFile;
}

/**
 * Restore a validated bundle into storage. Each slice is normalized (merged with
 * defaults / repaired) before writing; a slice absent from the bundle is left
 * untouched rather than overwritten with empty data.
 *
 * @param file A validated bundle.
 */
export async function importAll(file: BackupFile): Promise<void> {
  const { data } = file;
  if (data.settings !== undefined) await setSettings(migrateSettings(data.settings));
  if (data.layout !== undefined) await setLayout(migrateLayout(data.layout));
  if (data.threads !== undefined) await setThreads(migrateThreads(data.threads));
}

/**
 * Convenience: validate raw text and restore it in one step.
 *
 * @param json Raw file contents.
 * @throws Error when validation fails (storage is left untouched).
 */
export async function importFromText(json: string): Promise<void> {
  await importAll(parseBackup(json));
}

/**
 * Reset everything to factory defaults: settings, panel layout, and all saved
 * threads (aliases/pins/tags). Destructive and irreversible. The resulting
 * `onChanged` events make the panel and content script re-render automatically.
 */
export async function resetAll(): Promise<void> {
  await setSettings({ ...DEFAULT_SETTINGS });
  await setLayout({ order: [...DEFAULT_LAYOUT.order], collapsed: {} });
  await setThreads({});
}
