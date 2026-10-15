# Voiceflow Floating Stealth HUD Co-Pilot Specification

This document serves as the architectural and design specification for the **Voiceflow Floating Stealth HUD Co-Pilot**. It captures the exact intended behavior, window mechanics, visual aesthetics, and stealth properties.

---

## Visual Concept & Preview

![Voiceflow Floating HUD Concept](C:/Users/Bello%20Imam/.gemini/antigravity-ide/brain/a65a34bc-86e0-4985-8e9b-8e3d2a921b14/voiceflow_floating_hud_mockup_1791993855690.jpg)

### What This Image Represents:
* **Background Workspace**: Active technical interview with code editor on the left and a live video meeting on the right.
* **Pure Floating Overlay**: Zero black borders, zero dark backdrop, and no full-screen window blocking the desktop.
* **Top Pill**:
  * Glowing emerald badge: **`Undetectable: ON`**.
  * Real-time session timer (`00:15:22`) with pulsing red recording indicator.
  * Draggable grip handle to reposition the widget anywhere across multiple monitors.
* **Chat Card**:
  * Translucent obsidian glassmorphic card (`#121215` with frosted backdrop blur and hairline border).
  * User prompt rendered in a rounded orange badge (*"What should I say next?"*).
  * Voiceflow AI answers delivered in clean, glanceable bullet points ready to speak out loud.
* **Quick-Action Triggers**: Instant 1-click buttons:
  * 🖥️ **Analyze Screen**
  * 💡 **Suggest Answer**
  * 🔄 **Recap**

---

## 1. Core Principles & Intended Behavior

### 1.1 Total Desktop Transparency (Zero Black Screen)
* When **"Start Voiceflow"** or **"Resume Session"** is triggered, the main application window must not remain full-screen or display a black background.
* The main dashboard collapses completely (`height: 0`, `display: none`).
* The native Tauri window shrinks directly to the widget dimensions:
  * **Open / Expanded**: ~640px × 540px
  * **Collapsed / Hidden**: ~350px × 70px pill
* The surrounding desktop, IDE, browser, and meeting windows remain **100% visible, clickable, and interactive**.

### 1.2 Unmaximize First (Windows OS Requirement)
* In Windows OS, a maximized window (`WS_MAXIMIZE`) ignores `setSize()`.
* **Requirement**: The app must call `await win.unmaximize()` prior to resizing. This unlocks the window from full-screen so it can shrink into the floating widget.
* When recording stops, the window restores to a centered `1024×768` desktop dashboard.

### 1.3 Permanent Top-Level Stacking (Highest Z-Index)
* `win.setAlwaysOnTop(true)` must be enforced so the floating HUD never slips behind other windows when typing in VS Code, clicking in browser tabs, or switching apps.

### 1.4 True 100% Stealth & Screen Capture Protection
* When Stealth Mode is active (`isStealth: true`):
  * Excludes window from video capture via Windows native API `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`.
  * Remote participants on **Zoom, Google Meet, Microsoft Teams, Discord, and OBS** see only your code editor or slides; the Voiceflow floating HUD is completely invisible to them.
  * Taskbar presence is removed (`win.setSkipTaskbar(true)`).

### 1.5 Window Anchoring & Movement
* On session start, the widget automatically anchors at **top-center** (`posY: 35px`, centered horizontally).
* The user can freely drag the widget to any screen corner (e.g. top-right or bottom-right).

---

## 2. Technical Implementation Checklist

| Component | Responsibility | Status |
| :--- | :--- | :--- |
| `src-tauri/tauri.conf.json` | Set `"transparent": true`, `"shadow": false`, frameless borders | Configured |
| `src/components/dashboard/meeting-widget.tsx` | Unmaximize on start, resize to 640×540, anchor top-center, fixed inset-0 positioning | Implemented |
| `src/components/desktop/TauriWrapper.tsx` | Collapse dashboard to `h-0` during recording so DOM does not push widget down | Implemented |
| `src/app/api/ask-screen/route.ts` | Groq models (`llama-3.3-70b-versatile`) + conversational fallbacks | Deployed |
| Vercel Environment | AI keys & Flutterwave payment credentials synced to production | Live & Verified |
