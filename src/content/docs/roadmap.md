---
title: "Roadmap"
description: "Four milestones with measurable exits, not calendar promises."
---


These are acceptance gates, not release dates. The current work establishes contracts and tooling; it does not claim M0 is already complete.

| Milestone | Outcome | Exit evidence |
| --- | --- | --- |
| **M0 · A safe place** | Exact-version Hyprland adapter, small helper, original static room, free-flight, hello/snapshot and emergency exit | Load/unload repeatedly; safe render-phase assertions; daemon failure returns desktop; no external asset dependency |
| **M1 · A usable desktop** | Planar live windows, capture leases, pointer/keyboard policy, reference shell, full control IPC | Hidden-workspace video stays live; app close mid-drag recovers; shell reconnect and output removal work; real DRM/hardware-cursor tests |
| **M2 · An authorable framework** | World tools, atomic world swaps, sandboxed process extensions, first provider contracts | A new original world validates without core edits; denied grants stay denied; extension crash/update/rollback works; licensing/provenance checked |
| **M3 · An ecosystem** | Independent shell, outside contributors, compatibility matrix, distribution and performance discipline | Second shell passes conformance; external world/provider needs no core patch; published frame/capture budgets and accessible interaction review |

## What is deliberately later

Third-party motion-intent streaming, portable widgets, custom GPU buffer transport, multi-seat routing and signed marketplace distribution need focused contracts. v0 does not reserve a vague implementation promise in their place. Native third-party plugins in the compositor are outside the public extension model.

## Next contributions

Review [IPC](/rfcs/0003-ipc/) and [world format](/rfcs/0004-world-format/) first. Build the smallest original room. Prove one live window and one reliable escape. Keep evidence close to each implementation PR; update milestone status only when the exit criteria actually pass.
