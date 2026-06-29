/**
 * Backward-compatibility integration tests.
 *
 * Simulates data written by an older or partially-corrupted build sitting in
 * storage, then proves the typed getters and the backup importer normalize it
 * (merge-with-default / repair / drop) without throwing or losing data.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT,
  STORAGE_KEYS,
  getLayout,
  getSettings,
  getThreads,
} from '../src/core/storage';
import { importFromText } from '../src/features/backup';

/** Plant a raw value directly under a storage key, bypassing the typed setters. */
function seedRaw(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    (globalThis as unknown as { chrome: typeof chrome }).chrome.storage.local.set(
      { [key]: value },
      () => resolve()
    );
  });
}

describe('legacy settings', () => {
  it('fills missing fields with defaults instead of throwing', async () => {
    // Arrange: an old build that only persisted a couple of fields.
    await seedRaw(STORAGE_KEYS.settings, { namesMode: 'hide' });

    // Act
    const settings = await getSettings();

    // Assert
    expect(settings.namesMode).toBe('hide');
    expect(settings.opacity).toBe(55); // default supplied
    expect(settings.hoverReveal).toBe(true);
  });
});

describe('legacy layout', () => {
  it('repairs a layout missing the collapsed map', async () => {
    // Arrange
    await seedRaw(STORAGE_KEYS.layout, { order: ['privacy'] });

    // Act
    const layout = await getLayout();

    // Assert
    expect(layout.order).toEqual(['privacy']);
    expect(layout.collapsed).toEqual({});
  });

  it('falls back to the default order for a garbage value', async () => {
    // Arrange
    await seedRaw(STORAGE_KEYS.layout, 'corrupted');

    // Act / Assert
    expect((await getLayout()).order).toEqual(DEFAULT_LAYOUT.order);
  });
});

describe('legacy threads', () => {
  it('repairs partial entries and drops unsalvageable ones', async () => {
    // Arrange: one entry missing flags, one that is not an object at all.
    await seedRaw(STORAGE_KEYS.threads, {
      good: { alias: 'Boss' },
      bad: 42,
    });

    // Act
    const threads = await getThreads();

    // Assert
    expect(threads.good).toMatchObject({
      threadId: 'good',
      alias: 'Boss',
      pinned: false,
      following: false,
      tags: [],
    });
    expect(threads.bad).toBeUndefined();
  });
});

describe('importing a legacy/partial backup', () => {
  it('normalizes partial data and never throws on missing slices', async () => {
    // Arrange: a v1 bundle with only settings, and a thread entry missing fields.
    const bundle = JSON.stringify({
      app: 'shroudly',
      version: 1,
      exportedAt: 0,
      data: {
        settings: { panic: true },
        threads: { r1: { alias: 'Lead' } },
      },
    });

    // Act
    await importFromText(bundle);

    // Assert
    const settings = await getSettings();
    const threads = await getThreads();
    expect(settings.panic).toBe(true);
    expect(settings.blurIntensity).toBe(3); // defaulted
    expect(threads.r1.alias).toBe('Lead');
    expect(threads.r1.pinned).toBe(false); // repaired
  });
});
