/**
 * Master on/off switch in the panel header.
 *
 * Reflects and toggles the `enabled` field of `gcp-settings`. Turning the
 * extension ON applies immediately; turning it OFF first asks for confirmation
 * via the in-panel modal (disabling stops all blurring and Thread Manager
 * decoration, though saved data is kept). The switch stays in sync if `enabled`
 * changes elsewhere.
 */

import { getSettings, onKeyChanged, setSettings, STORAGE_KEYS } from '../core/storage';

/**
 * Wire the master switch and its confirm modal.
 *
 * @param root Scope containing the header switch and modal. Defaults to `document`.
 */
export function initPower(root: ParentNode = document): void {
  const toggle = root.querySelector<HTMLInputElement>('#master-toggle');
  if (!toggle) return;

  const label = root.querySelector<HTMLElement>('#master-label');
  const modal = root.querySelector<HTMLElement>('#confirm-modal');
  const cancelBtn = root.querySelector<HTMLElement>('#confirm-cancel');
  const okBtn = root.querySelector<HTMLElement>('#confirm-ok');

  const reflect = (enabled: boolean): void => {
    toggle.checked = enabled;
    if (label) label.textContent = enabled ? 'ON' : 'OFF';
    document.body.classList.toggle('panel-disabled', !enabled);
  };

  const persist = async (enabled: boolean): Promise<void> => {
    // Read-modify-write so we never clobber the privacy fields.
    const settings = await getSettings();
    await setSettings({ ...settings, enabled });
    reflect(enabled);
  };

  const openModal = (): void => modal?.removeAttribute('hidden');
  const closeModal = (): void => modal?.setAttribute('hidden', '');

  void getSettings().then((s) => reflect(s.enabled));

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      void persist(true);
    } else {
      // Disabling is destructive to the active view, so confirm first; keep the
      // switch visually ON until the user actually confirms.
      toggle.checked = true;
      openModal();
    }
  });

  okBtn?.addEventListener('click', () => {
    closeModal();
    void persist(false);
  });

  cancelBtn?.addEventListener('click', () => {
    closeModal();
    reflect(true);
  });

  // Stay in sync if another context flips the master switch.
  onKeyChanged(STORAGE_KEYS.settings, () => {
    void getSettings().then((s) => reflect(s.enabled));
  });
}
