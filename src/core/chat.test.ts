/**
 * Unit tests for the Google Chat DOM helpers: the three-tier `getThreadId`
 * resolution, href parsing, name extraction, and the stable hash.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractThreadIdFromHref, getThreadId, getThreadTitle, hashString } from './chat';

/** Build a list-item element from an HTML string. */
function item(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('hashString', () => {
  it('is deterministic for the same input', () => {
    // Arrange / Act / Assert
    expect(hashString('Design Team')).toBe(hashString('Design Team'));
  });

  it('differs for different inputs', () => {
    // Arrange / Act / Assert
    expect(hashString('Alice')).not.toBe(hashString('Bob'));
  });
});

describe('extractThreadIdFromHref', () => {
  it('extracts a room id with its type prefix', () => {
    expect(extractThreadIdFromHref('https://chat.google.com/room/AAAA?foo=1')).toBe('room/AAAA');
  });

  it('extracts a dm id with its type prefix', () => {
    expect(extractThreadIdFromHref('/dm/BBBB')).toBe('dm/BBBB');
  });

  it('returns null when neither room nor dm is present', () => {
    expect(extractThreadIdFromHref('/u/0/home')).toBeNull();
  });
});

describe('getThreadTitle', () => {
  it('prefers the tagged name element', () => {
    // Arrange
    const el = item('<span data-gcp-el="name"> Design Team </span><span>preview</span>');

    // Act / Assert
    expect(getThreadTitle(el)).toBe('Design Team');
  });

  it('returns null for an empty item', () => {
    expect(getThreadTitle(item(''))).toBeNull();
  });
});

describe('getThreadId', () => {
  it('prefers data-thread-id over every other source', () => {
    // Arrange
    const el = item('<a href="/room/XYZ" data-thread-id="THREAD-1">x</a>');

    // Act / Assert
    expect(getThreadId(el)).toBe('THREAD-1');
  });

  it('falls back to data-room-id on a descendant', () => {
    const el = item('<div data-room-id="ROOM-9"><span>x</span></div>');
    expect(getThreadId(el)).toBe('ROOM-9');
  });

  it('uses the href room id when no id attributes exist', () => {
    const el = item('<a href="https://chat.google.com/room/SPACE5">Team</a>');
    expect(getThreadId(el)).toBe('room/SPACE5');
  });

  it('combines group + topic ids so a thread differs from its parent space', () => {
    // Arrange: a space row and one of its thread rows (same group id).
    const space = document.createElement('div');
    space.setAttribute('data-group-id', 'space/AAA');
    const thread = document.createElement('div');
    thread.setAttribute('data-group-id', 'space/AAA');
    thread.setAttribute('data-topic-id', 'BBB');

    // Act / Assert
    expect(getThreadId(space)).toBe('space/AAA');
    expect(getThreadId(thread)).toBe('space/AAA/topic/BBB');
    expect(getThreadId(space)).not.toBe(getThreadId(thread));
  });

  it('falls back to a name hash and logs once per name', () => {
    // Arrange
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const make = (): HTMLElement => item('<span data-gcp-el="name">Unique Lunch Crew</span>');

    // Act
    const first = getThreadId(make());
    const second = getThreadId(make());

    // Assert
    expect(first).toBe(`name#${hashString('Unique Lunch Crew')}`);
    expect(second).toBe(first);
    expect(debug).toHaveBeenCalledTimes(1); // logged once, not per call
  });

  it('returns null when the item has no usable signal', () => {
    expect(getThreadId(item(''))).toBeNull();
  });
});
