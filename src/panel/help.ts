/**
 * Section help popovers for the side panel.
 *
 * Each section exposes a small monochrome info button (`.help-btn`) paired with
 * a `.help-pop` element inside a `.help-anchor`. Clicking the button unfolds its
 * popover; opening one closes any other; clicking outside or pressing Escape
 * closes them all. All user-facing copy lives in the HTML (popup.html) so the
 * ASCII-only JS build constraint is never violated by this module.
 */

const ANCHOR_SELECTOR = '.help-anchor';
const BUTTON_SELECTOR = '.help-btn';
const POP_SELECTOR = '.help-pop';
const OPEN_CLASS = 'open';

/**
 * Open or close a single popover, keeping the button's `aria-expanded` in sync.
 *
 * @param button The triggering `.help-btn`.
 * @param pop The associated `.help-pop` element.
 * @param open Whether the popover should be shown.
 */
export function setPopoverOpen(button: HTMLElement, pop: HTMLElement, open: boolean): void {
  pop.classList.toggle(OPEN_CLASS, open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * Close every open popover found under `root`.
 *
 * @param root Scope to search. Defaults to `document`.
 */
export function closeAllPopovers(root: ParentNode = document): void {
  for (const anchor of Array.from(root.querySelectorAll(ANCHOR_SELECTOR))) {
    const button = anchor.querySelector<HTMLElement>(BUTTON_SELECTOR);
    const pop = anchor.querySelector<HTMLElement>(POP_SELECTOR);
    if (button && pop) setPopoverOpen(button, pop, false);
  }
}

/**
 * Wire up every section help popover under `root`.
 *
 * @param root Scope to search for help anchors. Defaults to `document`; tests
 *   pass a detached container.
 * @returns A cleanup function that removes the document-level listeners.
 */
export function initHelp(root: ParentNode = document): () => void {
  const anchors = Array.from(root.querySelectorAll(ANCHOR_SELECTOR));

  for (const anchor of anchors) {
    const button = anchor.querySelector<HTMLElement>(BUTTON_SELECTOR);
    const pop = anchor.querySelector<HTMLElement>(POP_SELECTOR);
    if (!button || !pop) continue;

    button.addEventListener('click', (event) => {
      // Stop the click from reaching the section head (which would toggle the
      // collapse state) or the document handler (which would re-close us).
      event.stopPropagation();
      const willOpen = !pop.classList.contains(OPEN_CLASS);
      closeAllPopovers(root);
      if (willOpen) setPopoverOpen(button, pop, true);
    });

    // Clicks inside the popover must not bubble to the collapse/outside handlers.
    pop.addEventListener('click', (event) => event.stopPropagation());
  }

  if (anchors.length === 0) return () => {};

  const onDocClick = (): void => closeAllPopovers(root);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeAllPopovers(root);
  };

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeyDown);
  };
}
