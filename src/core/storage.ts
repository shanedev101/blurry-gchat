/**
 * Typed access layer over `chrome.storage.local`.
 *
 * Every persisted key flows through this module so the read/write/merge pattern
 * (previously duplicated across popup.ts and content.ts) lives in exactly one
 * place. Reads always run through a per-key normalizer ("migration") and then
 * merge with defaults, which is what makes the schema forward- and
 * backward-compatible: missing fields fall back to defaults and malformed
 * entries are repaired or dropped instead of crashing callers.
 */

import type { GCPSettings, PanelLayout, ThreadMeta, ThreadStore } from '../types';

/** Centralized storage keys - change a name here and nowhere else. */
export const STORAGE_KEYS = {
  settings: 'gcp-settings',
  layout: 'gcp-panel-layout',
  threads: 'gcp-threads',
} as const;

/**
 * Current storage schema version. Bump this only when a structural change needs
 * a real migration step; additive optional fields never require a bump because
 * merge-with-default already handles them.
 */
export const SCHEMA_VERSION = 1;

/** Default privacy settings. Kept identical to the original inline defaults. */
export const DEFAULT_SETTINGS: GCPSettings = {
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

/**
 * Default side panel layout. `order` is intentionally minimal; sections present
 * in the DOM but absent here are appended at init time, so adding a new section
 * later needs no layout migration.
 */
export const DEFAULT_LAYOUT: PanelLayout = {
  order: ['privacy', 'unflow', 'backup'],
  collapsed: {},
};

// --- LOW-LEVEL PROMISE WRAPPERS ---

/**
 * Promise wrapper around `chrome.storage.local.get` for a single key.
 *
 * @param key Storage key to read.
 * @returns The raw stored value, or `undefined` if the key is unset or the read
 *   failed (errors are swallowed to match the existing fail-safe behavior).
 */
function getRaw(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve(result[key]);
    });
  });
}

/**
 * Promise wrapper around `chrome.storage.local.set` for a single key.
 *
 * @param key Storage key to write.
 * @param value Value to persist.
 */
function setRaw(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

// --- NORMALIZERS / MIGRATIONS ---
// A "migration" here normalizes whatever is on disk (possibly from an older or
// corrupted build) into a valid, fully-defaulted shape. Keeping these pure makes
// them trivially unit-testable and reusable by the backup importer.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize raw settings into a complete {@link GCPSettings}.
 *
 * @param raw Value read from storage (any shape, possibly undefined).
 * @returns Defaults merged with any valid fields from `raw`.
 */
export function migrateSettings(raw: unknown): GCPSettings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(raw as Partial<GCPSettings>) };
}

/**
 * Normalize raw layout into a valid {@link PanelLayout}.
 *
 * Repairs the common failure modes: a non-array `order` and a non-object or
 * non-boolean `collapsed` map. Unknown section ids are preserved on purpose.
 *
 * @param raw Value read from storage (any shape, possibly undefined).
 * @returns A layout safe to apply to the DOM.
 */
export function migrateLayout(raw: unknown): PanelLayout {
  if (!isObject(raw)) return { order: [...DEFAULT_LAYOUT.order], collapsed: {} };

  const order = Array.isArray(raw.order)
    ? raw.order.filter((id): id is string => typeof id === 'string')
    : [...DEFAULT_LAYOUT.order];

  const collapsed: Record<string, boolean> = {};
  if (isObject(raw.collapsed)) {
    for (const [id, value] of Object.entries(raw.collapsed)) {
      collapsed[id] = Boolean(value);
    }
  }

  return { order, collapsed };
}

/**
 * Normalize a single raw entry into a valid {@link ThreadMeta}, or `null` if it
 * lacks the minimum required identity.
 *
 * @param id The map key the entry was stored under (used as a threadId fallback).
 * @param raw The raw entry value.
 * @returns A repaired ThreadMeta, or `null` when the entry cannot be salvaged.
 */
export function migrateThreadMeta(id: string, raw: unknown): ThreadMeta | null {
  if (!isObject(raw)) return null;
  const threadId = typeof raw.threadId === 'string' && raw.threadId ? raw.threadId : id;
  if (!threadId) return null;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    threadId,
    alias: typeof raw.alias === 'string' ? raw.alias : undefined,
    originalTitle: typeof raw.originalTitle === 'string' ? raw.originalTitle : undefined,
    pinned: Boolean(raw.pinned),
    following: Boolean(raw.following),
    tags,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

/**
 * Normalize the raw thread store, dropping entries that cannot be repaired.
 *
 * @param raw Value read from storage (any shape, possibly undefined).
 * @returns A clean {@link ThreadStore}.
 */
export function migrateThreads(raw: unknown): ThreadStore {
  if (!isObject(raw)) return {};
  const store: ThreadStore = {};
  for (const [id, value] of Object.entries(raw)) {
    const meta = migrateThreadMeta(id, value);
    if (meta) store[id] = meta;
  }
  return store;
}

// --- TYPED GETTERS / SETTERS ---

/** Read privacy settings, normalized and merged with defaults. */
export async function getSettings(): Promise<GCPSettings> {
  return migrateSettings(await getRaw(STORAGE_KEYS.settings));
}

/** Persist privacy settings. */
export async function setSettings(settings: GCPSettings): Promise<void> {
  await setRaw(STORAGE_KEYS.settings, settings);
}

/** Read the side panel layout, normalized and merged with defaults. */
export async function getLayout(): Promise<PanelLayout> {
  return migrateLayout(await getRaw(STORAGE_KEYS.layout));
}

/** Persist the side panel layout. */
export async function setLayout(layout: PanelLayout): Promise<void> {
  await setRaw(STORAGE_KEYS.layout, layout);
}

/** Read the Unflow thread store, normalized (invalid entries dropped). */
export async function getThreads(): Promise<ThreadStore> {
  return migrateThreads(await getRaw(STORAGE_KEYS.threads));
}

/** Persist the Unflow thread store. */
export async function setThreads(store: ThreadStore): Promise<void> {
  await setRaw(STORAGE_KEYS.threads, store);
}

// --- CHANGE SUBSCRIPTION ---

/**
 * Subscribe to changes of a single `chrome.storage.local` key.
 *
 * This wraps the verbose `chrome.storage.onChanged` filtering boilerplate so
 * callers get just the new value for the key they care about.
 *
 * @param key Storage key to watch.
 * @param callback Invoked with the new raw value whenever `key` changes in the
 *   `local` area.
 * @returns An unsubscribe function that removes the underlying listener.
 */
export function onKeyChanged(key: string, callback: (newValue: unknown) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== 'local') return;
    if (!(key in changes)) return;
    callback(changes[key].newValue);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
