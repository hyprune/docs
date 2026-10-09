---
title: "RFC-0002 — Core runtime"
description: "Process ownership, safe render phases, capture scheduling and failure recovery."
---

**Status: proposed v0 · 2026-10-07 · Implementation target, pending owner review.**


## Decision: a small plugin and a helper

Core ships a Hyprland plugin and `hypruned`, a per-session user daemon. The plugin owns only work that requires compositor authority or the live graphics context: capture, input dispatch, GPU resources, scene rendering and final state commits. The daemon owns public IPC, grants, package discovery/validation, supervision, filesystem work and persistence. Both belong in core so their private bridge can evolve together without becoming a public SDK ABI.

The daemon starts the reference shell or an explicitly configured alternative with scoped launch credentials. It never loads third-party code into Hyprland. M0 may keep trusted camera simulation in the plugin; loading, parsing and expensive geometry processing must leave its render callbacks. Do not put all rendering into a second compositor: that sacrifices direct window integration and creates a second input authority. Do not put package managers or sockets with blocking I/O inside the plugin.

## Authority and the private bridge

The plugin is authoritative for runtime, output IDs, focus, surfaces and player pose. The daemon is authoritative for grants, installed package identity and shell leases; lease effects become visible only after plugin acknowledgement. The daemon composes the public state and assigns revisions after acknowledgement. No speculative success response.

Use a private inherited Unix socketpair from a core-owned launcher/adapter handshake, or an equivalently authenticated private connection if Hyprland loads the plugin first. Pin a private bridge version to the core build. Messages carry a session epoch, bounded command ID, operation and deadline; responses distinguish applied/rejected. No GL pointers, compositor objects or client buffer pointers cross processes. Exact private encoding is internal to core and not RFC-0003. Public IPC compatibility does not imply private bridge compatibility.

If the daemon dies, a plugin watchdog releases input grabs and restores ordinary desktop presentation within 1 second. If the plugin unloads or Hyprland exits, the daemon invalidates the session, disconnects clients and closes leases. Reconnection starts a new session and snapshot; do not replay pending mutations. A core-owned compositor binding for emergency exit always works without the shell or daemon. World mode must not interfere with the session lock; locking cancels interaction and stops captures immediately.

## Thread ownership

| Owner | Allowed work | Forbidden work |
| --- | --- | --- |
| Hyprland event/render thread | Compositor API, GL object creation/destruction, guarded scene drawing, queued input/focus application | Blocking IPC, file access, parsing large assets, extension code |
| Core CPU workers | Immutable glTF decode, collision build, navigation preparation | Compositor objects or GL context access |
| Daemon loop/workers | Framing, authentication, registry, validation, persistence, process supervision | Calling Hyprland internals or mutating plugin memory |
| Extension process | Granted broker APIs, its own computation and optional approved Wayland surface | Native plugin hooks, raw seat ownership |

Use bounded queues and immutable scene snapshots. Workers publish prepared CPU assets with generation IDs; stale generations are discarded after world reload/unload. Only the render owner uploads and retires GPU resources. No detached threads retaining plugin pointers. Shutdown stops submissions, cancels workers, joins them, drains safe cleanup and unregisters hooks before unloading code.

## Render-pass rule (non-negotiable)

Inside a Hyprland render pass, only draw using already prepared resources and read an immutable frame snapshot. **Any operation that might trigger compositor rendering MUST be queued until the outer pass is fully unwound.** This includes cursor visibility/shape changes, workspace changes, focus operations, window snapshot FBO capture, layer mapping/unmapping and teardown of compositor-owned resources.

A callback named “post windows” is still inside the pass. It is not a safe deferred phase. Queue work to the event loop after outer `endRender`, assert render nesting depth is zero, and make the required graphics context current via the supported adapter before capture/upload/cleanup. A nested snapshot render must skip Hyprune's pass through a scoped capture/reentrancy guard. Never assume a zero-delay timer by itself proves the phase is safe. The adapter's exact hook must be verified against the pinned Hyprland build.

The prototype's hardware cursor update re-entered rendering and corrupted the active monitor render state, later crashing in `CMonitor::useFP16`. A software cursor in nested tests concealed it. Test both nested and real DRM sessions before declaring this solved.

## Frame graph and budgets

The diagram on [Architecture](/architecture/) shows the ownership boundary. Per frame:

1. **After previous outer frame:** process bounded deferred compositor operations, update capture leases, unsuspend participating clients, deliver eligible frame callbacks, refresh dirty captures, stage budgeted GPU uploads. Write next immutable frame state.
2. **Simulation:** fixed 60 Hz trusted movement/physics, at most four catch-up steps, then drop excess elapsed time and report overrun. Input timestamps use a monotonic clock. Late worker results retain the prior valid scene; never block a frame.
3. **World pass:** render opaque geometry to owned color/depth buffers, then transparent geometry, resolve MSAA if enabled. Apply world lighting and tone mapping once.
4. **Surface pass:** sample compositor-approved window textures with the capture's geometry/UV snapshot; depth-test against world geometry. Preserve desktop color through a separate output transform, with no artistic bloom/exposure on application pixels.
5. **Composite:** present world + surfaces in the room output/workspace below top/overlay shell layers. Preserve compositor GL state through the adapter's scoped state guard; never clear unrelated outputs or their damage.
6. **End outer frame:** collect bounded timing/damage data, enqueue future work, return to Hyprland. The deferred phase starts only after Hyprland has completed its own render teardown.

