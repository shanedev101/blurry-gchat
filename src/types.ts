export type PrivacyMode = 'off' | 'blur' | 'hide';

export interface GCPSettings {
  namesMode: PrivacyMode;
  previewMode: PrivacyMode;
  avatarsMode: PrivacyMode;
  chatNamesMode: PrivacyMode;
  chatMode: PrivacyMode;
  chatAvatarsMode: PrivacyMode;
  hoverReveal: boolean;
  sidebarCollapse: boolean;
  focusMode: boolean;
  autoShareProtect: boolean;
  panic: boolean;
  blurIntensity: number;
  opacity: number;
}
