/**
 * Deterministic pastel coloring for tags, shared by the in-page badges and the
 * panel chips so the same tag always gets the same color in both places.
 *
 * Pastel backgrounds with a near-black foreground keep chips soft (not harsh /
 * high-contrast) while staying easy to read.
 */

/** Soft pastel backgrounds; each pairs with a dark foreground for legibility. */
const TAG_PALETTE = [
  '#ffadad', // salmon
  '#ffd6a5', // peach
  '#fdffb6', // lemon
  '#caffbf', // mint
  '#9bf6ff', // sky
  '#a0c4ff', // periwinkle
  '#bdb2ff', // lavender
  '#ffc6ff', // pink
] as const;

/** Dark foreground used on every pastel background for readable text. */
const TAG_FOREGROUND = '#10141a';

/** A tag's background/foreground color pair. */
export interface TagColor {
  bg: string;
  fg: string;
}

/**
 * Map a tag name to a stable pastel color pair.
 *
 * @param tag The tag text.
 * @returns The `{ bg, fg }` colors to render the chip with.
 */
export function tagColor(tag: string): TagColor {
  let sum = 0;
  for (let i = 0; i < tag.length; i++) {
    sum = (sum + tag.charCodeAt(i)) % TAG_PALETTE.length;
  }
  return { bg: TAG_PALETTE[sum], fg: TAG_FOREGROUND };
}
