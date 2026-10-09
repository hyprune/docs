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

## Amendment M2: workspace homes, pulled tools and recovery

The mounted wall represents the owning area's **whole workspace** using actual
compositor window rectangles. Core composites approved texture leases outside
Hyprland rendering; the world and shell layers are excluded. Focus in activates
stock Hyprland presentation/input for that workspace. Focus out returns to the
same world's camera. Core preserves the compositor's cursor lifecycle.

User bindings map real workspace IDs to `{worldId,areaId}`. Switching workspace
via a compositor keybind or Director travels to its area within the same world.
A different world uses the existing asynchronous load/warp events; failure keeps
the previous scene. Same-world travel does not reload the package. Ordinary
0.1/0.2/0.3 IPC clients keep their frozen state projections and method sets.

Pulling a window preserves its owning workspace. A carried plane follows the
player; placing defaults to a free compatible tool mount in that workspace's
area. Explicit cross-area tool placement is rejected. In-place mouse interaction
projects a virtual pointer onto the rendered surface; click, scroll, button grabs,
drag off-plane and text route through the compositor seat. Navigation mouse
motion turns the camera; focused-tool motion moves the virtual pointer. Escape
returns to navigation. Hidden-workspace keyboard focus retains its explicit
unsupported result; no internal compositor focus bypass is introduced.

Persist exact app-class/title rules, or an explicit empty-title class rule,
keyed by world ID and area ID, independent of package version and runtime window
addresses. Restore only to a compatible, free mount; ambiguous concurrent matches
occupy different free targets. Closing a client retains the rule for relaunch.
Bindings/rules live in daemon-owned user state; changes use atomic replacement.

Collision tests use the complete surface rectangle as an oriented box with a
margin against the world triangle mesh. Carry uses swept support rays from the
player and shrinks/clamps in front of geometry. Placement pushes along the
surface front normal to find a collision-free pose; never accept an intersecting
result. A removed, occupied or newly obstructed saved target relocates to its
area's free mount or reserved placement volume and publishes a runtime notice.
If neither exists, recall safely in front of the player or refuse the operation.
`surfaces.recall` brings all live pulled tools in front of the player without
changing their durable mount rules. Director must expose this action.

Data objects publish stable identity, owning area, mount type and pose separately
from window capture. `data.object.bind` associates an authenticated publisher's
source ID; source values use the existing bounded `data.publish`/TTL mechanism.
This hook gives shell/extensions display metadata without executable world hooks,
window launch commands, raw input injection or new pixel transports.

## Amendment M3A: hand placement and child trees

Super+left drag preserves the hit point offset and camera-to-hit distance.
Wheel motion changes target distance multiplicatively and eases toward it.
Super+middle press rolls around the surface normal using the signed ray sweep;
Super+right drag configures the native client width/height independently, retaining
pixel-to-world scale and the client's own minimum/maximum size constraints.
An OBB sweep rejects motion through geometry. Releasing onto a workspace wall
moves the native client to that workspace and returns it to tiling. A drag from
a workspace wall extracts the topmost native client at its composed rectangle.

Root, popup and subsurface leases share their parent's transform and logical
scale; child offsets are top-left logical pixels. Popups sit just in front of
the parent and get precedence in picking. The true child resource receives
input; menu interaction preserves parent keyboard focus. Implicit button grabs
retain their child resource until release, including off-plane coordinates.
Consumed world presses/releases and empty-space scroll never leak to hidden
native windows. Unsupported external/cropped/transformed leases stay unavailable.

New standalone windows spawn in front of the camera at configured distance and
pixel scale, stopping before geometry and existing planes. Transient windows and
X11 menus attach to their parent rather than receiving independent spawn poses.
Fullscreen animates the prepared window plane to the viewport, then releases the
output to native 2D. Exiting animates back to the saved 3D pose. These handovers,
including rapid reversal and window closure, occur outside rendering.

The mount tool tags a live window, then raycasts a world surface and aligns local
+Z to its facing normal. Collision recovery checks the full rectangle before
saving an area-owned app-class/title rule and pose through daemon atomic storage.

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

### Live round 3 correction: direct clicks and logical sizing

