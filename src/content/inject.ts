/**
 * In-page Unflow decoration for Google Chat conversation list items.
 *
 * For each tagged list item this module:
 *  - injects a hover toolbar (pin / follow / tag / alias);
 *  - applies the saved alias over the conversation name (stashing the original
 *    so it can be restored);
 *  - renders pin and tag badges.
 *
 * It keeps an in-memory mirror of the `gcp-threads` store, refreshed via
 * `chrome.storage.onChanged`, so re-rendering after a change made here or in the
 * side panel is synchronous. All glyphs live in `styles.css` (via `::before`
 * content) so this file stays pure ASCII for the content-script build.
 */

import { getThreadId } from '../core/chat';
import { tagColor } from '../core/tagColor';
import { getThreads, onKeyChanged, STORAGE_KEYS } from '../core/storage';
import { addTag, removeTag, setAlias, togglePin } from '../features/threads';
import type { ThreadMeta, ThreadStore } from '../types';

const TOOLBAR_CLASS = 'gcp-tb';
const BADGES_CLASS = 'gcp-badges';
const EDIT_CLASS = 'gcp-edit';
const ALIAS_CHIP_CLASS = 'gcp-alias-chip';
const THREAD_ID_ATTR = 'data-gcp-thread-id';

/** In-memory mirror of the persisted thread store. */
let cache: ThreadStore = {};

/** When false (master switch off) no decoration is added and existing decoration is removed. */
let injectionEnabled = true;

/**
 * Load the thread store and start mirroring changes. Call once at content-script
 * startup, before/around the first decoration pass.
 */
export async function initInject(): Promise<void> {
  cache = await getThreads();
  onKeyChanged(STORAGE_KEYS.threads, () => {
    void getThreads().then((next) => {
      cache = next;
      redecorateAll();
    });
  });

  // Let the side panel ask us to focus a conversation by id.
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message: unknown) => {
      const msg = message as { type?: string; threadId?: string };
      if (msg?.type === 'GCP_FOCUS_THREAD' && typeof msg.threadId === 'string') {
        focusThread(msg.threadId);
      }
    });
  }

  redecorateAll();
}

/**
 * Scroll a decorated conversation into view and activate it.
 *
 * @param threadId The thread id to focus.
 * @returns `true` if a matching item was found and clicked.
 */
export function focusThread(threadId: string): boolean {
  for (const item of Array.from(document.querySelectorAll<HTMLElement>(`[${THREAD_ID_ATTR}]`))) {
    if (item.getAttribute(THREAD_ID_ATTR) !== threadId) continue;
    item.scrollIntoView({ block: 'center' });
    const clickable = item.querySelector<HTMLElement>('a, [role="link"]') ?? item;
    clickable.click();
    return true;
  }
  return false;
}

/**
 * Enable or disable all in-page decoration (driven by the master switch).
 * Turning it off removes every toolbar/badge/editor and restores aliased names;
 * turning it back on re-decorates the existing items.
 *
 * @param enabled Whether decoration should be active.
 */
export function setInjectionEnabled(enabled: boolean): void {
  if (injectionEnabled === enabled) return;
  injectionEnabled = enabled;
  if (enabled) {
    document
      .querySelectorAll<HTMLElement>(`[${THREAD_ID_ATTR}]`)
      .forEach((item) => decorateItem(item));
  } else {
    teardownAll();
  }
}

/** Remove all injected UI (toolbars, badges, alias chips, editors). */
function teardownAll(): void {
  document
    .querySelectorAll(`.${TOOLBAR_CLASS}, .${BADGES_CLASS}, .${EDIT_CLASS}, .${ALIAS_CHIP_CLASS}`)
    .forEach((el) => el.remove());
  document.querySelectorAll('.gcp-aliased').forEach((el) => el.classList.remove('gcp-aliased'));
}

/**
 * Decorate a single (already tagged) conversation list item: resolve its thread
 * id, ensure the toolbar exists, and render alias/badges from the cache.
 *
 * @param item A conversation list item element.
 */
export function decorateItem(item: HTMLElement): void {
  if (!injectionEnabled) return;
  const threadId = getThreadId(item);
  if (!threadId) return;
  item.setAttribute(THREAD_ID_ATTR, threadId);
  item.classList.add('gcp-item');
  ensureToolbar(item);
  render(item, threadId);
}

