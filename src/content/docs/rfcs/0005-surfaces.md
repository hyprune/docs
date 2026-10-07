---
title: "RFC-0005 — Surfaces and screen types"
description: "Pixels, geometry, focus and trusted routing across the desktop/world boundary."
---

**Status: proposed v0 · 2026-10-07 · Implementation target, pending owner review.**


## Decision and vocabulary

A **surface** is a runtime instance containing pixels and optional interaction. A **screen type** is a descriptor of how a class of sources is presented. A world **anchor** provides placement; it does not own the source application. Separate these three identities so replacing a world or shell does not restart applications.

`schema/v0/screen-type.schema.json` defines `descriptorVersion`, reverse-domain `id`, `provider`, `source`, planar `geometry`, `defaultSize` in meters, preferred pixel `resolution`, input flags, alpha mode, `colorSpace: srgb` and `maxFps`. A provider can request less throughput than the core maximum; the descriptor grants no authority. The same type can have many instances. Registered provider identity must match the installed extension or built-in core, never a manifest's unsupported assertion.

## Source adapters

| Source | Pixel owner and policy | Input |
| --- | --- | --- |
| `window` | Core captures one approved Wayland/XWayland surface tree, including relevant popups | Route through compositor seat and child-surface hit testing |
| `workspace` | Core composites an explicit authorized workspace; exclude the world itself and shell overlays to avoid recursion | Pointer support first; keyboard focus requires safe activation, else reject |
| `layer` | Explicitly opted-in layer-shell application, never lock screen, password prompt or arbitrary overlay | Respect layer's keyboard policy and compositor priority |
| `web` | Separate sandboxed browser provider; no web engine in compositor | Its approved Wayland surface receives trusted input |
| `custom` | Separate provider rendering to an approved Wayland toplevel in M2 | Optional; same broker/seat contract |

M1 guarantees planar window surfaces only. Workspace, layer, web and custom adapters are staged and must advertise support before use. v0 descriptors can describe future adapters without claiming they run. Do not accept file descriptors or shared texture IDs via the public JSON protocol. A future DMA-BUF transport requires explicit sync/fence, lifetime and format negotiation in a separate RFC. M2 uses normal Wayland clients and core's capture adapter instead.

## Lifecycle and pixels

Create -> awaiting source -> ready -> unavailable -> destroyed. Destroyed IDs are never reused in the session. Close/unmap marks unavailable immediately, cancels interaction, and then retires texture resources on the render owner thread. A reconnecting provider creates a new instance. The public v0 snapshot contains live instances; unready objects are not advertised as interactive. User bindings persist as hints, not window addresses; matching application identity/title requires user confirmation when ambiguous.

Capture all popups/subsurfaces with the same geometry generation. Keep buffer scale, fractional output scale, crop and Wayland transform in the capture record. Texture origin differences are normalized once in the adapter. World lighting does not tint app pixels. Preserve alpha as premultiplied alpha through composition, and color manage from the declared source profile to output. v0 extension providers supply sRGB; compositor-native captured sources keep compositor metadata internally.

## Input contract

The core owns seat dispatch. Public IPC exposes `surface.focus` as a user intent, **not raw key/mouse injection**. Extensions do not receive global keystrokes. Event ordering and routing are an internal trusted core contract in v0:

1. Session lock, emergency exit and compositor shortcuts take precedence.
2. A shell's exclusive overlay lease consumes eligible input for its output; entering it releases movement keys and pointer lock.
3. Otherwise choose navigation mode or surface interaction mode. The active rendered camera and output transform define the picking ray, including third-person or interpolated cameras.
4. Intersect the front-facing planar hit region, depth-test against scene occlusion, compute UV. Surface local origin is top-left: `x = u × logicalWidth`, `y = (1-v) × logicalHeight` for a plane whose local +Y is up. Use capture crop/transform to map to the true child surface. Reject outside hits; never accidentally clamp them to clickable edges.
5. Trusted compositor dispatch sends enter/motion/button/axis/leave in seat order with monotonic timestamps and compositor-valid serials. Respect natural scrolling, wheel source/discrete deltas and user's sensitivity settings. Keyboard focus changes only on explicit keyboard intent.

The picking mesh and visible plane share the same transform and front face; decoration thickness does not move the interactive plane. Alpha-blended app content uses a rectangular interactive region in v0: transparent pixels do not click through to hidden windows. Popups get correct child input regions and precedence. A future shaped hit mask must be versioned and rendered consistently.

Pointer hover and keyboard focus are separate. Never use a focus call that implicitly changes workspace inside a render pass. Until the adapter can keep focus safe for hidden-workspace windows, return -32007 for in-place keyboard focus and offer a user-visible transition to ordinary desktop interaction. No simulated keyboard focus by direct writes to Hyprland internals.

## Grabs, cancellation and recovery

Button down captures the target and its geometry generation until all buttons release, even when the ray leaves the plane. Motion during a drag intersects the captured plane and may produce coordinates outside its bounds; this is the explicit exception to outside-hit rejection. A close, lease loss, lock or output removal synthesizes the necessary releases/cancel through the seat, clears pressed-state bookkeeping and returns to navigation or desktop. Keep held modifiers balanced during all transitions. Touch, tablets, IME remapping and relative-pointer games are not part of the v0 embedded contract; users can exit to ordinary desktop mode for them.

Before M1: test transformed/scaled windows, popups, multi-output coordinates, natural scrolling, drag off-plane, close mid-drag, keyboard focus refusal, and emergency exit while a client holds pointer lock. A readable desktop escape is always available.