Initial engineering budgets: 2 ms per frame for incremental GPU uploads, 4 ms capture work, 512 MiB world GPU assets, 256 MiB capture cache; all measured and configurable downwards. These are targets, not performance claims. Reuse previous textures under load, evict unfocused captures first and report degraded freshness. Avoid `glFinish`, synchronous readbacks and full-scene recapture. Multi-monitor simulation advances once per tick, not once per output.

## Live windows and capture

Hidden workspaces suspend clients and suppress frame callbacks. An explicit capture lease identifies windows visible on an active world surface; the adapter must call the supported equivalent of `setSuspended(false)` and pace frame callbacks for those clients while needed. Snapshotting alone does not keep a browser/video alive. Restore prior suspension behavior and release leases on hide, disconnect, lock, close and world exit. Idle or obscured world surfaces do not get an unlimited capture exemption.

Track damage/committed buffer identity and geometry generation; unchanged windows reuse textures. Bound capture cadence by visibility and screen descriptor `maxFps`. Each captured texture carries matching logical size, crop, scale, transform and surface-tree offsets. Do not combine yesterday's texture with today's window geometry. Weak compositor handles are resolved on the owner thread; dead handles produce an unavailable surface, never a stale pointer dereference.

## Acceptance and implementation order

M0: exact Hyprland compatibility gate, unload-safe plugin, static original world, deferred queue assertions, emergency exit and daemon hello/snapshot. M1: live window capture with hidden-workspace liveness, input routing, shell leases and full RFC-0003 control. M2: validated world swaps and sandboxed extension hosts. M3: measured multi-output behavior and external conformance.

Required failure tests: cursor changes under hardware cursor rendering, nested snapshot recursion, workspace switch during capture, daemon/shell death, window close mid-drag, output removal, scene reload with pending worker results, repeated plugin unload/reload, session lock, and capture/VRAM saturation. Core must document actual support; this RFC is not evidence that these tests pass yet.

## Amendment M3A: deferred interaction effects

Hand input and transitions update pure gesture/camera state. Capture leases,
client size configures, native focus, seat enter/motion/button/axis delivery,
workspace tiling and cursor visibility execute through tracked `doLater` callbacks
or the deferred simulation tick with render nesting zero. A pass draws prepared
surfaces only. Child buffers are leased directly; no recursive compositor
snapshot rendering is required. GL state is scoped for world and workspace FBOs.
Cursor visibility changes only when the desired hide/show state changes. Native
cursor shape requests remain compositor-owned. A nested software-cursor result
is never evidence of hardware-plane safety; core documents the supervised DRM
transition checklist before owner testing. Unload cancels queued work and removes
retained pass elements before resources or hooks retire.

## Proposed M4 amendment: optional world renderer

[RFC-0009](/rfcs/0009-offload-renderer/) proposes a `hypruned`-supervised optional
GPU renderer. It amends scene-rendering placement only: the plugin retains
compositor authority, input, capture, native surfaces and final composition.
Default in-process rendering and the render-phase rule remain mandatory.
Its private pose/buffer/fence protocol is not public IPC or an extension SDK;
power admission and prepared local fallback are shipping gates. See its staged
M4 plan and measured limitations before treating the spike as desktop support.

## Amendment: IPC 0.13 authoring-camera authority

`camera.author` is a separate launch capability for trusted dev/photo tooling,
never a normal shell grant. In active world control `camera.photo` accepts metre
`position`, normalized quaternion `orientation`, vertical `fov` (5–140 degrees),
optional NDC `lensShift` (two components −2..2), and fixed `renderScale` (0.25–1).
One connection owns the hold. Updates by that connection replace the lens; other
writers cannot take it over. `camera.release`, disconnect and world exit restore
the prior camera; loading another world resets to its spawn. Movement/look/scope
cannot overwrite a held lens. Captures and debug remain usable. All ownership
changes happen in the owner event loop, outside the render pass.

`camera.get` on 0.13 returns actual pose, roll radians, vertical FOV, lensShift,
held boolean and renderScale (null if not held). Lens shift moves the optical axis
to NDC `(x,y)` (+right/+up); roll uses local +Z. The same camera basis/projection
serves scene, sky, rays and core/shell marker projections. Older camera.get keeps
its two-field shape. A photo hold uses the local renderer for exact frame pose;
it does not restart the world or compositor. Recorded camera frames optionally
include roll/shift, defaulting to zero for old files; camera replay preserves them.

### IPC 0.15 correction: unzoned mount instances and reconnects

`mounts.instances[].areaId` is optional. A window floating in a newly entered
world may have no home/placement zone; omit the field in that case. When
present it remains a nonempty slug. Empty strings are invalid. This applies to
snapshots, deltas and `mounts.changed`. Earlier negotiated schemas retain their
required field, so core omits unzoned mount-instance metadata for those clients;
their ordinary surface/app records remain available.

A trusted launcher may renew credentials through a private inherited channel.
The live supervisor verifies each request's kernel-supplied PID/UID against its
actual launcher child, then requests a fresh grant from hypruned on a separate
inherited channel. Grants expire after 30 seconds, are bound to the client ID
and launcher PID, and can be consumed once. Renewal cannot add capabilities:
it is restricted to the original launch manifest, at most 8 requests/second,
4096 per launch and 64 outstanding grants. No public IPC issuance method, token
file, command-line secret or QML credential is introduced. `down` terminates the
supervisor and closes both channels.
