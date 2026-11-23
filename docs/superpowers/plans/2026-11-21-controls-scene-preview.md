# Controls Scene Preview Implementation Plan

> **For agentic workers:** Execute inline in this session. Keep the existing launcher JSON contract and verify both desktop browser fixtures and the Android bundle.

**Goal:** Make control and interface management editable over an in-context Terraria-style scene preview.

**Architecture:** Extend the existing full-screen React editor with scene backgrounds, game-shaped control artwork and a slot-based inventory preview. Keep one normalized 16:9 canvas for both management modes. Canvas pointer gestures update the same profile draft used by the inspector, with snapping and resize handles.

**Tech Stack:** React, TypeScript, CSS, Playwright.

---

### Task 1: Scene preview

**Files:**
- Modify ui/launcher/src/features/native/controls-editor.tsx
- Modify ui/launcher/src/styles/controls-editor.css
- Test ui/launcher/tests/native-bridge.cjs

- [x] Add scene selectors for HUD, inventory, crafting and world controls.
- [x] Draw a representative hotbar/inventory/equipment/crafting backdrop using DOM slot primitives and the editor's existing region geometry.
- [x] Render controls by kind, including stick knobs, button glyphs, dpad directions, radial sectors, touchpad, wheel and text.
- [x] Verify scene selection preserves editor draft and works at landscape and portrait viewports.

### Task 2: Direct canvas editing

**Files:**
- Modify ui/launcher/src/features/native/controls-editor.tsx
- Modify ui/launcher/src/styles/controls-editor.css
- Test ui/launcher/tests/native-bridge.cjs

- [x] Add optional normalized grid snapping to drag operations.
- [x] Add resize handles that update control size or launcher-control dimensions.
- [x] Add interface-region resize handles that update region scale while preserving clamping.
- [x] Keep inspector values synchronized with canvas drags/resizes and preserve existing undo/redo checkpoints.

### Task 3: Verification

**Files:**
- Modify ui/launcher/tests/native-bridge.cjs

- [x] Cover background switching, snapping, control movement/resizing, interface movement/resizing and save/reopen.
- [x] Run TypeScript build and the native bridge browser test.
- [x] Rebuild APK and verify the launcher bundle includes the updated editor.
