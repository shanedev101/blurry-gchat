# 🚀 Shroudly - Chrome Web Store Submission Kit

This kit contains all the exact copy, descriptions, and permission justifications you need to copy-paste directly into the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).

---

## 📋 1. Basic Metadata

| Field                 | Copy to Paste                                                                            |
| :-------------------- | :--------------------------------------------------------------------------------------- |
| **Product Name**      | `Shroudly`                                                                               |
| **Short Description** | `Blur & hide for Google Chat - protect names, previews & avatars from shoulder-surfing.` |
| **Category**          | `Productivity` (or `Developer Tools` / `Social & Communication`)                         |
| **Official Homepage** | _(Your GitHub repository link)_                                                          |

> **Trademark note:** In the public store listing, reference the product as
> **"for Google Chat™"** (with the ™). "Shroudly" is your own brand; do not put
> "Google", "GChat", or any Google mark inside the product name itself. See
> [studio/RENAME_RESEARCH.md](studio/RENAME_RESEARCH.md).

---

## 📝 2. Detailed Store Description (English - Recommended for Global Reach)

```text
Shield your screen space and conversations dynamically! Shroudly is a premium, open-source privacy extension designed to protect sensitive workspace details on Google Chat from shoulder-surfing, accidental screen-sharing leaks, and video recordings.

Whether you are working in a bustling coffee shop, sharing your window on a Zoom call, or recording a software demo, Shroudly gives you granular, independent control over what is visible.

✨ KEY FEATURES:

👤 Granular 3-State Controls (OFF / BLUR / HIDE)
Independently manage privacy states across the Sidebar and Active Chat windows:
- Names: Blurs or hides conversation list names and sender tags.
- Messages: Obfuscates last message previews and live chat texts.
- Avatars: Shields profile pictures, initials, and group icons.

👁️ Hover to Reveal
Need a quick peak? Simply hover your mouse cursor over any blurred or hidden element to temporarily un-obfuscate it instantly.

📡 Screen Share Guard (Auto-Protect)
Total peace of mind! The extension automatically applies maximum blur protection the moment your browser detects active tab capturing/sharing. Once screen sharing ends, your custom layout settings are instantly restored.

😱 Panic Mode (Instant Blur)
Trigger a full-screen obfuscation instantly with a rapid hotkey combination: [Cmd/Ctrl] + [Shift] + [P] when someone unexpectedly approaches your desk.

🧵 Thread Manager
Pin, tag, and alias any conversation right from the sidebar. Find it again instantly with search across pins, tags, and aliases - and reorder or collapse the panel's sections to match your workflow.

💾 Backup & Restore
Export your full configuration (privacy settings, panel layout, and thread data) to a JSON file, and import it on another machine in one click.

🔌 Master Switch
One toggle instantly disables every privacy effect (confirmation required) without losing your saved configuration.

🔒 100% PRIVATE & SECURITY FIRST
- Runs entirely locally inside your browser sandbox.
- ZERO external server connections.
- ZERO data collection, tracking, or telemetry.
- Permissive open-source MIT licensed codebase.

⌨️ KEYBOARD SHORTCUTS REFERENCE:
- Cmd/Ctrl + Shift + L: Cycle Names Privacy states (Off -> Blur -> Hide)
- Cmd/Ctrl + Shift + P: Toggle Panic Mode (Full screen blur)
```

---

## ⚙️ 4. Privacy & Permissions Justifications

When filling out the **Privacy Practices** tab in the console, copy and paste these exact explanations:

| Field                        | Copy to Paste                                                                                                                                 |
| :--------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Purpose**             | `To provide granular privacy controls including blurring and hiding sensitive elements like names and messages on Google Chat.`               |
| **Permission: `storage`**      | `Required to save, load, and persist user preferences for privacy modes, blur intensity, and custom layout configurations locally.`           |
| **Permission: `tabCapture`**   | `Required to automatically detect active browser tab capturing and dynamically apply maximum blur protection during screen-sharing sessions.` |
| **Permission: `sidePanel`**    | `Required to render the extension's privacy controls in Chrome's native side panel alongside Google Chat.`                                    |
| **Host permission: `https://chat.google.com/*`** | `Required so the extension can read and apply blur/hide styling to the Google Chat page DOM; the extension does not run on any other site.` |

---

## 🎨 5. Graphical Assets Checklist

Ensure your graphic design assets meet these exact requirements before uploading:

1. **Extension Icon**:
   - File: `icons/icon128.png` (Included in your bundle).
   - Size: `128x128` pixels.
2. **Screenshots (Minimum 1, Recommended 2-4)**:
   - Size: `1280x800` or `640x400` pixels.
   - Format: PNG or JPEG.
   - _Tip: Take a screenshot of Google Chat with names and messages beautifully blurred to demonstrate the extension._
3. **Promotional Tile (Optional but recommended for premium store feel)**:
   - Size: `440x280` pixels.
   - _Tip: Design a neat card showing the Shroudly shield logo with dark modern glassmorphism styling._
