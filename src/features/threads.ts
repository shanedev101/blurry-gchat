/**
 * CRUD for per-thread Unflow metadata (alias / pin / follow / tags), persisted
 * under the `gcp-threads` key.
 *
 * Two invariants keep the store healthy:
 *  - every mutation stamps `updatedAt` (used to sort the "Recent" list);
 *  - an entry that carries no meaningful data (no alias, not pinned, not
 *    followed, no tags) is pruned, so the store never accumulates dead rows.
 *
 * This is pure data logic with no DOM access, so it is shared by both the panel
 * and the content-script injection layer and is straightforward to unit-test.
 */

import type { ThreadMeta, ThreadStore } from '../types';
import { getThreads, setThreads } from '../core/storage';

/** Build a blank metadata record for a thread id. */
function emptyMeta(id: string): ThreadMeta {
  return { threadId: id, pinned: false, following: false, tags: [], updatedAt: 0 };
}

/** A record is "empty" (prunable) when it holds no user-meaningful data. */
function isEmptyMeta(meta: ThreadMeta): boolean {
  return !meta.alias && !meta.pinned && !meta.following && meta.tags.length === 0;
}

/**
 * Load, transform, persist, and return one thread's metadata.
 *
 * The transform receives a mutable copy; if the result is empty the entry is
 * deleted instead of stored (and `null` is returned).
 *
 * @param id Thread id to mutate.
 * @param transform Pure-ish updater applied to a copy of the current metadata.
 * @param originalTitle Real conversation title to snapshot the first time the
 *   entry is created, so lists can show a readable name (not the raw id).
 * @returns The stored metadata, or `null` if the entry was pruned.
 */
async function mutate(
  id: string,
  transform: (meta: ThreadMeta) => ThreadMeta,
  originalTitle?: string
): Promise<ThreadMeta | null> {
  const store = await getThreads();
  const current = store[id] ?? emptyMeta(id);
  const next = transform({ ...current, tags: [...current.tags] });
  // Capture the real title once, regardless of which action created the entry.
  if (originalTitle && !next.originalTitle) next.originalTitle = originalTitle;
  next.updatedAt = Date.now();

  if (isEmptyMeta(next)) {
    delete store[id];
    await setThreads(store);
    return null;
  }

  store[id] = next;
  await setThreads(store);
  return next;
}

/**
 * Read a single thread's metadata.
 *
 * @param id Thread id.
 * @returns The metadata, or `null` if none is stored.
 */
export async function getThread(id: string): Promise<ThreadMeta | null> {
  return (await getThreads())[id] ?? null;
}

/**
 * List all stored thread metadata.
 *
 * @returns Every {@link ThreadMeta} currently persisted (unordered).
 */
export async function listThreads(): Promise<ThreadMeta[]> {
  return Object.values(await getThreads());
}

/**
 * Set (or clear) a thread's alias.
 *
 * @param id Thread id.
 * @param alias New alias; an empty/whitespace value clears it.
 * @param originalTitle Real conversation title to snapshot the first time an
 *   alias is set, so the original is recoverable later.
 * @returns The stored metadata, or `null` if the entry became empty.
 */
export function setAlias(
  id: string,
  alias: string,
  originalTitle?: string
): Promise<ThreadMeta | null> {
  return mutate(
    id,
    (meta) => {
      const trimmed = alias.trim();
      meta.alias = trimmed || undefined;
      return meta;
    },
    originalTitle
  );
}

/**
 * Toggle a thread's pinned flag.
 *
 * @param id Thread id.
 * @param originalTitle Real conversation title to snapshot on first creation.
 * @returns The stored metadata, or `null` if the entry became empty.
 */
export function togglePin(id: string, originalTitle?: string): Promise<ThreadMeta | null> {
  return mutate(
    id,
    (meta) => {
      meta.pinned = !meta.pinned;
      return meta;
    },
    originalTitle
  );
}

/**
 * Add a tag to a thread (no-op for blank or duplicate tags).
 *
 * @param id Thread id.
 * @param tag Tag to add.
 * @param originalTitle Real conversation title to snapshot on first creation.
 * @returns The stored metadata, or `null` if the entry became empty.
 */
export function addTag(
  id: string,
  tag: string,
  originalTitle?: string
): Promise<ThreadMeta | null> {
  return mutate(
    id,
    (meta) => {
      const trimmed = tag.trim();
      if (trimmed && !meta.tags.includes(trimmed)) meta.tags.push(trimmed);
      return meta;
    },
    originalTitle
  );
}

/**
 * Remove a tag from a thread.
 *
 * @param id Thread id.
 * @param tag Tag to remove.
 * @returns The stored metadata, or `null` if the entry became empty.
 */
export function removeTag(id: string, tag: string): Promise<ThreadMeta | null> {
  return mutate(id, (meta) => {
    meta.tags = meta.tags.filter((t) => t !== tag);
    return meta;
  });
}

/** Re-export for callers that need the store shape without reaching into storage. */
export type { ThreadStore };
