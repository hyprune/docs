---
title: "RFC-0006 — Interaction and movement modes"
description: "A fixed-step movement contract with a permanent route back to the desktop."
---

**Status: proposed v0 · 2026-10-07 · Implementation target, pending owner review.**


## Decision

Movement modes are replaceable controllers behind a core-owned policy boundary. Interactions are semantic actions evaluated by core against a world snapshot. A movement provider proposes motion; it never owns the seat, focus or authoritative player pose. The first built-ins are `com.hyprune.fly` and `com.hyprune.walk`. Free flight is available in M0; walking requires validated collision in M1/M2. Teleport and accessibility-oriented point navigation can follow without changing shells.

## Controller interface

The following is the **internal conceptual interface**, not an already published wire API:

```text
activate(context) -> initial controller state
step(dt, actionState, pose, collisionQueries) -> motionIntent
suspend(reason) -> release transient state
resume(context)
deactivate(reason)
```

`dt` is 1/60 second; pose uses RFC-0004 coordinates. Actions are named semantics (`move.forward`, `move.strafe`, `look`, `jump`, `interact`, `cancel`) with scalar/vector values after user binding and accessibility mapping. A motion intent proposes translation, orientation and a movement policy; the core clamps acceleration/speed, resolves collision, and commits the pose. Queries use immutable collision data and return bounded results. Providers cannot disable emergency exit or session-lock handling.

Mode switch via `movement.set` is atomic: suspend old controller, clear held actions, validate new mode against world features, activate at the current safe pose, publish revision. If activation fails, resume the old mode with cleared transient inputs and return an error. Walking rejects worlds without collision; do not silently turn gravity on inside an unvalidated scene. World changes select a safe supported mode and validated spawn.

## Interaction arbitration

Priority is lock/desktop escape -> compositor shortcuts -> exclusive shell overlay -> focused app interaction -> world action -> movement. A target ray comes from the camera used to render the visible frame. `interact` resolves a typed target (surface, anchor or approved integration action) once on press; a hold action cannot retarget halfway through. World data names anchors and zones, not arbitrary commands. Integrations expose registered actions through later broker contracts and explicit grants.

A plugin crash or missed movement deadline holds the last safe pose, clears movement velocity and shows a notice. A held key may never continue driving motion after shell claim, focus transition or reconnect. User configuration controls speed, sensitivity, inversion and bindings in core; shell is a settings view. Reduced motion supports instant transitions, no camera bob and a fixed horizon. Keyboard-only navigation and a direct desktop exit are required.

## Extension delivery

M0/M1 controllers are trusted built-ins compiled with core. M2 third-party movement controllers run out-of-process; avoid a synchronous round trip on every render. They consume bounded simulation snapshots and return timestamped, short-lived intents, which core validates and expires after 100 ms. **This fast-path protocol is deliberately not defined by IPC 0.1**: RFC-0003 only selects a registered mode. A follow-up RFC and schema version must specify sequencing, queries, deadlines and grants before third-party controllers are enabled. An extension manifest's `movementModes` field reserves IDs; it does not activate an unimplemented API.

Native third-party controllers in the compositor are rejected as a public extension mechanism: latency benefits do not justify session-wide crash and input risk. Deterministic replay of normalized actions, collision invariants, mode-switch cancellation and deadline failure are the conformance criteria for the eventual SDK.

## Amendment M3A: daily controls and live configuration

Super+Alt toggles movement/typing; a configurable evdev button also toggles it.
Typing shows a virtual world pointer, routes hover/click/scroll at its ray and
allows a native pointer on neighbouring outputs. Escape cancels world interaction;
F12 remains an independent emergency exit. Held movement is cleared on mode,
overlay, focus, reload, lock and world transitions. A press consumed by core owns
its matching release even after a handover.

F flies into an aimed workspace wall and hands over to native desktop input.
Super+Alt or the typing button flies back to the saved view. Keys 1–5 select
configured pointer/mount/path slots; path slots are reserved stubs for M3B.
C holds view magnification; V toggles noclip and F4 toggles flight by default.
Walking steps up collision risers up to 0.35 m, subject to capsule headroom;
falling a configurable distance below spawn respawns and clears velocity/input.

`hl.plugin.hyprune.config({...})` accepts validated partial tables. Unknown keys,
invalid keysyms, duplicate bindings, nonfinite numbers and out-of-range values
reject the complete patch. Deferred diff application preserves camera, window
poses and unchanged settings. Core's `docs/M3A.md` documents every local option.
The shell displays authoritative mode/tool state from IPC 0.5.

