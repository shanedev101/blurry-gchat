/**
 * Global Vitest setup. Installs a fresh in-memory chrome mock before every test
 * so storage state never leaks between tests. Individual tests can still grab
 * the active mock via `globalThis.chrome` and drive `onChanged`.
 */

import { beforeEach } from 'vitest';
import { createChromeMock } from './helpers/chromeMock';

beforeEach(() => {
  // A new mock per test guarantees isolation of the in-memory storage backing.
  (globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
});
