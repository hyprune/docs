---
title: "Roadmap"
description: "Milestones with measurable exits, their status on 12 October 2026, and what comes next."
---

Milestones are acceptance gates, not release dates. A milestone is **done** only when its exit evidence exists. Evidence lives with the implementation in each repository; the [progress page](/progress/) has the dated history.

<span class="status-done">done</span> exit evidence met · <span class="status-partial">partial</span> some exits met · <span class="status-next">ahead</span> not started

## Milestones

| Milestone | Status | Where it stands |
| --- | --- | --- |
| **M0 · A safe place**<br/>Exact-version Hyprland adapter, small helper, original static room, free flight, hello/snapshot and emergency exit | <span class="status-done">done</span> | Plugin for Hyprland 0.56.2 with an ABI guard, `hypruned`, original CC0 room, flight and F12 exit. Repeated unload/reload, render-phase assertions and GL state restore are tested, and the desktop returns 0.052 s after the daemon dies. Verified in nested sessions. |
| **M1 · A usable desktop**<br/>Live windows, capture leases, pointer/keyboard policy, reference shell, full control IPC | <span class="status-partial">partial</span> | Live windows on world surfaces, capture leases that keep hidden workspaces producing frames, input ownership, the Quickshell shell and IPC 0.23 all work. Output removal and shell reconnect with credential renewal are tested. **Still open:** the supervised live checklist for real DRM and hardware-cursor sessions, and recovery when an app closes mid-drag (on that checklist). |
| **M2 · An authorable framework**<br/>World tools, atomic world swaps, sandboxed process extensions, first provider contracts | <span class="status-partial">partial</span> | World validation and packing in the SDK, atomic world swaps (a failed load keeps the current world), denied grants stay denied, provenance checks, and nine world format versions. **Still open:** the extension host (sandboxed process extensions with crash, update and rollback). Lumen Reach now uses the canonical areas, mounts and placement contracts; its routes and stairs still use world-specific extensions. |
| **M3 · An ecosystem**<br/>Independent shell, outside contributors, compatibility matrix, distribution, performance discipline | <span class="status-next">ahead</span> | Distribution has started: Nix flake, NixOS and Home Manager modules, kits and an Arch installer. Frame budgets are measured. Every repository has been public since 11 October 2026. Still ahead: a second shell passing conformance, outside contributors, a compatibility matrix and an accessibility review. |
| **M4 · Optional GPU offload** ([RFC-0009](/rfcs/0009-offload-renderer/)) | <span class="status-partial">partial</span> | **Phase 1 merged, off by default.** A supervised Vulkan worker renders on a discrete GPU, with DMA-BUF hand-off, native windows composited locally with depth, power admission (laptops: 50 W / 45 FPS on USB-C or battery, 80 W / 60 FPS on qualified mains; without a battery, 75% of the offload GPU's enforced power limit), a 500 ms lease watchdog, immediate local fallback and runtime switching in Performance → Offload. Since IPC 0.18 it picks the offload GPU itself, and it also works when the compositor runs on NVIDIA, same-GPU or cross-GPU. A two-GPU desktop stayed active at 60 FPS in all five tested configurations. Tested in nested sessions only. **Still open:** physical power-profile qualification, a validation-layer run, and proof of a sustained benefit over local rendering. Later phases (depth transport, dynamic scale, reprojection, more outputs) haven't started. |

The core repository also uses finer internal stage names (M2 workspace homes, M3A hands-on interaction, M3B keymap v2). Those were steps inside M1 and M2 above.

## Also done

These are outside the original milestone table, but shipped and documented:

- **Residents** ([world 0.9](/reference/schema/world/0.9/), [IPC 0.23](/reference/schema/ipc/0.23/)): characters walk authored paths, stop, sit on seats, keep clear of the player and can guide you. The starter library's residents can be placed from the catalog. Core 0.5.0.
- **Object catalog and user placements** ([IPC 0.22](/reference/schema/ipc/0.22/)): installed libraries form a catalog; objects come out of the pocket with tool 5 and are saved per world. The first official library, hyprune-starter 0.1.0, is published.
- **Quests and markers** ([IPC 0.21](/reference/schema/ipc/0.21/)): a TAB tap shows waypoints and markers for a moment; personal quests and focus sessions.
- **Gizmo 2.0 and the path tool:** move, rotate and scale handles on tool 4; path points to drag, insert and delete on tool 3, with undo.
- **Prebuilt core:** every core tag publishes a build for Hyprland 0.56.2, which [Try it](/try-it/) uses when the ABI matches.
- **Climbing** with three styles (grab, look-to-climb, auto-traverse): [world 0.4](/reference/schema/world/0.4/), [IPC 0.11](/reference/schema/ipc/0.11/).
- **Workspace homes from the world:** the world room is workspace 20 and each area's home is 20 + its slot, so Lumen Reach uses 21–24.
- **Playable bounds:** [world 0.6](/reference/schema/world/0.6/) declares where the camera may fly.
- **Compressed assets:** [world 0.7](/reference/schema/world/0.7/) accepts KTX2 textures, meshopt and quantised meshes.
- **Render on demand and FSR 1:** idle scenes cost almost nothing; dynamic resolution holds 60 FPS at 4K on an iGPU. [IPC 0.16](/reference/schema/ipc/0.16/) makes the upscaler selectable.
- **Lumen Reach 0.8.0 on world format 0.7:** compressed textures and geometry cut the package by 41% and GPU memory by 45% with the same frame time. A performance gate in the release build fails a release that gets slower than the previous one.
- **Shader work:** the world shader is specialised for the active effect preset (world shading 21% faster on Intel Low), and shaders compile in parallel with the upload.
- **Capture watermark:** optional, off by default, stamped only on saved captures.
- **Lumen Reach 0.9.0:** visibility regions derived at build time, per-area playable volumes with a 60 m fly ceiling, collision backstops only where a walker can reach, and the canonical areas contract.
- **Idle at rest:** workspace walls recompose only when their windows change, taking nested GPU busy at rest from about 2% to 0.07%.
- **Autodrive on stairs:** autodrive and autopilot walk routes like the player, climbing stairs and ramps.
- **Frame pacing and clarity:** ticks follow presented frames and use their real time, and frame-rate targets pace evenly; frame interval variation drops from 0.087 to 0.004. Walls render at native resolution, so text on them is nearly as sharp as native (0.89 against 0.48 before).
- **Director blueprints and pocket actions** ([IPC 0.20](/reference/schema/ipc/0.20/)): each world's map as a per-level blueprint generated at build time (walls, floors, stairs, openings, screens, areas, routes), with level switching, pan and zoom; put windows in the pocket and take them out from the Director; Walk/Fly as a two-way toggle.
- **Player settings and reticle** ([IPC 0.19](/reference/schema/ipc/0.19/)): field of view, walk and run speed, view bob, reach limits for grabbing, mounting and placing, and a contextual reticle in six styles.
- **Capture notes** ([IPC 0.17](/reference/schema/ipc/0.17/)): after U, the shell asks why, and notes collect in one file.
- **Hands-on fixes:** static world geometry, carrying from behind (a 239 ms stall now takes 0.16 ms), wallpaper on empty walls, tool-mount snapping, robust render-pass tracking.
- **Room windows at their docks:** windows that already exist when a world loads take their authored docks instead of waiting in the pocket.
- **Black-pixel shader fix:** guards against invalid values in the world shader (7,800 black pixels to 5 at a tester's pose), found by replaying the tester's capture pose.
- **A second test machine and nightly regression:** a headless two-GPU machine runs isolated nested sessions and, every night, every automatable suite plus the schema, SDK and shell tests and the world builds. It has already found a render-pass tracking leak, a daemon start-up race and offload failing on NVIDIA compositors.
- **Smaller fixes:** long window titles clamped to protocol limits, and a carried window no longer drops into a wall behind it.
- **Tool slots and the pocket:** [IPC 0.15](/reference/schema/ipc/0.15/) gives every tool the same Primary/Secondary/Alternate/Cycle bindings.
- **Free cursor:** Super+Tab or Back hands over a real cursor and freezes the camera.
- **Recording and replay** of input and camera for deterministic tests: [IPC 0.12](/reference/schema/ipc/0.12/).
- **Recovery:** the shell quarantines invalid frames, resyncs from a snapshot and renews its credentials without dropping the session.
- **Ink outlines and visibility regions:** [world 0.5](/reference/schema/world/0.5/).

## What comes next

The priority is **playable before polish**: worlds that hold up from any angle you can reach, with fixes over redesigns and proven engine techniques over hand tuning.

1. **Finish M1 on real hardware.** Run the supervised live checklist, including every hardware-cursor transition, and close the app-closes-mid-drag case.
2. **A staged world pipeline.** Lock a world's metrics first (eye height, stair rise, doorway and screen clearances), walk-test a greybox, and only then add art. Each stage gets cheap, deterministic gates: navmesh and route clearance, any-angle sweeps, sky and leak checks. Several gates already run on Lumen Reach, including a performance gate in its release build.
3. **Worlds from tested pieces.** World format 0.8 places reusable, instanced, probe-lit objects; the catalog, user placement, paths, seats and residents from [RFC-0011](/rfcs/0011-objects/) (draft) have shipped. [RFC-0014](/rfcs/0014-builder/) (draft) imports and simplifies models inside Hyprune and turns an imported scene into a world in its own git-versioned folder, with saves and releases.
4. **The extension host** and the remaining M2 contracts, and a path for outside contributors now that the repositories are public. [RFC-0013](/rfcs/0013-live-objects/) (draft) uses it for a bundled, no-code source helper that lets objects show live data.

## What is deliberately later

Third-party motion-intent streaming, portable widgets, custom GPU buffer transport, multi-seat routing and signed marketplace distribution each need their own contract first. v0 doesn't reserve vague promises in their place. Native third-party plugins inside the compositor are outside the public extension model.