## Amendment: M3B keymap v2

The owner's `NOTES.md` defines four input modes: world, interactive (E use in place), focus (F smooth fullscreen), and menu. E supports workspace walls without moving the camera. F supports individual windows as well as workspaces. Super+Tab and Back leave interactive/focus; Esc leaves menu. TAB long hold opens Map, using the independent input config's `longHoldMs` (default 1000).

Core owns `$XDG_CONFIG_HOME/hyprune/input.json` (default `~/.config/hyprune/input.json`), watches its parent directory, validates edits and diff-applies them. JSON shares core's existing parser and IPC representation. Each action has zero to three key/chord/button/wheel bindings. Keyboard bindings use the current layout’s base-level symbol, canonicalize letters to lowercase, and match modifiers separately. A consumed key retains its press identity through release even if modifiers or layout change, so Shift does not break movement or TAB-hold cancellation. Invalid edits retain the last valid config. Hyprland Lua remains compositor setup; editing the input file never requests a Hyprland reload. The generated [keymap](/keymap/) is authoritative for defaults and option ranges.

An enabled binding steals any colliding Hyprland bind only while the world is active and only in its defining mode. The cancellable keyboard/button/axis hooks run before the native keybind manager. Consumed presses own their releases across transitions; native forwarded presses receive balanced manager releases. Native binds are never rewritten, so deactivate, unload and helper failure restore behavior through removal of interception. Uncolliding binds retain native dispatch. The settings collision list reads native keybind records; descriptions for Lua dispatchers can fall back to dispatcher/reference when Hyprland stores no description. Keycode and multi-key native binds are intercepted by the actual triggering event, but their configuration descriptions currently require a manual check.

Tools are 1 normal, 2 window (place/lock), 3 path (open/closed × line/curve/arc), 4 position (move/rotate/scale), and 5 reserved. Position handles use axis arrows, cubes with uniform centre, and rotation arcs. Shift snaps translation to 0.1 m, rotation to 15° and scale factors to 0.1. Paths and object transforms are per-world/area overlays; authored packages are read-only. Window OBB placement checks and real client configure remain required.

All cursor, focus and workspace effects are deferred after the frame. Shader and geometry drawing save/restore GL state and never invoke compositor rendering. Nested software-cursor evidence cannot validate hardware-cursor transitions; those require the core's supervised live checklist.

## Amendment: supervised live desktop integration

While active, newly mapped toplevels on the world output join the world without
rewriting native workspace membership. Baseline desktop windows remain desktop
windows. Core gives new clients safe ephemeral poses in the current home's free
zone, with oriented-rectangle clearance and collision recovery; safe camera
placement plus a notice handles unavailable zones. Authored placements still win.

The unbound typing mouse button (Back by default) in world mode enters a real
cursor mode for the world's visible top/overlay layers and popups. Movement and
mouse look stop. Off-layer world input remains swallowed from hidden desktop
windows. Back/Super+Tab leaves this interactive mode; native noncolliding binds
retain their usual behavior. All cursor/focus/workspace changes remain deferred.

## Amendment: live retest input conventions and diagnostics

Input v2 gains optional `invert_y: boolean` (default false). Screen coordinates
increase right/down; camera heading increases right, pitch up, in a +Y-up world
with zero forward -Z. Quaternion +Y uses right-handed angles, so camera heading
maps to negative quaternion Y. Carried facing and grab offset follow the camera
quaternion delta together. Core ray tests and native reticle share screen Y.

Debug and capture are scoped actions in world, interactive, focus and menu.
Older input files use each mode's default for missing debug/capture bindings
without an implicit file rewrite; explicit empty lists stay disabled. The
compatible IPC 0.6 input schema amendment permits these optional fields and
preserves earlier protocol contracts. F3/Y draws core diagnostics in world;
F3 does so in the other modes. U captures in world; Super+U captures in
interactive, focus and menu, leaving ordinary U/Y available for client typing.
Capture persists a private timestamped
JSON and PNG from core's completed world frame outside the compositor pass;
JSON identifies frame camera, source and age. Native 2D focus therefore captures
the last world frame, not a compositor desktop snapshot. Readback restores GL
state, encoding runs asynchronously, and a notice reports success or failure.
