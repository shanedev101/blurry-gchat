/**
 * In-memory fake of the subset of the `chrome` extension API used by Shroudly.
 * It models `chrome.storage.local` (get/set/remove/clear) and
 * `chrome.storage.onChanged` with realistic behavior: writes diff against the
 * previous value and fire `onChanged` listeners with `{ oldValue, newValue }`
 * and area name `'local'`, exactly as the real API does.
 *
 * Keeping this faithful (rather than a bare stub) is what lets the same code
 * exercise both the panel and content-script sync paths under test.
 */

type StorageChange = { oldValue?: unknown; newValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;

export interface ChromeMock {
  storage: {
    local: {
      get: (keys: unknown, cb: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, cb?: () => void) => void;
      remove: (keys: string | string[], cb?: () => void) => void;
      clear: (cb?: () => void) => void;
    };
    onChanged: {
      addListener: (listener: ChangeListener) => void;
      removeListener: (listener: ChangeListener) => void;
    };
  };
  runtime: {
    lastError: chrome.runtime.LastError | undefined;
    onMessage: {
      addListener: (listener: (...args: unknown[]) => void) => void;
      removeListener: (listener: (...args: unknown[]) => void) => void;
    };
    sendMessage: (...args: unknown[]) => void;
  };
  tabs: {
    sendMessage: (...args: unknown[]) => void;
    query: (queryInfo: unknown, cb: (tabs: unknown[]) => void) => void;
  };
}

/**
 * Build a fresh chrome mock backed by an isolated in-memory store. Create a new
 * one per test (or call its store reset) to keep tests independent.
 *
 * @returns A {@link ChromeMock} suitable for assignment to `globalThis.chrome`.
 */
export function createChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};
  const changeListeners = new Set<ChangeListener>();

  function emit(changes: Record<string, StorageChange>): void {
    if (Object.keys(changes).length === 0) return;
    for (const listener of changeListeners) listener(changes, 'local');
  }

  return {
    storage: {
      local: {
        get(keys, cb) {
          const out: Record<string, unknown> = {};
          if (keys == null) {
            Object.assign(out, store);
          } else if (typeof keys === 'string') {
            if (keys in store) out[keys] = store[keys];
          } else if (Array.isArray(keys)) {
            for (const k of keys) if (k in store) out[k] = store[k];
          } else if (typeof keys === 'object') {
            // Object form: keys are names, values are defaults.
            for (const [k, def] of Object.entries(keys as Record<string, unknown>)) {
              out[k] = k in store ? store[k] : def;
            }
          }
          cb(out);
        },
        set(items, cb) {
          const changes: Record<string, StorageChange> = {};
          for (const [k, v] of Object.entries(items)) {
            const oldValue = store[k];
            store[k] = v;
            changes[k] = { oldValue, newValue: v };
          }
          emit(changes);
          cb?.();
        },
        remove(keys, cb) {
          const list = Array.isArray(keys) ? keys : [keys];
          const changes: Record<string, StorageChange> = {};
          for (const k of list) {
            if (k in store) {
              changes[k] = { oldValue: store[k], newValue: undefined };
              delete store[k];
            }
          }
          emit(changes);
          cb?.();
        },
        clear(cb) {
          const changes: Record<string, StorageChange> = {};
          for (const k of Object.keys(store)) {
            changes[k] = { oldValue: store[k], newValue: undefined };
            delete store[k];
          }
          emit(changes);
          cb?.();
        },
      },
      onChanged: {
        addListener(listener) {
          changeListeners.add(listener);
        },
        removeListener(listener) {
          changeListeners.delete(listener);
        },
      },
    },
    runtime: {
      lastError: undefined,
      onMessage: {
        addListener() {},
        removeListener() {},
      },
      sendMessage() {},
    },
    tabs: {
      sendMessage() {},
      query(_queryInfo, cb) {
        cb([]);
      },
    },
  };
}