/** Re-render every decorated item from the current cache. */
function redecorateAll(): void {
  document.querySelectorAll<HTMLElement>(`[${THREAD_ID_ATTR}]`).forEach((item) => {
    const threadId = item.getAttribute(THREAD_ID_ATTR);
    if (threadId) render(item, threadId);
  });
}

// --- TOOLBAR ---

/** Build the hover toolbar once per item. */
function ensureToolbar(item: HTMLElement): void {
  if (item.querySelector(`:scope > .${TOOLBAR_CLASS}`)) return;

  const toolbar = document.createElement('div');
  toolbar.className = TOOLBAR_CLASS;
  toolbar.appendChild(makeButton('gcp-tb-pin', 'PIN', 'Pin to top of Thread Manager'));
  toolbar.appendChild(makeButton('gcp-tb-tag', 'TAG', 'Add tag'));
  toolbar.appendChild(makeButton('gcp-tb-alias', 'ALIAS', 'Set alias'));
  toolbar.addEventListener('click', (event) => onToolbarClick(event, item));
  item.appendChild(toolbar);
}

/**
 * Create one toolbar button with a crisp text label (clearer than an icon and
 * on-brand with the terminal/mono aesthetic).
 */
function makeButton(actionClass: string, label: string, aria: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gcp-tb-btn ${actionClass}`;
  button.textContent = label;
  button.setAttribute('aria-label', aria);
  button.title = aria;
  return button;
}

/** Route a toolbar button click to the matching thread mutation. */
function onToolbarClick(event: Event, item: HTMLElement): void {
  const target = (event.target as HTMLElement).closest('.gcp-tb-btn');
  if (!target) return;
  // Never let a toolbar click bubble into Google's own item navigation.
  event.preventDefault();
  event.stopPropagation();

  const threadId = item.getAttribute(THREAD_ID_ATTR);
  if (!threadId) return;
  const title = currentOriginalTitle(item);

  if (target.classList.contains('gcp-tb-pin')) void togglePin(threadId, title);
  else if (target.classList.contains('gcp-tb-tag')) openEditor(item, 'tag', threadId);
  else if (target.classList.contains('gcp-tb-alias')) openEditor(item, 'alias', threadId);
}

// --- INLINE EDITOR (alias / tag) ---

/**
 * Show a small inline text input for the alias or a new tag. Enter commits,
 * Escape or blur cancels. Only one editor is open per item at a time.
 */
function openEditor(item: HTMLElement, kind: 'alias' | 'tag', threadId: string): void {
  if (item.querySelector(`:scope > .${EDIT_CLASS}`)) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = EDIT_CLASS;
  input.placeholder = kind === 'alias' ? 'Alias (empty to clear)' : 'New tag';
  if (kind === 'alias') input.value = cache[threadId]?.alias ?? '';

  // Guard against double removal: committing removes the input, which fires its
  // own blur handler that would try to remove it again (NotFoundError).
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    input.remove();
  };

  const commit = (): void => {
    const value = input.value;
    const title = currentOriginalTitle(item);
    close();
    if (kind === 'alias') void setAlias(threadId, value, title);
    else void addTag(threadId, value, title);
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    // Keep keystrokes from reaching Google Chat's own shortcuts.
    event.stopPropagation();
  });
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('blur', close);

  item.appendChild(input);
  anchorEditorToName(item, input);
  input.focus();
  // Pre-select the current alias so the user can immediately overwrite it.
  if (kind === 'alias') input.select();
}

/**
 * Anchor the inline editor over the item's name element.
 *
 * Different item types (a main conversation vs. a thread row) have different
 * geometry, so a fixed position only lines up for one of them. Measuring the
 * name element and placing the input there keeps it aligned for every item type.
 * Falls back to the CSS default position when the name cannot be measured.
 */
function anchorEditorToName(item: HTMLElement, input: HTMLElement): void {
  const nameEl = item.querySelector<HTMLElement>('[data-gcp-el="name"]');
  if (!nameEl) return;

  const itemRect = item.getBoundingClientRect();
  const nameRect = nameEl.getBoundingClientRect();
  if (itemRect.width === 0 || nameRect.width === 0) return; // not laid out (e.g. tests)

  input.style.left = `${Math.max(4, nameRect.left - itemRect.left)}px`;
  input.style.top = `${nameRect.top - itemRect.top}px`;
  input.style.right = 'auto';
  input.style.transform = 'none';
  // Give the field a little breathing room beyond the name's own width.
  input.style.width = `${Math.min(itemRect.width - 12, Math.max(120, nameRect.width + 48))}px`;
}

/** The conversation's real title (the name is never overwritten anymore). */
function currentOriginalTitle(item: HTMLElement): string | undefined {
  const nameEl = item.querySelector<HTMLElement>('[data-gcp-el="name"]');
  return nameEl?.textContent?.trim() || undefined;
}

// --- RENDER ---

/** Apply alias, badges, and toolbar active-state for one item from the cache. */
function render(item: HTMLElement, threadId: string): void {
  const meta = cache[threadId];
  applyAlias(item, meta);
  applyBadges(item, meta);
  applyToolbarState(item, meta);
}

/**
 * Show the alias as a chip placed right before the name, leaving Google's own
 * title (and its icon) untouched. This avoids overwriting the title element -
 * which on some item types (Home threads) sits where the icon is and overflows
 * for long aliases. The chip is width-capped with an ellipsis so it never spills.
 */
function applyAlias(item: HTMLElement, meta: ThreadMeta | undefined): void {
  const nameEl = item.querySelector<HTMLElement>('[data-gcp-el="name"]');
  if (!nameEl) return;

  let chip = item.querySelector<HTMLElement>(`.${ALIAS_CHIP_CLASS}`);
  if (meta?.alias) {
    if (!chip) {
      chip = document.createElement('span');
      chip.className = ALIAS_CHIP_CLASS;
      // Click the chip to edit/clear the alias.
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const threadId = item.getAttribute(THREAD_ID_ATTR);
        if (threadId) openEditor(item, 'alias', threadId);
      });
      nameEl.insertAdjacentElement('beforebegin', chip);
    }
    if (chip.textContent !== meta.alias) chip.textContent = meta.alias;
    chip.title = `Alias: ${meta.alias} - click to edit`;
    item.classList.add('gcp-aliased');
  } else {
    chip?.remove();
    item.classList.remove('gcp-aliased');
  }
}

/** Rebuild the pin + tag badges row. */
function applyBadges(item: HTMLElement, meta: ThreadMeta | undefined): void {
  let badges = item.querySelector<HTMLElement>(`:scope > .${BADGES_CLASS}`);
  if (!badges) {
    badges = document.createElement('div');
    badges.className = BADGES_CLASS;
    item.appendChild(badges);
  }

  badges.textContent = '';
  if (!meta) return;

  const threadId = item.getAttribute(THREAD_ID_ATTR) ?? '';

  if (meta.pinned) {
    const pin = document.createElement('span');
    pin.className = 'gcp-badge gcp-badge-pin';
    pin.textContent = 'PIN';
    pin.setAttribute('aria-label', 'Pinned');
    badges.appendChild(pin);
  }
  for (const tag of meta.tags) {
    const chip = document.createElement('span');
    chip.className = 'gcp-badge gcp-badge-tag';
    chip.textContent = tag;
    chip.title = `Tag: ${tag} - click to remove`;
    const { bg, fg } = tagColor(tag);
    chip.style.background = bg;
    chip.style.color = fg;
    chip.style.borderColor = bg;
    // Click a tag chip to remove that tag.
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (threadId) void removeTag(threadId, tag);
    });
    badges.appendChild(chip);
  }
}

/** Reflect pinned/tagged on the toolbar buttons for visual feedback. */
function applyToolbarState(item: HTMLElement, meta: ThreadMeta | undefined): void {
  item.querySelector('.gcp-tb-pin')?.classList.toggle('gcp-active', Boolean(meta?.pinned));
  // Tag's only other feedback (the badges row) can be clipped by Google's
  // fixed-height rows, so light up the tag button whenever tags exist.
  item
    .querySelector('.gcp-tb-tag')
    ?.classList.toggle('gcp-active', Boolean(meta && meta.tags.length > 0));
}
