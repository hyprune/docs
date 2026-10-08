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

## M2 Director integration

IPC 0.4 shells use `mounts.bindings` for workspace homes, `workspace.activate`
for travel/warp, and `workspace.focus/unfocus` for stock Hyprland entry/return.
Surface cards can pull a live window, list free tool anchors in its home and place
or return it. Expose **Recall all windows** through `surfaces.recall`, including
when a saved target has disappeared. Render data-object source values against
identity/pose metadata if desired. Method discovery gates every action; older
clients continue working. Camera lens controls use `camera.fov`; the projection
markers already reflect core's lens, so shells do not duplicate projection math.

## Amendment M3A: mode, slots and open workspace apps

IPC 0.5 shells display `interaction.mode`, selected 1–5 slot and configured tool
names. They list `apps` grouped by actual workspace ID, showing theme icon,
window title and app class. Resolve icons through the local icon theme with a
fallback; do not open descriptor text as a file or URI. Applications and focus
remain core authority. Older peers omit these UI additions while existing
method discovery still gates workspace and surface actions. The reference shell
supports 0.5 without a mock-only state channel.

## Amendment: M3B Settings

Director adds Settings after the existing tabs. Every action in each of four modes has three capture boxes and clear controls. Settings shows internal conflicts and “steals Hyprland: description” for native collisions, plus long-hold duration and scope vignette. Capture uses the Director's verified lease; save uses `input.set` with `input.control`. Core validates/persists the file. HUD displays `editor.mode`, tool slot and submode. The Map opening intent resets the selected tab to Map.

## Amendment: live desktop inventory and presentation recovery

IPC 0.6 workspace surfaces include native normal workspaces even without authored
homes. Shell merges them with workspaces.locations. A desktop-only entry requests
surface.focus; a home requests workspace.activate. apps includes mapped native
toplevels on all outputs, independent of world texture leases, up to 128 entries.
The versioned 0.6 schema increases its apps bound from 16 to 128. Older 0.5
projections retain their 16-entry bound. Existing fields and grants are unchanged;
consumers must update the 0.6 validator pin with this amendment.

The trusted launcher owns the authenticated core connection and credential
lifetime. QML crash/restart reconnects through its private presentation socket;
only same-UID descendants are accepted and stale peers are replaced. A new child
must be associated by its actual Wayland PID before an exclusive overlay opens.
Presentation has no credential pipes to replay. Core/daemon reconnect remains a
separate authenticated concern. Director pages use concrete anchored geometry
rather than the Qt StackLayout size-hint path implicated in the live crashes.

## Amendment: world-locked overlays and screen UI

Core owns world-locked presentation: active waypoint marker/label, its route,
object/window/workspace interaction prompts and optional area/place labels.
These are drawn in the world render pass from **that frame's camera**, not from
shell IPC projection samples. The default displays no area/place markers; input
v2 `show_area_markers` is an optional boolean, default false, exposed in Settings.
Interaction prompts appear at aimed, unobstructed usable surfaces. Routes are
depth-tested world lines. Labels/icons are screen-space billboards anchored by
the same frame projection. Labels are intentionally readable through geometry;
route lines retain depth occlusion. Native fullscreen handover hides world-locked
presentation. Core diagnostics remain available as a screen overlay.

Shell owns Director, menus, notices and other screen UI, including an optional
compass/minimap. The official IPC 0.6 shell stops drawing IPC-projected world
markers. Projection data stays available for alternate/older shells, with its
original timestamp/coordinate contract, sampled at up to 10 Hz. Periodic state
publication is up to 30 Hz; explicit actions and UI events publish immediately.
World-locked rendering is independent of either publication rate.

IPC 0.6 adds `overlay.style` under `shell.control`: params `{leaseId, style}`
require the connection's currently owned shell lease; result `{style}` returns
the full canonical theme. Earlier protocols do not advertise or accept it.
`style` is a closed partial object with `fontFamily` (1–96 printable bytes),
`waypointColor`, `routeColor`, `labelColor`, `promptColor` (three finite sRGB
components each, 0–1), and optional `iconAtlas` (null means built-in symbols).
The atlas descriptor is `{path,cellSize,waypointIndex,promptIndex}`: absolute
local path, square cells 16–128 pixels, indices 0–255. Core accepts only a regular
same-UID non-symlink PNG, at most 4 MiB encoded and 1024×1024 decoded, with whole
cells and in-bounds indices. Icons use alpha coverage tinted by marker/prompt
colour and render at 24 output pixels. Font families resolve through Fontconfig;
the first implementation covers printable ASCII, with `?` fallback for other
label glyphs. Colours and fonts have defaults even without a shell.

Theme file I/O, decode, font rasterization and GL uploads run in deferred owner
work, never inside a compositor frame. Equal themes do no work; colour-only
changes reuse the existing atlas. Invalid themes leave the prior style active.
The trusted bridge inserts its owned lease; QML never receives credentials or
writes core configuration files. Themes are runtime state, not a package edit.
The official shell supplies its Tokens palette and font when it receives a lease.

