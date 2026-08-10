/**
 * Unit tests for thread metadata CRUD: alias/pin/tag mutations, the `updatedAt`
 * stamp, and pruning of empty entries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addTag, getThread, listThreads, removeTag, setAlias, togglePin } from './threads';

beforeEach(() => {
  // Freeze time so updatedAt assertions are deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-28T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getThread', () => {
  it('returns null for an unknown id', async () => {
    expect(await getThread('nope')).toBeNull();
  });
});

describe('setAlias', () => {
  it('creates an entry, stores the alias, snapshots the original title, and stamps updatedAt', async () => {
    // Act
    const meta = await setAlias('room/1', 'Boss DM', 'Alexander Hamilton');

    // Assert
    expect(meta).toMatchObject({
      threadId: 'room/1',
      alias: 'Boss DM',
      originalTitle: 'Alexander Hamilton',
    });
    expect(meta?.updatedAt).toBe(Date.now());
  });

  it('does not overwrite an already-snapshotted original title', async () => {
    // Arrange
    await setAlias('room/1', 'First', 'Original Name');

    // Act
    const meta = await setAlias('room/1', 'Second', 'Different Name');

    // Assert
    expect(meta?.originalTitle).toBe('Original Name');
  });

  it('prunes the entry when the alias is cleared and nothing else remains', async () => {
    // Arrange
    await setAlias('room/1', 'Temp');

    // Act
    const result = await setAlias('room/1', '   ');

    // Assert
    expect(result).toBeNull();
    expect(await getThread('room/1')).toBeNull();
  });
});

describe('togglePin', () => {
  it('pins then prunes when unpinned with nothing else set', async () => {
    // Act
    const pinned = await togglePin('room/2');
    const unpinned = await togglePin('room/2');

    // Assert
    expect(pinned?.pinned).toBe(true);
    expect(unpinned).toBeNull();
    expect(await getThread('room/2')).toBeNull();
  });

  it('keeps an entry that still has another annotation', async () => {
    // Arrange
    await togglePin('room/3');
    await addTag('room/3', 'work');

    // Act: unpin, but it still has a tag
    const meta = await togglePin('room/3');

    // Assert
    expect(meta).not.toBeNull();
    expect(meta?.pinned).toBe(false);
    expect(meta?.tags).toEqual(['work']);
  });
});

describe('addTag / removeTag', () => {
  it('adds a tag, ignores duplicates and blanks', async () => {
    // Act
    await addTag('room/4', 'work');
    await addTag('room/4', 'work'); // duplicate
    const meta = await addTag('room/4', '   '); // blank

    // Assert
    expect(meta?.tags).toEqual(['work']);
  });

  it('removes a tag and prunes the entry when the last tag goes', async () => {
    // Arrange
    await addTag('room/5', 'urgent');

    // Act
    const result = await removeTag('room/5', 'urgent');

    // Assert
    expect(result).toBeNull();
    expect(await getThread('room/5')).toBeNull();
  });
});

describe('originalTitle capture', () => {
  it('snapshots the title when an entry is first created by pin/tag/alias', async () => {
    // Act
    const pinned = await togglePin('room/p', 'Design Team');
    const tagged = await addTag('room/t', 'work', 'Ops');
    const aliased = await setAlias('room/a', 'Boss', 'Lunch Crew');

    // Assert
    expect(pinned?.originalTitle).toBe('Design Team');
    expect(tagged?.originalTitle).toBe('Ops');
    expect(aliased?.originalTitle).toBe('Lunch Crew');
  });

  it('does not overwrite an existing original title', async () => {
    // Arrange
    await togglePin('room/p', 'First Name');

    // Act
    const meta = await addTag('room/p', 'x', 'Different Name');

    // Assert
    expect(meta?.originalTitle).toBe('First Name');
  });
});

describe('listThreads', () => {
  it('returns every stored entry', async () => {
    // Arrange
    await togglePin('room/6');
    await setAlias('room/7', 'Alias');

    // Act
    const all = await listThreads();

    // Assert
    expect(all.map((t) => t.threadId).sort()).toEqual(['room/6', 'room/7']);
  });
});

describe('updatedAt', () => {
  it('advances on a later mutation', async () => {
    // Arrange
    const first = await togglePin('room/8');

    // Act: advance the clock, then mutate again
    vi.setSystemTime(new Date('2026-06-28T00:01:00Z'));
    const second = await addTag('room/8', 'later');

    // Assert
    expect(second!.updatedAt).toBeGreaterThan(first!.updatedAt);
  });
});
