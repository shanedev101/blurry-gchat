/**
 * Integration tests for the in-page Unflow decoration. A fake Google Chat list
 * item is mounted in jsdom; decoration, toolbar actions, the inline alias/tag
 * editors, and live re-render on external store changes are exercised against
 * the chrome storage mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decorateItem, initInject } from './inject';
import { setThreads } from '../core/storage';

/** Mount a conversation list item with a tagged name and a stable room id. */
function mountItem(roomId = 'R1', name = 'Real Name'): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('data-room-id', roomId);
  const nameEl = document.createElement('span');
  nameEl.dataset.gcpEl = 'name';
  nameEl.textContent = name;
  item.appendChild(nameEl);
  document.body.appendChild(item);
  return item;
}

const nameText = (item: HTMLElement): string | null =>
  item.querySelector('[data-gcp-el="name"]')!.textContent;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('decorateItem', () => {
  it('injects the toolbar and records the thread id', async () => {
    // Arrange
    await initInject();
    const item = mountItem();

    // Act
    decorateItem(item);

    // Assert
    expect(item.getAttribute('data-gcp-thread-id')).toBe('R1');
    expect(item.querySelectorAll('.gcp-tb-btn')).toHaveLength(3); // PIN / TAG / ALIAS
  });

  it('does not inject a second toolbar on re-decoration', async () => {
    // Arrange
    await initInject();
    const item = mountItem();

    // Act
    decorateItem(item);
    decorateItem(item);

    // Assert
    expect(item.querySelectorAll(`.gcp-tb`)).toHaveLength(1);
  });
});

describe('toolbar actions', () => {
  it('pins via the toolbar, persists it, and reflects the pin badge + active state', async () => {
    // Arrange
    await initInject();
    const item = mountItem();
    decorateItem(item);

    // Act
    (item.querySelector('.gcp-tb-pin') as HTMLElement).click();

    // Assert
    await vi.waitFor(() => {
      expect(item.querySelector('.gcp-tb-pin')?.classList.contains('gcp-active')).toBe(true);
      expect(item.querySelector('.gcp-badge-pin')).not.toBeNull();
    });
  });
});

describe('inline alias editor', () => {
  it('shows the alias as a chip before the name and leaves the title untouched', async () => {
    // Arrange
    await initInject();
    const item = mountItem('R1', 'Real Name');
    decorateItem(item);

    // Act: open the alias editor, type, and commit with Enter.
    (item.querySelector('.gcp-tb-alias') as HTMLElement).click();
    const input = item.querySelector('.gcp-edit') as HTMLInputElement;
    input.value = 'My Boss';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Assert: a chip appears before the name; the real title is unchanged.
    await vi.waitFor(() => {
      const chip = item.querySelector('.gcp-alias-chip');
      expect(chip?.textContent).toBe('My Boss');
      expect(nameText(item)).toBe('Real Name');
      // Chip is positioned immediately before the name element.
      expect(chip?.nextElementSibling?.getAttribute('data-gcp-el')).toBe('name');
    });
  });

  it('does not throw when a blur fires after the editor already committed', async () => {
    // Arrange
    await initInject();
    const item = mountItem('R1', 'Real Name');
    decorateItem(item);
    (item.querySelector('.gcp-tb-alias') as HTMLElement).click();
    const input = item.querySelector('.gcp-edit') as HTMLInputElement;
    input.value = 'My Boss';

    // Act: Enter commits (removes the input), then the trailing blur fires.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const fireBlurAgain = (): void => input.dispatchEvent(new Event('blur'));

    // Assert: the second removal is guarded, so no NotFoundError is thrown.
    expect(fireBlurAgain).not.toThrow();
  });

  it('removes the alias chip when the alias is cleared', async () => {
    // Arrange
    await initInject();
    const item = mountItem('R1', 'Real Name');
    decorateItem(item);
    (item.querySelector('.gcp-tb-alias') as HTMLElement).click();
    let input = item.querySelector('.gcp-edit') as HTMLInputElement;
    input.value = 'My Boss';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() =>
      expect(item.querySelector('.gcp-alias-chip')?.textContent).toBe('My Boss')
    );

    // Act: reopen and clear it
    (item.querySelector('.gcp-tb-alias') as HTMLElement).click();
    input = item.querySelector('.gcp-edit') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Assert: chip gone, title still intact
    await vi.waitFor(() => expect(item.querySelector('.gcp-alias-chip')).toBeNull());
    expect(nameText(item)).toBe('Real Name');
  });
});

describe('tag toolbar', () => {
  it('adds a tag via the inline editor, persists it, and lights up the tag button', async () => {
    // Arrange
    await initInject();
    const item = mountItem();
    decorateItem(item);

    // Act: open the tag editor, type a tag, commit with Enter.
    (item.querySelector('.gcp-tb-tag') as HTMLElement).click();
    const input = item.querySelector('.gcp-edit') as HTMLInputElement;
    input.value = 'urgent';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Assert
    await vi.waitFor(() => {
      const chip = item.querySelector('.gcp-badge-tag') as HTMLElement | null;
      expect(chip?.textContent).toBe('urgent');
      expect(chip?.style.background).not.toBe(''); // pastel color applied inline
      expect(item.querySelector('.gcp-tb-tag')?.classList.contains('gcp-active')).toBe(true);
    });
  });
});

describe('removing tag / alias', () => {
  it('removes a tag when its in-page chip is clicked', async () => {
    // Arrange
    await setThreads({
      R1: { threadId: 'R1', pinned: false, following: false, tags: ['urgent'], updatedAt: 1 },
    });
    await initInject();
    const item = mountItem('R1');
    decorateItem(item);
    await vi.waitFor(() =>
      expect(item.querySelector('.gcp-badge-tag')?.textContent).toBe('urgent')
    );

    // Act
    (item.querySelector('.gcp-badge-tag') as HTMLElement).click();

    // Assert
    await vi.waitFor(() => expect(item.querySelector('.gcp-badge-tag')).toBeNull());
  });

  it('opens the alias editor (prefilled) when the alias chip is clicked', async () => {
    // Arrange
    await setThreads({
      R1: {
        threadId: 'R1',
        alias: 'Boss',
        pinned: false,
        following: false,
        tags: [],
        updatedAt: 1,
      },
    });
    await initInject();
    const item = mountItem('R1');
    decorateItem(item);
    await vi.waitFor(() => expect(item.querySelector('.gcp-alias-chip')?.textContent).toBe('Boss'));

    // Act
    (item.querySelector('.gcp-alias-chip') as HTMLElement).click();

    // Assert
    const input = item.querySelector('.gcp-edit') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe('Boss');
  });
});

describe('live re-render', () => {
  it('renders a tag badge when the store changes externally (e.g. from the panel)', async () => {
    // Arrange
    await initInject();
    const item = mountItem('R1');
    decorateItem(item);

    // Act: a panel-side write adds a tag.
    await setThreads({
      R1: {
        threadId: 'R1',
        pinned: false,
        following: false,
        tags: ['urgent'],
        updatedAt: 1,
      },
    });

    // Assert
    await vi.waitFor(() => {
      const chip = item.querySelector('.gcp-badge-tag');
      expect(chip?.textContent).toBe('urgent');
    });
  });
});
