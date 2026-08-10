/**
 * Shared type definitions for Shroudly.
 *
 * These types are the single source of truth for every persisted shape. The
 * golden rule for backward compatibility: only ever ADD optional fields here -
 * never rename or remove an existing field - so old data keeps loading after an
 * upgrade and new data stays readable by an older build.
 */

export type PrivacyMode = 'off' | 'blur' | 'hide';

/**
 * Privacy shield settings. Persisted under the `gcp-settings` storage key.
 * This is the original, pre-Unflow shape and must remain stable.
 */
export interface GCPSettings {
  /** Master switch. When false the extension applies no effects at all. */
  enabled: boolean;
  namesMode: PrivacyMode;
  previewMode: PrivacyMode;
  avatarsMode: PrivacyMode;
  chatNamesMode: PrivacyMode;
  chatMode: PrivacyMode;
  chatAvatarsMode: PrivacyMode;
  hoverReveal: boolean;
  autoShareProtect: boolean;
  panic: boolean;
  blurIntensity: number;
  opacity: number;
}

/**
 * Side panel layout state. Persisted under the `gcp-panel-layout` key.
 *
 * `order` lists section ids top-to-bottom; `collapsed` maps a section id to
 * whether its body is hidden. Unknown ids are tolerated on read so a section
 * added in a future build does not break an older layout (and vice versa).
 */
export interface PanelLayout {
  order: string[];
  collapsed: Record<string, boolean>;
}

/**
 * Unflow per-thread metadata for a single Google Chat conversation.
 *
 * `originalTitle` snapshots the real conversation title so an alias can be
 * displayed without losing the source value (used for restore and matching).
 */
export interface ThreadMeta {
  threadId: string;
  alias?: string;
  originalTitle?: string;
  pinned: boolean;
  /**
   * Deprecated: the "Follow" feature was merged into "Pin". Retained so existing
   * data round-trips unchanged (backward-compat rule); no UI sets it anymore.
   */
  following: boolean;
  tags: string[];
  updatedAt: number;
}

/**
 * Map of threadId -> ThreadMeta. Persisted under the `gcp-threads` key.
 * Empty entries (no alias/pin/follow/tags) are pruned on write to keep the
 * store compact.
 */
export type ThreadStore = Record<string, ThreadMeta>;

/**
 * Self-describing export bundle produced by the backup feature (Phase 10).
 *
 * `version` is the bundle schema version used by import-time migration; it is
 * independent of any individual storage key's shape. Each `data` slice is
 * optional so a partial bundle (e.g. settings only) imports cleanly.
 *
 * `app` is the format discriminator (`'shroudly'`); importers should reject any
 * bundle whose `app` does not match.
 */
export interface BackupFile {
  app: 'shroudly';
  version: number;
  exportedAt: number;
  data: {
    settings?: GCPSettings;
    layout?: PanelLayout;
    threads?: ThreadStore;
  };
}