### Native overlays with internal world resolution

Core may render world geometry/lighting/bloom at an internal resolution and
reconstruct colour and depth before composing windows. Client/workspace surfaces
and core world-locked overlays are rasterized at the output's native resolution;
labels, reticles and screen UI must not inherit the internal world scale. Core
uses the same camera for both passes. This does not change IPC projection fields
or the shell's style hook. Shells do not upscale their UI in response to core's
render scale. Local graphics options are documented in core M3A.md.


## Graphics controls and input hold timing (IPC 0.7 / 0.8)

IPC 0.7 inherits IPC 0.6 state, events, grants and methods. It adds:

| Method | Required grant | Parameters | Result |
| --- | --- | --- | --- |
| graphics.get | state.read | `{}` | graphics settings snapshot |
| graphics.set | world.control | `{patch: graphicsPatch}` | graphics settings snapshot |

Core negotiates 0.7 only when offered. Peers offering 0.6 or earlier retain their
frozen projections and method lists, including strict enum validation. Graphics
methods are unavailable to earlier versions even if called without advertisement.
Unauthorised requests receive method-not-advertised, as for existing controls.

A settings snapshot contains `config`, `effective`, `overrides`, `path`, `error`,
`presets`, `options`, `unsupported`, and `timings`. The first is the validated
requested graphics config; the second resolves nullable per-preset effects;
the third is the sparse persisted file layer. The presets and discrete options
are discoverable; all numeric ranges are specified in the companion schema.
Unknown effects, unsupported values and invalid types fail validation before any
write or renderer mutation. Files are private, atomically replaced, and watched
across editor renames. A bad edit retains the last valid config and sets `error`;
a repaired file clears it even when it restores exactly the previous value.

Settings writes go through core, never directly from the shell. No Hyprland
reload is involved. Lua can still provide compositor-level defaults; the user's
independent graphics file overrides them. A missing file key inherits Lua;
a null per-effect key inherits the selected preset. Preset changes retain
explicit effect overrides. No additional public state keys or events are added.
Settings may poll while open; normal HUD consumers need not subscribe.

Graphics controls cannot lower native application or world-overlay resolution.
Core owns world-locked markers/prompts and renders them with the current frame's
camera. Shell owns screen UI. The existing lease-owned `overlay.style` hook is
unchanged. File/IPC changes happen outside rendering; scalar/sampler changes
are diff-applied without world texture re-import. FBO allocation and own shader
rendering remain guarded GL operations; they never trigger compositor rendering.

Diagnostics are explicitly extensible and non-authoritative. GPU measurements
use nonblocking disjoint queries; unavailable values are null. The seven named
cost groups are sky, shared world shading, MSAA resolve, bloom, upscale/sharpen,
native surfaces/geometry, and output/markers. Fused material effects share the
world shading measurement; transparent world materials share the native
composition measurement. Neither group gives independent additive costs for
individual shader switches. `deliveredFPS` counts new frames, excluding repeated presentations.

No SSR, runtime shadow maps or runtime contact-shadow implementation is claimed.
These are reported in `unsupported`; attempts to set fictitious switches fail.
Baked lighting and shadows remain part of world lightmaps.

IPC 0.8 inherits 0.7 and adds required `keymap.holds` to revisioned state.
It is an array (maximum 64) of pending, unfired long holds, each containing
`action`, canonical `binding`, `startedAtMs`, and `durationMs`. Start timestamps
use Linux CLOCK_MONOTONIC milliseconds, matching core's input timer. Shell's
bridge can sample `time.monotonic()` on receipt and pass remaining duration to
QML; QML animates locally and does not poll or intercept TAB. Release, mode
change, keymap replacement, deactivation, or firing removes the entry. Reloading
only the duration retains the start and updates the duration. Clear animation
on disconnect. No progress deltas are sent every frame. Earlier peers never
receive this field; shells must explicitly negotiate 0.8 to consume it.

Canonical schemas are `schema/v0.7/ipc.schema.json` and
`schema/v0.8/ipc.schema.json`. The 0.7 document matches the shell 36cb85f pin
exactly. Core's live launcher uses 0.7 until the shell adopts 0.8; its HoldRing
is ready but wiring that component belongs to the shell workstream.

## Amendment: IPC 0.9 HUD telemetry and concept cycling

IPC 0.9 inherits 0.8. Frozen older schemas do not change. An authenticated or
observer `state.read` client may call `hud.subscribe({topics})` independently of
`state.subscribe`. Choose one to five unique topics: `hud.frame`, `hud.pose`,
`zone.entered`, `zone.exited`, `tool.changed`. The result is `{subscriptionId}`;
`hud.unsubscribe({subscriptionId})` stops the stream. There is one HUD subscription
per connection. No historical transition replay is implied; pose samples contain
the current zone and tool for initialisation.

