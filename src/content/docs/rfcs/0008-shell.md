---
title: "RFC-0008 — Shell contract"
description: "The minimum obligations of any Hyprune shell."
---

**Status: proposed v0 · 2026-10-07 · Implementation target, pending owner review.**


## Decision

Quickshell is the reference implementation, not the definition of Hyprune. Any shell that implements the control-plane client and overlay/escape behavior below is eligible. It is a separate process. No polling a JSON file, scraping Hyprland socket2, or requiring internal core classes.

## Minimum conformance

A shell MUST negotiate IPC `0.1`, request approved grants, subscribe atomically to state, replace snapshot state on reconnect, apply deltas only at the expected revision, and honor session revocation. It MUST discover available methods/events and show unavailable controls as unavailable. The interactive shell profile requires hello, ping, subscribe/snapshot/unsubscribe, shell claim/release/overlay, surface focus, movement set, world load and runtime exit. An M0 client can be a diagnostic viewer without claiming full conformance.

It MUST expose current world/movement mode, a clear indication of who receives keyboard/pointer input, an accessible path back to ordinary desktop mode, world selection, and actionable runtime notices. Missing world art, extension providers or network services must not prevent exit. Permission prompts must show package identity, digest change and requested grants, and must be backed by a core-owned approval mechanism before extensions are enabled; there is no public self-approval RPC in v0.

## Output leases and overlays

`shell.claim({outputs})` claims a nonempty set of current runtime output IDs atomically. One shell may own each output; a conflict rejects the entire claim (-32004). Policy chooses the shell at launch; new shells cannot evict existing ones. Success returns a connection-owned lease ID. Unknown outputs return -32003. Output hot-unplug removes that output and its overlays from leases; empty leases are revoked and state is published. The shell must observe this and close the corresponding UI.

`shell.overlay({leaseId, outputId, visible, exclusiveInput})` requires lease ownership and output membership. `exclusiveInput: true` requires `visible: true`; hidden overlays cannot grab input. When accepted, core clears movement/held input and hands relevant input to the shell layer. The shell should request the lease state before mapping an interactive layer, then map only after success; close by unmapping its layer and releasing exclusivity immediately. Layer creation itself occurs outside the core's render pass. Core validates the requesting shell's Wayland client association through the trusted launcher; other clients cannot impersonate it by naming a lease.

On disconnect, revocation, `shell.release`, world exit or session lock, core clears overlay exclusivity and releases held input. Disconnect/release additionally destroys the lease; world exit/lock may keep nonexclusive leases for ordinary UI. The plugin watchdog handles daemon death. A lease applies only to the current authenticated connection; it is never persisted across restart. Shells must not grab unrelated outputs.

## Presentation and accessibility

Use top/overlay layer-shell surfaces, with dimensions and scale from the actual output. Keep ordinary layer UI outside world captures to prevent recursive feedback. Render state samples smoothly using a short interpolation buffer, but show focus and grants only after authoritative confirmation. Reduced-motion mode disables smoothing and animated travel; input feedback remains immediate. High-contrast light/dark themes, keyboard navigation, readable focus indicators and configurable shortcuts are reference-shell requirements.

Shell widgets display local presentation state; world and movement authority stay in core. A shell may choose a map, command palette or minimal panel; no specific visual metaphor is required. Optional features such as 3D projected markers require a future camera/projection contract rather than guessing from position-only state in IPC 0.1.

## Failure and conformance tests

Keep a local disconnected indicator; do not freeze an obsolete overlay as if it were live. On reconnect get a new supervisor token, negotiate, replace the snapshot and claim fresh leases. Never replay focus/world mutations automatically. Test delayed/out-of-order responses (match by ID), missed delta revisions, exclusive overlay focus, two shells competing for one output, output removal, daemon death, session lock and emergency exit.

SDK will provide a fake daemon and scripted conformance suite. M1's acceptance is a reference shell passing those cases; M3 requires a second shell written independently against these documents. The protocol has succeeded when that shell needs no changes to core.

## First-session amendment: IPC 0.3

The interactive reference profile now negotiates `0.3`. Frozen 0.1/0.2 remain available with their exact state projections. `shell.bind({leaseId,pid})`, requiring `shell.control`, binds a direct Wayland child of the authenticated IPC peer. PID is a bounded local association selector, never a surface identity. Core obtains the IPC PID from SO_PEERCRED, rejects caller-supplied private context, verifies child parentage and process start time, and checks the selected output's `hyprune-hud` layer against Wayland client PID/UID credentials. The passive HUD must exist before binding. No client-supplied identity or namespace alone establishes authority. The binding is connection/lease scoped, not persisted; PID reuse, client destruction, disconnect, output removal, release, lock and exit revoke input. The shell must bind again after revocation.

Only a verified binding can accept exclusive overlays. The Director maps after the accepted response; core blocks movement and app keys during that interval. Once mapped, keyboard focus belongs to the same verified client's `hyprune-director` layer on the leased output. Core retains Escape, F12 and lock priority, and Tab is ordinary Director navigation while it is open. Closing returns to exploration; no cursor image/hardware-cursor operations are introduced. All focus, capture and workspace operations run on the event loop outside rendering.

`spatial.projection` supplies at most 64 normalized screen markers for the selected world output. Origin is top-left, x/y in [0,1], world metres for distance, monotonic milliseconds per sample. Core uses the same perspective/view as the world renderer, rejects behind-camera/offscreen markers and reports static-collision occlusion. Shell filters occluded markers, resets on world/output changes and drops samples after 500 ms without delivery. This avoids making the shell duplicate camera/FOV/viewport and collision knowledge. It describes the current SDR, untransformed output profile; unsupported transforms must stay unavailable. Snapshot/delta recovery remains authoritative.

`spatial.world` supplies current world name and bounded eye-position places. `spatial.map` supplies a validated inline SVG (at most 64 KiB), SHA-256 of its exact bytes, bounds and normalized affine `worldToMap:[a,b,c,d,e,f]`: u=a*x+c*z+e, v=b*x+d*z+f. The shell renders the SVG as an image, never a document or executable, preserving aspect ratio and applying the same fitted rectangle to markers. There is no filesystem path or network resource in IPC. Core rejects DTD/entities, processing instructions, scripts, foreign objects, image/use/link elements, event handlers, CSS/style and URL/href attributes. Allowed elements are svg/g/rect/path/circle/ellipse/line/polyline/polygon/text/tspan with bounded geometric and plain presentation attributes. Invalid optional maps are rejected at package load, retaining the old world.
