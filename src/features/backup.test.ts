/**
 * Unit tests for backup logic: export shape, serialize/parse, validation of bad
 * files, partial-import safety, and a full export -> import roundtrip.
 */

import { describe, it, expect } from 'vitest';
import {
  backupFilename,
  exportAll,
  importAll,
  importFromText,
  parseBackup,
  resetAll,
  serializeBackup,
} from './backup';
import {
  DEFAULT_SETTINGS,
  getSettings,
  getThreads,
  setLayout,
  setSettings,
  setThreads,
} from '../core/storage';

describe('exportAll', () => {
  it('produces a versioned bundle containing all three slices', async () => {
    // Arrange
    await setSettings({ ...DEFAULT_SETTINGS, panic: true });

    // Act
    const bundle = await exportAll();

    // Assert
    expect(bundle.app).toBe('shroudly');
    expect(bundle.version).toBe(1);
    expect(bundle.data.settings?.panic).toBe(true);
    expect(bundle.data).toHaveProperty('layout');
    expect(bundle.data).toHaveProperty('threads');
  });
});

describe('backupFilename', () => {
  it('formats the date as shroudly-backup-YYYYMMDD.json', () => {
    expect(backupFilename(new Date('2026-06-28T12:00:00Z'))).toBe('shroudly-backup-20260628.json');
  });
});

describe('parseBackup', () => {
  it('rejects malformed JSON', () => {
    expect(() => parseBackup('{not json')).toThrow('Invalid JSON');
  });

  it('rejects a bundle from another app', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, data: {} }))).toThrow(
      'Not a Shroudly backup'
    );
  });

  it('rejects an unsupported version', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'shroudly', version: 99, data: {} }))).toThrow(
      'Unsupported backup version'
    );
  });

  it('accepts a valid bundle', () => {
    const file = parseBackup(JSON.stringify({ app: 'shroudly', version: 1, data: {} }));
    expect(file.app).toBe('shroudly');
  });
});

describe('importAll', () => {
  it('skips slices absent from the bundle instead of wiping them', async () => {
    // Arrange: existing threads, and a bundle that only carries settings.
    await setThreads({
      r1: { threadId: 'r1', pinned: true, following: false, tags: [], updatedAt: 1 },
    });

    // Act
    await importAll({
      app: 'shroudly',
      version: 1,
      exportedAt: 0,
      data: { settings: { ...DEFAULT_SETTINGS, opacity: 80 } },
    });

    // Assert: settings applied, threads untouched.
    expect((await getSettings()).opacity).toBe(80);
    expect(await getThreads()).toHaveProperty('r1');
  });
});

describe('resetAll', () => {
  it('restores defaults and wipes saved threads', async () => {
    // Arrange
    await setSettings({ ...DEFAULT_SETTINGS, panic: true, opacity: 80 });
    await setThreads({
      r1: { threadId: 'r1', pinned: true, following: false, tags: [], updatedAt: 1 },
    });

    // Act
    await resetAll();

    // Assert
    const settings = await getSettings();
    expect(settings.panic).toBe(false);
    expect(settings.opacity).toBe(55);
    expect(await getThreads()).toEqual({});
  });
});

describe('roundtrip', () => {
  it('restores identical state after export -> clear -> import', async () => {
    // Arrange
    await setSettings({ ...DEFAULT_SETTINGS, namesMode: 'hide', blurIntensity: 7 });
    await setLayout({ order: ['unflow', 'privacy'], collapsed: { privacy: true } });
    await setThreads({
      r1: {
        threadId: 'r1',
        alias: 'Boss',
        pinned: true,
        following: false,
        tags: ['x'],
        updatedAt: 9,
      },
    });
    const json = serializeBackup(await exportAll());

    // Act: wipe everything, then restore from the serialized bundle.
    await setSettings({ ...DEFAULT_SETTINGS });
    await setThreads({});
    await importFromText(json);

    // Assert
    expect((await getSettings()).namesMode).toBe('hide');
    expect((await getThreads()).r1.alias).toBe('Boss');
  });
});
