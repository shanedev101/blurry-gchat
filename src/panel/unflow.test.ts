/**
 * Tests for the Thread Manager: pure grouping/filtering/display-name helpers and
 * the `initUnflow` rendering + search + navigation wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { displayName, filterThreads, groupThreads, initUnflow, type ThreadGroups } from './unflow';
import { setThreads } from '../core/storage';
import type { ThreadMeta } from '../types';

/** Build a ThreadMeta with sensible defaults. */
function meta(partial: Partial<ThreadMeta> & { threadId: string }): ThreadMeta {
  return {
    pinned: false,
    following: false,
    tags: [],
    updatedAt: 0,
    ...partial,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('displayName', () => {
  it('prefers alias, then original title, then id', () => {
    expect(displayName(meta({ threadId: 'r1', alias: 'A', originalTitle: 'O' }))).toBe('A');
    expect(displayName(meta({ threadId: 'r1', originalTitle: 'O' }))).toBe('O');
    expect(displayName(meta({ threadId: 'r1' }))).toBe('r1');
  });
});

describe('groupThreads', () => {
  it('routes threads into the right groups, sorted by recency', () => {
    // Arrange
    const threads = [
      meta({ threadId: 'p', pinned: true, updatedAt: 10 }),
      meta({ threadId: 'r', updatedAt: 30 }),
      meta({ threadId: 't', tags: ['x'], updatedAt: 20 }),
    ];

    // Act
    const groups: ThreadGroups = groupThreads(threads);

    // Assert
    expect(groups.pinned.map((t) => t.threadId)).toEqual(['p']);
    expect(groups.tagged.map((t) => t.threadId)).toEqual(['t']);
    // Recent floats pinned 'p' to the top, then the rest by recency.
    expect(groups.recent.map((t) => t.threadId)).toEqual(['p', 'r', 't']);
  });

  it('floats pinned threads to the top of Recent (priority), keeping recency within buckets', () => {
    // Arrange
    const threads = [
      meta({ threadId: 'a', updatedAt: 30 }),
      meta({ threadId: 'b', pinned: true, updatedAt: 10 }),
      meta({ threadId: 'c', updatedAt: 20 }),
    ];

    // Act
    const groups = groupThreads(threads);

    // Assert: pinned 'b' first, then the rest by recency.
    expect(groups.recent.map((t) => t.threadId)).toEqual(['b', 'a', 'c']);
  });
});

describe('filterThreads', () => {
  const threads = [
    meta({ threadId: 'r1', alias: 'Boss', tags: ['work'] }),
    meta({ threadId: 'r2', originalTitle: 'Lunch Crew', tags: ['social'] }),
  ];

  it('returns all when query is blank', () => {
    expect(filterThreads(threads, '  ')).toHaveLength(2);
  });

  it('matches alias or original title', () => {
    expect(filterThreads(threads, 'boss').map((t) => t.threadId)).toEqual(['r1']);
    expect(filterThreads(threads, 'lunch').map((t) => t.threadId)).toEqual(['r2']);
  });

  it('restricts to tags when the query starts with #', () => {
    expect(filterThreads(threads, '#social').map((t) => t.threadId)).toEqual(['r2']);
  });
});

describe('initUnflow', () => {
  /** Build the unflow markup the controller binds to. */
  function buildMarkup(): void {
    document.body.innerHTML =
      '<input id="unflow-search" /><div id="unflow-lists"></div><div id="unflow-empty"></div>';
  }

  it('renders grouped rows from the store', async () => {
    // Arrange
    await setThreads({
      r1: { threadId: 'r1', alias: 'Boss', pinned: true, following: false, tags: [], updatedAt: 5 },
    });
    buildMarkup();

    // Act
    await initUnflow(document);

    // Assert
    const labels = Array.from(document.querySelectorAll('.unflow-glabel')).map(
      (e) => e.textContent
    );
    expect(labels).toContain('// pinned');
    expect(document.querySelector('.unflow-name')?.textContent).toBe('Boss');
  });

  it('colors each tag chip with a pastel background', async () => {
    // Arrange
    await setThreads({
      r1: {
        threadId: 'r1',
        alias: 'Boss',
        pinned: false,
        following: false,
        tags: ['work'],
        updatedAt: 5,
      },
    });
    buildMarkup();

    // Act
    await initUnflow(document);

    // Assert
    const chip = document.querySelector('.unflow-chip') as HTMLElement | null;
    expect(chip?.textContent).toBe('work');
    expect(chip?.style.background).not.toBe('');
  });

  it('filters rendered rows as the search box changes', async () => {
    // Arrange
    await setThreads({
      r1: {
        threadId: 'r1',
        alias: 'Boss',
        pinned: false,
        following: false,
        tags: [],
        updatedAt: 5,
      },
      r2: {
        threadId: 'r2',
        alias: 'Lunch',
        pinned: false,
        following: false,
        tags: [],
        updatedAt: 6,
      },
    });
    buildMarkup();
    await initUnflow(document);
    const search = document.getElementById('unflow-search') as HTMLInputElement;

    // Act
    search.value = 'boss';
    search.dispatchEvent(new Event('input'));

    // Assert
    const names = Array.from(document.querySelectorAll('.unflow-name')).map((e) => e.textContent);
    expect(names).toEqual(['Boss']);
  });

  it('removes a tag when its panel chip is clicked', async () => {
    // Arrange
    await setThreads({
      r1: {
        threadId: 'r1',
        alias: 'Boss',
        pinned: false,
        following: false,
        tags: ['work'],
        updatedAt: 5,
      },
    });
    buildMarkup();
    await initUnflow(document);
    expect(document.querySelector('.unflow-chip')?.textContent).toBe('work');

    // Act
    (document.querySelector('.unflow-chip') as HTMLElement).click();

    // Assert
    await vi.waitFor(() => expect(document.querySelector('.unflow-chip')).toBeNull());
  });

  it('messages the active tab to focus a thread when a row is clicked', async () => {
    // Arrange
    await setThreads({
      r1: { threadId: 'r1', alias: 'Boss', pinned: true, following: false, tags: [], updatedAt: 5 },
    });
    buildMarkup();
    await initUnflow(document);

    // Drive the chrome.tabs mock to return an active tab and spy on sendMessage.
    const chromeApi = (globalThis as unknown as { chrome: typeof chrome }).chrome;
    chromeApi.tabs.query = ((_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: 7 }])) as never;
    const send = vi.spyOn(chromeApi.tabs, 'sendMessage');

    // Act
    (document.querySelector('.unflow-row') as HTMLElement).click();

    // Assert
    expect(send).toHaveBeenCalledWith(7, { type: 'GCP_FOCUS_THREAD', threadId: 'r1' });
  });
});