Every telemetry event contains `subscriptionId`, `sessionId`, `revision` and
`monotonicMs` (core's steady clock; compare using `session.ping`, not wall time).
Events describe current simulation state and do not mutate the state revision:

- `hud.frame`: up to 4 Hz; `fps`, `frameMs`, `cpuMs` (render plus update), `gpuMs`
  (null until all timer queries are available), `renderScale`, effective `preset`.
- `hud.pose`: up to 30 Hz; `outputId`, `worldId`, `worldName`, `position` in world
  metres (+Y up), `heading` in radians (zero faces -Z, positive turns right),
  `pitch`, `zone`, `tool` (1–4), `subtype`. A radar should interpolate this state.
- `zone.entered` / `zone.exited`: `zone` contains `id`, `homeName`, `worldId`,
  `worldName`. Authoritative camera containment uses authored zone bounds; first
  containing zone wins at overlaps. Exiting precedes entering on a change. The
  area's display name overrides the zone name when the IDs match. Deactivation
  emits exit. Pose `zone` is null outside all zones.
- `tool.changed`: `slot`, `name`, `subtype`, emitted on a tool or wheel submode change.

Telemetry samples coalesce/drop under backpressure; clients must not count them
as simulation steps. State subscriptions and input remain independent. No
resource/energy stat exists yet; shells must not present synthetic values as game state.

The rebindable world action `hud.cycle` defaults to **5**, replacing reserved
slot 5. Each nonrepeat press sends `ui.hud.cycle` only to the verified associated
shell with an owned output lease and a state subscription. Parameters are
`leaseId`, `outputId`, `sequence`, `monotonicMs`, `sessionId`, `revision`. Sequence
is monotonic for the runtime and supports duplicate suppression. Shells bind
with `shell.bind` as soon as their HUD is mapped, not only on opening Director.
They own concept order, selection persistence and the temporary name banner.
Application/focus/menu typing remains unaffected. Input files migrate the old
`tool5` binding to `hud.cycle`; pre-0.9 clients receive the old action spelling in
input config/capture/conflict responses so their frozen schemas stay valid.

World-locked overlays remain core-rendered. These pose streams support a screen
radar, compass and zone titles; they do not move world-marker rendering to QML.

## Amendment: recordings and replay (IPC 0.12)

IPC 0.11 remains the climbing movement contract. IPC 0.12 inherits it and adds
`recording.start`, `recording.stop`, `recording.mark`, `recording.status`,
`replay.start`, `replay.stop` and `replay.status`, all gated by `input.control`.
Observers cannot initiate recording or replay. The rebindable `record.toggle`
action is unbound in all modes; older protocol keymaps omit it and older edits
preserve its current binding. The input file stays version 2 with an automatic
migration adding the empty action. Settings at 0.12 uses its existing capture
boxes. No compositor reload is involved.

`recording.start` accepts optional `includeAppKeys` (default false); mark accepts
a 1–64 character name. `replay.start` accepts an owned recording path, `mode`
(`input` or `camera`, default input), optional `smoothingMs` (0–1000) and optional
assertions. Assertions can compare every recorded frame (`recorded: true`), set
an absolute numeric tolerance, and compare camera/mode/tool fields at named
marks. Unknown assertion fields are errors, never silently ignored.

All results report `{recording, playing, path, frame, mode, failures, error}`;
path and error may be null. The bounded failures list identifies assertion
locations. Notices announce start/save paths and replay completion/failure.
The fixed simulation timestep is 1/60 s. Inputs enter the same core keymap and
action pipeline below the physical cursor. Replay does not invoke Hyprland
keybinds or synthesize application keyboard input, including when raw keys were
opted into a recording. Application buttons/scroll can still reach the aimed
live surface during input replay; external client contents and timing are not
deterministic fixtures. Camera mode sends no application input.

The version-1 private JSONL format consists of a header, timestamped input,
simulation-frame and rendered-view records, named marks, and an end record.
The header pins world identity/geometry digest, input/player configuration,
initial camera/tool state and a deterministic seed. Unhandled/application keys
are masked before entering the writer queue by default. Raw opt-in keys can
reconstruct typed text; recordings also reveal movement, world geometry identity,
configuration and event timing. Files are created 0600 under
`$XDG_STATE_HOME/hyprune/recordings/`; sharing is an explicit user action. The
format is bounded to ten minutes and 64 MiB, with a 4 MiB asynchronous write
queue. Incomplete/truncated files are rejected. See core `docs/REPLAY.md` for
CLI usage and the exact line format.

Shader cache/warmup statistics remain additive diagnostics under
`graphics.get().timings.shaderCache`, without an extra Settings switch. World
activation waits for warmup; no cursor/focus/workspace change occurs in rendering.
