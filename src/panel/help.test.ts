/**
 * Tests for the section help popovers: open/close toggling, mutual exclusion,
 * outside-click and Escape dismissal, and that opening does not collapse the
 * surrounding section.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initHelp, closeAllPopovers, setPopoverOpen } from './help';

/** Build N help anchors (button + popover) inside a container. */
function buildAnchors(count: number): HTMLElement {
  const container = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const anchor = document.createElement('span');
    anchor.className = 'help-anchor';
    const button = document.createElement('button');
    button.className = 'help-btn';
    button.setAttribute('aria-expanded', 'false');
    button.dataset.index = String(i);
    const pop = document.createElement('div');
    pop.className = 'help-pop';
    anchor.appendChild(button);
    anchor.appendChild(pop);
    container.appendChild(anchor);
  }
  document.body.appendChild(container);
  return container;
}

const button = (root: ParentNode, i: number): HTMLButtonElement =>
  root.querySelectorAll<HTMLButtonElement>('.help-btn')[i];
const pop = (root: ParentNode, i: number): HTMLElement =>
  root.querySelectorAll<HTMLElement>('.help-pop')[i];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('setPopoverOpen', () => {
  it('reflects the open state on the popover class and button aria-expanded', () => {
    // Arrange
    const container = buildAnchors(1);

    // Act
    setPopoverOpen(button(container, 0), pop(container, 0), true);

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(true);
    expect(button(container, 0).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('initHelp', () => {
  it('opens a popover when its button is clicked', () => {
    // Arrange
    const container = buildAnchors(1);
    initHelp(container);

    // Act
    button(container, 0).click();

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(true);
  });

  it('closes the popover when its button is clicked a second time', () => {
    // Arrange
    const container = buildAnchors(1);
    initHelp(container);

    // Act
    button(container, 0).click();
    button(container, 0).click();

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(false);
  });

  it('closes any other open popover when a different button is clicked', () => {
    // Arrange
    const container = buildAnchors(2);
    initHelp(container);

    // Act
    button(container, 0).click();
    button(container, 1).click();

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(false);
    expect(pop(container, 1).classList.contains('open')).toBe(true);
  });

  it('closes open popovers on an outside document click', () => {
    // Arrange
    const container = buildAnchors(1);
    initHelp(container);
    button(container, 0).click();

    // Act
    document.body.click();

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(false);
  });

  it('closes open popovers when Escape is pressed', () => {
    // Arrange
    const container = buildAnchors(1);
    initHelp(container);
    button(container, 0).click();

    // Act
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(false);
  });

  it('does not bubble the button click to an enclosing collapse handler', () => {
    // Arrange
    const container = buildAnchors(1);
    let bubbled = false;
    container.addEventListener('click', () => {
      bubbled = true;
    });
    initHelp(container);

    // Act
    button(container, 0).click();

    // Assert
    expect(bubbled).toBe(false);
  });

  it('removes document listeners after cleanup so popovers stop responding', () => {
    // Arrange
    const container = buildAnchors(1);
    const cleanup = initHelp(container);
    button(container, 0).click();

    // Act
    cleanup();
    // Manually force-open, then a document click should NOT close it anymore.
    setPopoverOpen(button(container, 0), pop(container, 0), true);
    document.body.click();

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(true);
  });
});

describe('closeAllPopovers', () => {
  it('closes every open popover under the root', () => {
    // Arrange
    const container = buildAnchors(2);
    setPopoverOpen(button(container, 0), pop(container, 0), true);
    setPopoverOpen(button(container, 1), pop(container, 1), true);

    // Act
    closeAllPopovers(container);

    // Assert
    expect(pop(container, 0).classList.contains('open')).toBe(false);
    expect(pop(container, 1).classList.contains('open')).toBe(false);
  });
});
