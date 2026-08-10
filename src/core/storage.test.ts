/**
 * Unit tests for the typed storage layer: migration/normalization of each key,
 * get/set merge-with-default roundtrips, and the single-key change subscription.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  getLayout,
  getSettings,
  getThreads,
  migrateLayout,
  migrateSettings,
  migrateThreadMeta,
  migrateThreads,
  onKeyChanged,
  setLayout,
  setSettings,
  setThreads,
} from './storage';

describe('migrateSettings', () => {
  it('returns a full default settings object for non-object input', () => {
    // Arrange / Act
    const result = migrateSettings(undefined);

    // Assert
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored fields over defaults without dropping unknown defaults', () => {
    // Arrange
    const raw = { panic: true, blurIntensity: 9 };

    // Act
    const result = migrateSettings(raw);

    // Assert
    expect(result.panic).toBe(true);
    expect(result.blurIntensity).toBe(9);
    expect(result.namesMode).toBe(DEFAULT_SETTINGS.namesMode);
  });
});

describe('migrateLayout', () => {
  it('falls back to default order when input is not an object', () => {
    // Arrange / Act
    const result = migrateLayout(null);

    // Assert
    expect(result.order).toEqual(DEFAULT_LAYOUT.order);
    expect(result.collapsed).toEqual({});
  });

  it('drops non-string ids from order and coerces collapsed values to booleans', () => {
    // Arrange
    const raw = { order: ['privacy', 42, 'unflow'], collapsed: { privacy: 1, unflow: 0 } };

    // Act
    const result = migrateLayout(raw);

    // Assert
    expect(result.order).toEqual(['privacy', 'unflow']);
    expect(result.collapsed).toEqual({ privacy: true, unflow: false });
  });

  it('preserves unknown section ids for forward compatibility', () => {
    // Arrange
    const raw = { order: ['privacy', 'future-section'], collapsed: {} };

    // Act
    const result = migrateLayout(raw);

    // Assert
    expect(result.order).toContain('future-section');
  });
});

describe('migrateThreadMeta', () => {
  it('returns null when the raw entry is not an object', () => {
    // Arrange / Act / Assert
    expect(migrateThreadMeta('id', 'nope')).toBeNull();
  });

  it('uses the map key as threadId fallback and fills defaults', () => {
    // Arrange
    const raw = { alias: 'Boss' };

    // Act
    const result = migrateThreadMeta('room-1', raw);

    // Assert
    expect(result).toEqual({
      threadId: 'room-1',
      alias: 'Boss',
      originalTitle: undefined,
      pinned: false,
      following: false,
      tags: [],
      updatedAt: 0,
    });
  });

  it('filters non-string tags out of the tags array', () => {
    // Arrange
    const raw = { threadId: 'r', tags: ['work', 5, 'urgent'] };

    // Act
    const result = migrateThreadMeta('r', raw);

    // Assert
    expect(result?.tags).toEqual(['work', 'urgent']);
  });
});

describe('migrateThreads', () => {
  it('drops entries that cannot be repaired', () => {
    // Arrange
    const raw = { good: { threadId: 'good', pinned: true }, bad: 12 };

    // Act
    const result = migrateThreads(raw);

    // Assert
    expect(Object.keys(result)).toEqual(['good']);
    expect(result.good.pinned).toBe(true);
  });
});

describe('typed getters and setters', () => {
  it('roundtrips settings through storage', async () => {
    // Arrange
    const settings = { ...DEFAULT_SETTINGS, panic: true };

    // Act
    await setSettings(settings);
    const result = await getSettings();

    // Assert
    expect(result.panic).toBe(true);
  });

  it('returns defaults when layout has never been written', async () => {
    // Arrange / Act
    const result = await getLayout();

    // Assert
    expect(result.order).toEqual(DEFAULT_LAYOUT.order);
  });

  it('roundtrips layout through storage', async () => {
    // Arrange
    const layout = { order: ['unflow', 'privacy'], collapsed: { privacy: true } };

    // Act
    await setLayout(layout);
    const result = await getLayout();

    // Assert
    expect(result).toEqual(layout);
  });

  it('roundtrips and normalizes the thread store', async () => {
    // Arrange
    const store = {
      'room-1': {
        threadId: 'room-1',
        pinned: true,
        following: false,
        tags: ['work'],
        updatedAt: 100,
      },
    };

    // Act
    await setThreads(store);
    const result = await getThreads();

    // Assert
    expect(result['room-1'].pinned).toBe(true);
  });
});

describe('onKeyChanged', () => {
  it('invokes the callback with the new value only for the watched key', async () => {
    // Arrange
    const callback = vi.fn();
    onKeyChanged(STORAGE_KEYS.layout, callback);

    // Act
    await setSettings({ ...DEFAULT_SETTINGS });
    await setLayout({ order: ['unflow'], collapsed: {} });

    // Assert
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ order: ['unflow'], collapsed: {} });
  });

  it('stops invoking the callback after unsubscribe', async () => {
    // Arrange
    const callback = vi.fn();
    const unsubscribe = onKeyChanged(STORAGE_KEYS.threads, callback);

    // Act
    unsubscribe();
    await setThreads({});

    // Assert
    expect(callback).not.toHaveBeenCalled();
  });
});