In world mode the normal tool forwards a plain button at the crosshair to its
client without entering interactive mode. The press owns its release; dragging
updates local coordinates while the ray intersects that client and retains the
last valid point otherwise. E explicitly enters interactive mode. Carry yaw
follows camera yaw; its initial pitch/roll and grab-point offset are preserved.
Free windows and user mounts derive both quad dimensions from current logical
client size and the configured world scale, independent of backing-buffer and
monitor scale. Authored tool mounts retain explicit fit-to-mount sizing. These
are behavioural corrections; IPC 0.6 fields remain unchanged.


## Graphics quality amendment (IPC 0.7)

World graphics settings affect internal world rendering only. Application
surfaces, workspace screens and world-locked overlays remain native-resolution.
The graphics discovery, persistence, supported effects and timing semantics are
specified in [RFC-0008](/rfcs/0008-shell/#graphics-controls-and-input-hold-timing-ipc-07--08).
Lower quality never changes logical surface input coordinates or buffer scale.

## Amendment: world 0.5 ink and authored visibility

Optional `atmosphere.outline` contains enabled, display-RGB colour (0–1), widthPx
(1–4 logical pixels), relative linear-depth threshold (0.0001–1) and normal
threshold (1−dot, 0.001–2). All fields are required when present. An independent
native-resolution geometry normal/depth pass draws opaque/masked world geometry;
the ink composite precedes blend geometry, app/workspace surfaces and HUD. It
never samples client pixels. Material-ID edges and normal-map edges are omitted.
`graphics.outline` is a nullable boolean preset override; permission plus authored
enabled style are both required. F3/Performance expose its separate measured cost.

Optional `visibility.areas` (up to 256) declares unique IDs, finite increasing AABB
bounds, glTF node subtree indices and directed `visibleFrom` area IDs. A region is
visible from itself and those sources, without transitive closure. Overlapping
source bounds union their visible sets. Outside all bounds, or without metadata,
all geometry draws. Unassigned geometry and editor-transformed nodes always draw.
Conflicting subtree assignments and unknown links/nodes are invalid. Authors must
include visibility through apertures; core does not infer occlusion from AABBs.
Filtering applies to every world submission pass, including glass, depth and ink;
collision, navigation, live app/screens and HUD never disappear through it.
`graphics.visibility_culling` permits live comparisons; diagnostics report counts.


### IPC 0.14 implementation amendment: internal ink

The native-resolution normal/depth geometry pass described above is superseded.
Ink reuses opaque HDR alpha for compact geometry normals and the existing depth
resolve, packs them at internal world resolution, and runs a sparse edge kernel.
A cheap native composite reconstructs thin logical-pixel coverage before live
surfaces/HUD and transparent world geometry. No extra geometry draw, MSAA target
or MSAA resolve is required. This implementation change retains world format 0.5.
The new graphics quality tier selects fixed 1 px or authored smooth 1–4 px width;
see RFC-0008's IPC 0.14 amendment. Normal-map detail does not generate ink.

## Amendment: pocket queue and client content sizing (IPC 0.15)

Unplaced root clients on the dedicated room workspace remain alive but are
excluded from world rendering, workspace-wall composition and pointer targeting.
Existing durable placements are respected. Existing clients without a placement
enter the queue on activation; new clients auto-spawn only where a full-size
collision-free, unoccupied spot exists. A bounded search cannot fall back to
stacking or continually shrinking clients. Other workspaces remain untouched.

Tool 5 selects the queue, showing one translucent non-interactive preview. Primary
places ahead at the configured spawn distance; Secondary aligns to the aimed
surface normal. Geometry/occupancy rejection leaves the client queued. Alternate
pockets an aimed placed client, preserving its content sizing and durable
placement while suppressing its live drawing. Most recently pocketed comes first.
There is no return-to-last-spot action. Entry selects tool 5 for a nonempty queue,
otherwise tool 1. Popup/subsurface visibility follows the root.

Content scaling requests a new client **logical** size, clamped to 320×200 minimum
or the smaller output extent, and at most the output's logical dimensions. It
never treats buffer pixels as client dimensions. Positive wheel steps reduce
logical resolution by 1/1.12 (larger UI). World width/height stay fixed, adjusting
world-units-per-logical-pixel independently. Placement records may add
`content:{logicalSize:[w,h],baseSize:[w,h],worldSize:[metresW,metresH]}`. Older
placements inherit the normal configured world scale; older IPC hides this field.
Reset restores the baseline logical size, player-facing orientation and configured
spawn distance, with collision recovery. Repeated resets emit fresh feedback.
