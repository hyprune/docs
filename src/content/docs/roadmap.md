---
title: "Roadmap"
description: "Milestones with measurable exits, their status on 9 October 2026, and what comes next."
---

Milestones are acceptance gates, not release dates. A milestone is **done** only when its exit evidence exists. Evidence lives with the implementation in each repository; the [progress page](/progress/) has the dated history.

<span class="status-done">done</span> exit evidence met · <span class="status-partial">partial</span> some exits met · <span class="status-next">ahead</span> not started

## Milestones

| Milestone | Status | Where it stands |
| --- | --- | --- |
| **M0 · A safe place**<br/>Exact-version Hyprland adapter, small helper, original static room, free flight, hello/snapshot and emergency exit | <span class="status-done">done</span> | Plugin for Hyprland 0.56.2 with an ABI guard, `hypruned`, original CC0 room, flight and F12 exit. Repeated unload/reload, render-phase assertions and GL state restore are tested, and the desktop returns 0.052 s after the daemon dies. Verified in nested sessions. |
| **M1 · A usable desktop**<br/>Live windows, capture leases, pointer/keyboard policy, reference shell, full control IPC | <span class="status-partial">partial</span> | Live windows on world surfaces, capture leases that keep hidden workspaces producing frames, input ownership, the Quickshell shell and IPC 0.15 all work. Output removal and shell reconnect with credential renewal are tested. **Still open:** the supervised live checklist for real DRM and hardware-cursor sessions, and recovery when an app closes mid-drag (on that checklist). |
| **M2 · An authorable framework**<br/>World tools, atomic world swaps, sandboxed process extensions, first provider contracts | <span class="status-partial">partial</span> | World validation and packing in the SDK, atomic world swaps (a failed load keeps the current world), denied grants stay denied, provenance checks, and seven world format versions. **Still open:** the extension host (sandboxed process extensions with crash, update and rollback). Some Lumen Reach features still use world-specific adapters in core instead of generic contracts. |
| **M3 · An ecosystem**<br/>Independent shell, outside contributors, compatibility matrix, distribution, performance discipline | <span class="status-next">ahead</span> | Distribution has started: Nix flake, NixOS and Home Manager modules, kits and an Arch installer. Frame budgets are measured. Still ahead: a second shell passing conformance, outside contributors (component repositories are not public yet), a compatibility matrix and an accessibility review. |
| **M4 · Optional GPU offload** ([RFC-0009](/rfcs/0009-offload-renderer/)) | <span class="status-partial">partial</span> | **Phase 1 merged, off by default.** A supervised Vulkan worker renders on a discrete GPU, with DMA-BUF hand-off, native windows composited locally with depth, power admission (50 W / 45 FPS on USB-C or battery, 80 W / 60 FPS on qualified mains), a 500 ms lease watchdog, immediate local fallback and runtime switching in Performance → Offload. Tested in nested sessions only. **Still open:** physical power-profile qualification, a validation-layer run, and proof of a sustained benefit over local rendering. Later phases (depth transport, dynamic scale, reprojection, more outputs) haven't started. |

The core repository also uses finer internal stage names (M2 workspace homes, M3A hands-on interaction, M3B keymap v2). Those were steps inside M1 and M2 above.

## Also done

These are outside the original milestone table, but shipped and documented:

- **Climbing** with three styles (grab, look-to-climb, auto-traverse): [world 0.4](/reference/schema/world/0.4/), [IPC 0.11](/reference/schema/ipc/0.11/).
- **Workspace homes from the world:** the world room is workspace 20 and each area's home is 20 + its slot, so Lumen Reach uses 21–24.
- **Playable bounds:** [world 0.6](/reference/schema/world/0.6/) declares where the camera may fly.
- **Compressed assets:** [world 0.7](/reference/schema/world/0.7/) accepts KTX2 textures, meshopt and quantised meshes.
- **Render on demand and FSR 1:** idle scenes cost almost nothing; dynamic resolution holds 60 FPS at 4K on an iGPU.
- **Tool slots and the pocket:** [IPC 0.15](/reference/schema/ipc/0.15/) gives every tool the same Primary/Secondary/Alternate/Cycle bindings.
- **Free cursor:** Super+Tab or Back hands over a real cursor and freezes the camera.
- **Recording and replay** of input and camera for deterministic tests: [IPC 0.12](/reference/schema/ipc/0.12/).
- **Recovery:** the shell quarantines invalid frames, resyncs from a snapshot and renews its credentials without dropping the session.
- **Ink outlines and visibility regions:** [world 0.5](/reference/schema/world/0.5/).

## What comes next

The priority is **playable before polish**: worlds that hold up from any angle you can reach, with fixes over redesigns and proven engine techniques over hand tuning.

1. **Finish M1 on real hardware.** Run the supervised live checklist, including every hardware-cursor transition, and close the app-closes-mid-drag case.
2. **A staged world pipeline.** Lock a world's metrics first (eye height, stair rise, doorway and screen clearances), walk-test a greybox, and only then add art. Each stage gets cheap, deterministic gates: navmesh and route clearance, any-angle sweeps, sky and leak checks. Several gates already run on Lumen Reach.
3. **A managed object library.** Reusable, instanced props with per-instance lightmap rectangles, so worlds are assembled from tested pieces instead of rebuilt per scene. This needs a world format after 0.7.
4. **Ship the compressed format.** Move Lumen Reach to world format 0.7 and to 0.6 playable volumes, replacing its generated collision backstops.
5. **Cheaper visibility.** Derive cell and portal culling from the world rather than authoring it by hand; frustum culling is already in.
6. **The extension host** and the remaining M2 contracts, then opening the repositories to outside contributors.

## What is deliberately later

Third-party motion-intent streaming, portable widgets, custom GPU buffer transport, multi-seat routing and signed marketplace distribution each need their own contract first. v0 doesn't reserve vague promises in their place. Native third-party plugins inside the compositor are outside the public extension model.
