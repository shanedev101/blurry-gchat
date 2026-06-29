/**
 * Unit tests for deterministic pastel tag coloring.
 */

import { describe, it, expect } from 'vitest';
import { tagColor } from './tagColor';

describe('tagColor', () => {
  it('is deterministic for the same tag', () => {
    expect(tagColor('work')).toEqual(tagColor('work'));
  });

  it('returns a pastel background with a dark foreground', () => {
    // Arrange / Act
    const { bg, fg } = tagColor('urgent');

    // Assert
    expect(bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(fg).toBe('#10141a');
  });

  it('can assign different colors to different tags', () => {
    // Arrange: tags chosen so their char sums land on different palette slots.
    const colors = new Set(['a', 'b', 'c', 'd'].map((t) => tagColor(t).bg));

    // Assert
    expect(colors.size).toBeGreaterThan(1);
  });
});
