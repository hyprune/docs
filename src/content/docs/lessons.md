---
title: "Lessons from Hypr3D"
description: "Where Hyprune came from: what we contributed to Hypr3D, and what it taught us."
---


[Hypr3D](https://github.com/samine825/Hypr3D) is samine825's Hyprland plugin that turns a workspace into a walkable 3D room: a C++ plugin with a GLES renderer, Jolt physics, Lua configuration and GLB scenes. We found it in its first release week (late September 2026), joined in, and contributed upstream: crash fixes on closing 3D mode and restoring windows, menus/popups/dialogs in the room, drawing under bars and launchers, a typing cursor, noclip and more.

| Upstream Hypr3D (vendored Jolt excluded) | Total | From us |
| --- | --- | --- |
| Commits on `main` | 135 | 29 (21%) |
| Pull requests | 11 opened | 8 merged, 2 open, 1 closed |
| Lines added | ~23.7k | ~1.7k |
| Lines surviving in `main` today | ~18.8k | ~1.5k (8%) |

Beyond upstream we kept going in our own fork: about 14.7k more lines across a series of concept branches (workspace screens, a quest-style HUD and director UI, travel and vehicles, multiple worlds, lightmapped rendering).

That is where we learned Hypr3D was asking a different question from ours. Hypr3D asks *what if a Hyprland workspace were 3D?*, a focus on windows in a 3D room. We wanted *what if the computer itself were an explorable world?*: a universe of worlds, places with purpose, and object-based apps. That needed a different architecture, so Hyprune is new code with fresh boundaries, not a fork. This page records what the prototype taught us (observations from our concept branch at commit `587434e`); it is not an asset source or compatibility promise.

## A callback after windows is still inside the frame

`src/main.cpp` and commit `c41176d` show why showing a cursor from the world update could crash later in `CMonitor::useFP16`: it re-entered compositor rendering before the outer pass had finished. Nested tests used a software cursor and missed the live DRM failure. Capture snapshots and workspace/focus transitions have the same hazard. Hyprune requires a checked, deferred phase after the outer render teardown—not merely a callback with “post” in its name.

## A texture is not a live application

The prototype's capture integration had to keep participating hidden-workspace clients unsuspended and deliver frame callbacks. Copying a stale buffer more often cannot make the client produce frames. Hyprune makes this a bounded capture lease with visibility, frame pacing and cleanup on exit/lock. Dirty-buffer and geometry checks avoid expensive repeated snapshot renders.

## Input must agree with the image

`src/HyprlandCompat/WindowCapture.*` stores geometry alongside the snapshot. `TODO.md` records third-person picking, thick-window front faces, natural scrolling and focus/workspace interaction as real failure cases. Hyprune uses the actual rendered camera, matching capture transforms, separate pointer and keyboard intent, and balanced releases on cancellation. Keyboard input to a window on a still-hidden workspace is rejected; using a wall window (E) first activates that window's native workspace, then routes the keyboard to it.

## A watched state file makes a poor animation clock

`docs/concept/hud-protocol.md` describes a roughly 10 Hz state file plus transient socket2 events. `quickshell/hypr3d/HudState.qml` shows the UI state and event machinery layered on that split. File watching/polling and a separate event channel create freshness and ordering problems. Hyprune uses one ordered IPC stream, atomic snapshots, revisioned deltas and presentation interpolation. Shell animation never drives simulation.

## Lighting needs its own data

`src/Render/GRAPHICS.md`, `MapModel.cpp` and commits `643d051`, `cbc9039`, `587434e` document the progression toward independent UV1 lightmaps and explicit color handling. A single color atlas conflates texture detail and illumination. Hyprune preserves material UV0, gives baked diffuse light its own UV1 and texture binding, and specifies decoding/composition once. It does not overload glTF's occlusion texture slot with RGB illumination.

## Reloads and outputs expose hidden state

The prototype TODO records stale same-path world reloads, spawn points inside geometry, multi-monitor geometry limits and input behind open overlays. Hyprune uses immutable package generations, atomic scene activation, validated spawns, per-output leases and cancellation on every ownership change. None of those reports is proof that the new runtime already solves them; they are regression scenarios for its test plan.

## Source audit and asset boundary

Reviewed locally: `src/main.cpp`, `src/Render/`, capture code, `quickshell/hypr3d/HudState.qml`, the HUD protocol document, `TODO.md`, and recent git history. No source code, artwork, scenes, textures or thumbnails were copied. Some prototype worlds used personal-use game assets. Official Hyprune content must be original or properly attributed CC0/CC-BY material.
