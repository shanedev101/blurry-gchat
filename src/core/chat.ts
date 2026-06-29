/**
 * Google Chat DOM helpers shared by the content script and the panel logic.
 *
 * The hard problem these functions solve is deriving a *stable* identifier for a
 * conversation list item, even though Google ships obfuscated, frequently
 * changing class names. `getThreadId` therefore tries three increasingly weak
 * strategies in order, so a single brittle source never breaks identity:
 *
 *   1. stable data attributes (`data-thread-id` / `data-room-id` / `data-member-id`)
 *   2. the `/room/...` or `/dm/...` segment of an anchor href
 *   3. a deterministic hash of the conversation's display name (last resort)
 *
 * The hash fallback accepts the known risk that two conversations with identical
 * names collide; it warns once per name so the situation is diagnosable.
 */

/** Stable data attributes that may carry a conversation id, in priority order. */
const ID_ATTRS = ['data-thread-id', 'data-room-id', 'data-member-id'] as const;

/** Names already warned about, so the fallback logs at most once per name. */
const warnedTitles = new Set<string>();

/**
 * Deterministic, order-stable string hash (djb2) rendered as base-36.
 *
 * @param input String to hash.
 * @returns A short, stable token derived from `input`.
 */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    // hash * 33 + charCode, kept in 32-bit range for cross-run stability.
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Extract a `<type>/<id>` thread id from a Google Chat href.
 *
 * @param href The anchor href to inspect.
 * @returns e.g. `"room/AAAA"` or `"dm/BBBB"`, or `null` if the href has neither.
 *   The type prefix is kept so a room and a DM sharing an id never collide.
 */
export function extractThreadIdFromHref(href: string): string | null {
  const match = href.match(/\/(room|dm)\/([^/?#]+)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Read the conversation's display name from a tagged list item.
 *
 * @param item A conversation list item element.
 * @returns The trimmed name (preferring the `[data-gcp-el="name"]` tag added by
 *   the content script), or `null` if the item has no text at all.
 */
export function getThreadTitle(item: HTMLElement): string | null {
  const named = item.querySelector('[data-gcp-el="name"]');
  const tagged = (named?.textContent ?? '').trim();
  if (tagged) return tagged;

  const own = (item.textContent ?? '').trim();
  return own || null;
}

function readDataId(item: HTMLElement): string | null {
  for (const attr of ID_ATTRS) {
    const own = item.getAttribute(attr);
    if (own) return own;
    const descendant = item.querySelector(`[${attr}]`)?.getAttribute(attr);
    if (descendant) return descendant;
  }
  return null;
}

/**
 * Resolve a Space/thread id from `data-group-id` (+ `data-topic-id`).
 *
 * Google Chat tags Space rows with a stable `data-group-id`, and a thread row
 * additionally carries a `data-topic-id`. Combining them yields ids that are
 * stable across re-renders AND distinct between a Space and its threads (which
 * a name hash cannot guarantee, since they share the Space's name).
 *
 * @param item A conversation list item element.
 * @returns e.g. `"space/AAA"` or `"space/AAA/topic/BBB"`, or `null`.
 */
function readGroupTopicId(item: HTMLElement): string | null {
  const group =
    item.getAttribute('data-group-id') ??
    item.querySelector('[data-group-id]')?.getAttribute('data-group-id');
  if (!group) return null;
  const topic =
    item.getAttribute('data-topic-id') ??
    item.querySelector('[data-topic-id]')?.getAttribute('data-topic-id');
  return topic ? `${group}/topic/${topic}` : group;
}

function readHrefId(item: HTMLElement): string | null {
  const anchors = item.matches('a[href]')
    ? [item as HTMLAnchorElement]
    : Array.from(item.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const anchor of anchors) {
    const id = extractThreadIdFromHref(anchor.getAttribute('href') ?? '');
    if (id) return id;
  }
  return null;
}

/**
 * Derive a stable thread id for a conversation list item.
 *
 * @param item A conversation list item element.
 * @returns A stable id string, or `null` when the item carries no usable signal
 *   (no id attributes, no chat href, and no text to hash).
 */
export function getThreadId(item: HTMLElement): string | null {
  const fromData = readDataId(item);
  if (fromData) return fromData;

  const fromGroup = readGroupTopicId(item);
  if (fromGroup) return fromGroup;

  const fromHref = readHrefId(item);
  if (fromHref) return fromHref;

  const title = getThreadTitle(item);
  if (title) {
    if (!warnedTitles.has(title)) {
      warnedTitles.add(title);
      // Diagnostic only (this is an expected fallback for items Google renders
      // without a stable id/href). Kept at debug level to avoid console noise.
      console.debug(
        `[Shroudly] Thread id derived from name hash for "${title}"; duplicate names may collide.`
      );
    }
    return `name#${hashString(title)}`;
  }

  return null;
}
