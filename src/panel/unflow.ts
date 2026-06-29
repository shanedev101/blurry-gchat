/**
 * "Thread Manager" section of the side panel.
 *
 * Renders saved conversations grouped into Pinned / Following / Tagged / Recent,
 * with a realtime search box that filters by alias, original title, or tag.
 * Clicking a row asks the content script to focus that conversation in the page.
 *
 * The grouping, filtering, and display-name rules are pure functions so they can
 * be unit-tested without a DOM; `initUnflow` wires them to the panel markup and
 * keeps the view in sync with the `gcp-threads` store.
 */

import type { ThreadMeta } from '../types';
import { listThreads, removeTag } from '../features/threads';
import { onKeyChanged, STORAGE_KEYS } from '../core/storage';
import { tagColor } from '../core/tagColor';

/** How many entries the "Recent" group shows. */
const RECENT_LIMIT = 12;

/** Grouped view of the threads shown in the panel. */
export interface ThreadGroups {
  pinned: ThreadMeta[];
  tagged: ThreadMeta[];
  recent: ThreadMeta[];
}

/**
 * The label to show for a thread: alias, else original title, else the raw id.
 *
 * @param meta Thread metadata.
 * @returns A human-friendly display name.
 */
export function displayName(meta: ThreadMeta): string {
  return meta.alias || meta.originalTitle || meta.threadId;
}

/**
 * Group threads for display. Each group is sorted most-recently-updated first;
 * "Recent" is capped at {@link RECENT_LIMIT}.
 *
 * @param threads Threads to group.
 * @returns The four display groups.
 */
export function groupThreads(threads: ThreadMeta[]): ThreadGroups {
  const byRecent = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
  // PIN means "priority": pinned threads float to the top of Recent (stable sort
  // keeps recency order within each pinned/unpinned bucket).
  const byPriority = [...byRecent].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return {
    pinned: byRecent.filter((t) => t.pinned),
    tagged: byRecent.filter((t) => t.tags.length > 0),
    recent: byPriority.slice(0, RECENT_LIMIT),
  };
}

/**
 * Filter threads by a search query. A leading `#` restricts the match to tags;
 * otherwise the query matches the display name, original title, or any tag.
 *
 * @param threads Threads to filter.
 * @param query Raw search text.
 * @returns The matching subset (the original list when the query is blank).
 */
export function filterThreads(threads: ThreadMeta[], query: string): ThreadMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;

  const tagOnly = q.startsWith('#') ? q.slice(1) : null;
  return threads.filter((t) => {
    const tags = t.tags.map((s) => s.toLowerCase());
    if (tagOnly !== null) return tags.some((tag) => tag.includes(tagOnly));
    const name = displayName(t).toLowerCase();
    const original = (t.originalTitle ?? '').toLowerCase();
    return name.includes(q) || original.includes(q) || tags.some((tag) => tag.includes(q));
  });
}

/**
 * Ask the content script in the active tab to focus a conversation.
 *
 * @param threadId The thread id to focus.
 */
export function focusThreadInTab(threadId: string): void {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, { type: 'GCP_FOCUS_THREAD', threadId });
    }
  });
}

/**
 * Wire up the Thread Manager: render groups, filter on search input, navigate on
 * row click, and re-render whenever the thread store changes.
 *
 * @param root Scope containing the unflow markup. Defaults to `document`.
 */
export async function initUnflow(root: ParentNode = document): Promise<void> {
  const search = root.querySelector<HTMLInputElement>('#unflow-search');
  const listsEl = root.querySelector<HTMLElement>('#unflow-lists');
  const emptyEl = root.querySelector<HTMLElement>('#unflow-empty');
  if (!listsEl) return;

  let all: ThreadMeta[] = await listThreads();

  const rerender = (): void => {
    const filtered = filterThreads(all, search?.value ?? '');
    renderGroups(listsEl, groupThreads(filtered));
    if (emptyEl) emptyEl.style.display = filtered.length === 0 ? '' : 'none';
  };

  rerender();
  search?.addEventListener('input', rerender);
  onKeyChanged(STORAGE_KEYS.threads, () => {
    void listThreads().then((next) => {
      all = next;
      rerender();
    });
  });
}

// --- RENDERING ---

const GROUP_LABELS: Array<{ key: keyof ThreadGroups; label: string }> = [
  { key: 'pinned', label: '// pinned' },
  { key: 'tagged', label: '// tagged' },
  { key: 'recent', label: '// recent' },
];

/** Render all non-empty groups into the container, replacing prior content. */
function renderGroups(container: HTMLElement, groups: ThreadGroups): void {
  container.textContent = '';
  for (const { key, label } of GROUP_LABELS) {
    const items = groups[key];
    if (items.length === 0) continue;
    container.appendChild(renderGroup(label, items));
  }
}

/** Render one labelled group of thread rows. */
function renderGroup(label: string, items: ThreadMeta[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'unflow-group';

  const heading = document.createElement('div');
  heading.className = 'unflow-glabel';
  heading.textContent = label;
  group.appendChild(heading);

  for (const meta of items) group.appendChild(renderRow(meta));
  return group;
}

/** Render a single clickable thread row with its tag chips. */
function renderRow(meta: ThreadMeta): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'unflow-row';
  row.addEventListener('click', () => focusThreadInTab(meta.threadId));

  const name = document.createElement('span');
  name.className = 'unflow-name';
  name.textContent = displayName(meta);
  row.appendChild(name);

  if (meta.tags.length > 0) {
    const chips = document.createElement('span');
    chips.className = 'unflow-chips';
    for (const tag of meta.tags) {
      const chip = document.createElement('span');
      chip.className = 'unflow-chip';
      chip.textContent = tag;
      chip.title = `Tag: ${tag} - click to remove`;
      const { bg, fg } = tagColor(tag);
      chip.style.background = bg;
      chip.style.color = fg;
      chip.style.borderColor = bg;
      // Remove the tag on click without triggering the row's navigate action.
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        void removeTag(meta.threadId, tag);
      });
      chips.appendChild(chip);
    }
    row.appendChild(chips);
  }

  return row;
}
