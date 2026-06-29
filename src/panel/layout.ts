/**
 * Side panel layout controller.
 *
 * Owns the collapsible / drag-to-reorder behavior of the top-level panel
 * sections and persists their order + collapsed state to `chrome.storage.local`
 * so the layout survives reloads and reopening the panel. The DOM-free helpers
 * (`readOrder`, `applyOrder`, `applyCollapsed`, `toggleCollapsed`, `moveSection`)
 * are exported so the ordering/collapse logic can be unit-tested without
 * simulating native HTML5 drag-and-drop events.
 */

import type { PanelLayout } from '../types';
import { DEFAULT_LAYOUT, getLayout, onKeyChanged, setLayout, STORAGE_KEYS } from '../core/storage';

/** Container that directly holds the `.panel-section` elements. */
const CONTAINER_ID = 'panel-sections';
const SECTION_SELECTOR = '.panel-section';
const HEAD_SELECTOR = '.psec-head';
const COLLAPSED_CLASS = 'collapsed';
const DRAGGING_CLASS = 'dragging';
const DRAG_OVER_CLASS = 'drag-over';

/** Debounce window for persistence, matching the privacy sliders' cadence. */
const PERSIST_DEBOUNCE_MS = 150;

/**
 * Read the section ids in their current DOM order.
 *
 * @param container Element holding the `.panel-section` children.
 * @returns Section ids top-to-bottom (sections without an id are skipped).
 */
export function readOrder(container: Element): string[] {
  return Array.from(container.querySelectorAll(SECTION_SELECTOR))
    .map((el) => (el as HTMLElement).dataset.sectionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * Reorder the container's section children to match `order`.
 *
 * Sections present in the DOM but missing from `order` are kept and appended
 * after the ordered ones (in their existing relative order). This is what lets a
 * brand-new section appear without a stored-layout migration.
 *
 * @param container Element holding the `.panel-section` children.
 * @param order Desired section id order.
 */
export function applyOrder(container: Element, order: string[]): void {
  const sections = new Map<string, HTMLElement>();
  for (const el of Array.from(container.querySelectorAll(SECTION_SELECTOR))) {
    const id = (el as HTMLElement).dataset.sectionId;
    if (id) sections.set(id, el as HTMLElement);
  }

  // Append in the requested order first, then any leftovers not named in order.
  const placed = new Set<string>();
  for (const id of order) {
    const el = sections.get(id);
    if (el) {
      container.appendChild(el);
      placed.add(id);
    }
  }
  for (const [id, el] of sections) {
    if (!placed.has(id)) container.appendChild(el);
  }
}

/**
 * Apply collapsed flags to the sections, toggling the `collapsed` class.
 *
 * @param container Element holding the `.panel-section` children.
 * @param collapsed Map of section id -> collapsed. Missing ids default to open.
 */
export function applyCollapsed(container: Element, collapsed: Record<string, boolean>): void {
  for (const el of Array.from(container.querySelectorAll(SECTION_SELECTOR))) {
    const section = el as HTMLElement;
    const id = section.dataset.sectionId;
    if (!id) continue;
    section.classList.toggle(COLLAPSED_CLASS, Boolean(collapsed[id]));
  }
}

/**
 * Return a new collapsed map with `id`'s flag flipped. Pure: does not mutate
 * the input.
 *
 * @param collapsed Current collapsed map.
 * @param id Section id to toggle.
 * @returns A new collapsed map.
 */
export function toggleCollapsed(
  collapsed: Record<string, boolean>,
  id: string
): Record<string, boolean> {
  return { ...collapsed, [id]: !collapsed[id] };
}

/**
 * Move the dragged section so it sits immediately before the target section.
 * No-op when either id is unknown or both refer to the same section.
 *
 * @param container Element holding the `.panel-section` children.
 * @param draggedId Section being moved.
 * @param targetId Section to drop before.
 */
export function moveSection(container: Element, draggedId: string, targetId: string): void {
  if (draggedId === targetId) return;
  const dragged = sectionById(container, draggedId);
  const target = sectionById(container, targetId);
  if (!dragged || !target) return;
  container.insertBefore(dragged, target);
}

function sectionById(container: Element, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`${SECTION_SELECTOR}[data-section-id="${id}"]`);
}

/**
 * Initialize the layout controller: restore persisted layout, wire collapse +
 * drag-and-drop interactions, persist changes (debounced), and keep multiple
 * open panels in sync via the storage change subscription.
 *
 * @param root Root to search for the panel container. Defaults to `document`;
 *   tests pass a detached container's owner document or the element itself.
 * @returns An unsubscribe function that tears down the change subscription.
 */
export async function initLayout(root: ParentNode = document): Promise<() => void> {
  const container = root.querySelector<HTMLElement>(`#${CONTAINER_ID}`);
  if (!container) return () => {};

  // Working copy of the persisted layout; kept in sync with every write.
  let layout: PanelLayout = await getLayout();
  applyOrder(container, layout.order);
  applyCollapsed(container, layout.collapsed);

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = (): void => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void setLayout(layout), PERSIST_DEBOUNCE_MS);
  };

  // A completed drop sets this so the trailing synthetic click does not also
  // toggle the collapsed state of the section the user just dropped.
  let suppressNextHeadClick = false;
  let draggedId: string | null = null;

  for (const el of Array.from(container.querySelectorAll(SECTION_SELECTOR))) {
    const section = el as HTMLElement;
    const id = section.dataset.sectionId;
    const head = section.querySelector<HTMLElement>(HEAD_SELECTOR);
    if (!id || !head) continue;

    head.addEventListener('click', () => {
      if (suppressNextHeadClick) {
        suppressNextHeadClick = false;
        return;
      }
      layout = { ...layout, collapsed: toggleCollapsed(layout.collapsed, id) };
      applyCollapsed(container, layout.collapsed);
      persist();
    });

    head.addEventListener('dragstart', (event) => {
      draggedId = id;
      section.classList.add(DRAGGING_CLASS);
      // Required for Firefox/Chrome to actually start a drag session.
      event.dataTransfer?.setData('text/plain', id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });

    head.addEventListener('dragend', () => {
      section.classList.remove(DRAGGING_CLASS);
      draggedId = null;
      clearDragOver(container);
    });

    head.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      clearDragOver(container);
      if (draggedId && draggedId !== id) section.classList.add(DRAG_OVER_CLASS);
    });

    head.addEventListener('drop', (event) => {
      event.preventDefault();
      clearDragOver(container);
      if (!draggedId || draggedId === id) return;
      moveSection(container, draggedId, id);
      layout = { ...layout, order: readOrder(container) };
      suppressNextHeadClick = true;
      persist();
    });
  }

  // Sync DOM when another open panel changes the layout.
  const unsubscribe = onKeyChanged(STORAGE_KEYS.layout, (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const incoming = raw as PanelLayout;
    layout = {
      order: Array.isArray(incoming.order) ? incoming.order : layout.order,
      collapsed: incoming.collapsed ?? layout.collapsed,
    };
    applyOrder(container, layout.order);
    applyCollapsed(container, layout.collapsed);
  });

  return unsubscribe;
}

/** Remove the drag-over highlight from every section. */
function clearDragOver(container: Element): void {
  for (const el of Array.from(container.querySelectorAll(`.${DRAG_OVER_CLASS}`))) {
    el.classList.remove(DRAG_OVER_CLASS);
  }
}

// `DEFAULT_LAYOUT` is re-exported for callers that need the canonical default
// without reaching into the storage module directly.
export { DEFAULT_LAYOUT };
