/**
 * Unit + light integration tests for the panel layout controller. Pure helpers
 * are tested directly; `initLayout` is exercised against a jsdom container with
 * the chrome storage mock to cover restore, collapse persistence, reorder
 * persistence, and external-change sync.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyCollapsed,
  applyOrder,
  initLayout,
  moveSection,
  readOrder,
  toggleCollapsed,
} from './layout';
import { setLayout, getLayout } from '../core/storage';

// Each test builds its own panel; reset the shared jsdom document first so a
// stale `#panel-sections` from a previous test cannot shadow the new one.
beforeEach(() => {
  document.body.innerHTML = '';
});

/** Build the panel DOM with the given section ids and return the container. */
function buildPanel(ids: string[]): HTMLElement {
  const container = document.createElement('div');
  container.id = 'panel-sections';
  for (const id of ids) {
    const section = document.createElement('div');
    section.className = 'panel-section';
    section.dataset.sectionId = id;
    const head = document.createElement('div');
    head.className = 'psec-head';
    head.setAttribute('draggable', 'true');
    section.appendChild(head);
    const body = document.createElement('div');
    body.className = 'psec-body';
    section.appendChild(body);
    container.appendChild(section);
  }
  document.body.appendChild(container);
  return container;
}

/** Dispatch a drag event carrying a dataTransfer stub. */
function fireDrag(target: Element, type: string): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  (event as unknown as { dataTransfer: object }).dataTransfer = {
    setData: () => {},
    getData: () => '',
    effectAllowed: '',
    dropEffect: '',
  };
  target.dispatchEvent(event);
}

describe('readOrder', () => {
  it('returns section ids in DOM order', () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);

    // Act
    const order = readOrder(container);

    // Assert
    expect(order).toEqual(['privacy', 'unflow']);
  });
});

describe('applyOrder', () => {
  it('reorders sections to match the requested order', () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);

    // Act
    applyOrder(container, ['unflow', 'privacy']);

    // Assert
    expect(readOrder(container)).toEqual(['unflow', 'privacy']);
  });

  it('appends DOM sections absent from the requested order', () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow', 'backup']);

    // Act
    applyOrder(container, ['unflow', 'privacy']);

    // Assert
    expect(readOrder(container)).toEqual(['unflow', 'privacy', 'backup']);
  });
});

describe('applyCollapsed', () => {
  it('adds the collapsed class only to flagged sections', () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);

    // Act
    applyCollapsed(container, { privacy: true, unflow: false });

    // Assert
    const privacy = container.querySelector('[data-section-id="privacy"]');
    const unflow = container.querySelector('[data-section-id="unflow"]');
    expect(privacy?.classList.contains('collapsed')).toBe(true);
    expect(unflow?.classList.contains('collapsed')).toBe(false);
  });
});

describe('toggleCollapsed', () => {
  it('flips the flag for the given id without mutating the input', () => {
    // Arrange
    const original = { privacy: false };

    // Act
    const next = toggleCollapsed(original, 'privacy');

    // Assert
    expect(next.privacy).toBe(true);
    expect(original.privacy).toBe(false);
  });
});

describe('moveSection', () => {
  it('moves the dragged section before the target', () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow', 'backup']);

    // Act
    moveSection(container, 'backup', 'privacy');

    // Assert
    expect(readOrder(container)).toEqual(['backup', 'privacy', 'unflow']);
  });

  it('is a no-op when ids are equal', () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);

    // Act
    moveSection(container, 'privacy', 'privacy');

    // Assert
    expect(readOrder(container)).toEqual(['privacy', 'unflow']);
  });
});

describe('initLayout', () => {
  it('restores persisted order and collapsed state on init', async () => {
    // Arrange
    await setLayout({ order: ['unflow', 'privacy'], collapsed: { privacy: true } });
    const container = buildPanel(['privacy', 'unflow']);

    // Act
    await initLayout(document);

    // Assert
    expect(readOrder(container)).toEqual(['unflow', 'privacy']);
    expect(
      container.querySelector('[data-section-id="privacy"]')?.classList.contains('collapsed')
    ).toBe(true);
  });

  it('persists collapsed state when a section head is clicked', async () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);
    await initLayout(document);
    const head = container.querySelector('[data-section-id="privacy"] .psec-head') as HTMLElement;

    // Act
    head.click();
    await vi.waitFor(async () => {
      const stored = await getLayout();
      expect(stored.collapsed.privacy).toBe(true);
    });

    // Assert
    expect(
      container.querySelector('[data-section-id="privacy"]')?.classList.contains('collapsed')
    ).toBe(true);
  });

  it('persists the new order after a drag-and-drop reorder', async () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);
    await initLayout(document);
    const sourceHead = container.querySelector(
      '[data-section-id="unflow"] .psec-head'
    ) as HTMLElement;
    const targetHead = container.querySelector(
      '[data-section-id="privacy"] .psec-head'
    ) as HTMLElement;

    // Act: drag "unflow" onto "privacy" so it lands before it.
    fireDrag(sourceHead, 'dragstart');
    fireDrag(targetHead, 'dragover');
    fireDrag(targetHead, 'drop');

    // Assert
    expect(readOrder(container)).toEqual(['unflow', 'privacy']);
    await vi.waitFor(async () => {
      const stored = await getLayout();
      expect(stored.order).toEqual(['unflow', 'privacy']);
    });
  });

  it('syncs the DOM when the layout changes in another panel', async () => {
    // Arrange
    const container = buildPanel(['privacy', 'unflow']);
    await initLayout(document);

    // Act: simulate an external write (e.g. a second open side panel).
    await setLayout({ order: ['unflow', 'privacy'], collapsed: {} });

    // Assert
    expect(readOrder(container)).toEqual(['unflow', 'privacy']);
  });
});
