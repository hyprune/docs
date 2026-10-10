---
title: "RFC-0006 — Interaction and movement modes"
description: "A fixed-step movement contract with a permanent route back to the desktop."
---

**Status: accepted · proposed 2026-10-07, accepted 2026-10-09.** Implemented through the [IPC 0.19 player settings and reticle amendment](#amendment-ipc-019-player-settings-and-reticle).


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

The interaction design defines four input modes: world, interactive (E use in place), focus (F smooth fullscreen), and menu. E supports workspace walls without moving the camera. F supports individual windows as well as workspaces. Super+Tab and Back leave interactive/focus; Esc leaves menu. TAB long hold opens Map, using the independent input config's `longHoldMs` (default 1000).

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

## Amendment: climbing controllers and IPC 0.11

Climbing is a walking activity over RFC-0004 format 0.4 climbable volumes, not
a replacement public movement mode. `com.hyprune.walk` and `com.hyprune.fly`
retain their identifiers. Local configuration selects
`movement.climb_mode = "grab" | "look-to-climb" | "auto-traverse"`, default
`grab`, through `hl.plugin.hyprune.config({movement={climb_mode="grab"}})`.
Invalid patches retain the previous configuration.

* **Grab:** moving into a climb face within its prism plus 0.2 m outward reach
  attaches. Forward/back actions (W/S, K/J or arrows by default) climb up/down
  independently of pitch. Strafe moves across the authored width while keeping
  the capsule inside its edges. Releasing input holds without sliding. Space
  jumps outward, Ctrl slides down at twice authored speed. At the top, core
  steps smoothly to the authored exit; down/back at the bottom walks to its exit
  and detaches.
* **Look-to-climb:** the same rules, with climb velocity multiplied by sine of
  pitch. Looking up + forward ascends, looking down + forward descends, and a
  level view holds. Back reverses direction.
* **Auto-traverse:** E/use within reach of a rail or exit travels to the opposite
  exit (upper/lower selected by the nearer half of the segment). Enter from a
  landing onto the rail before descending, and ease into the destination.
  Space cancels with the same outward jump. A blocked connector cancels; a
  blocked exit holds. Ordinary use targeting remains available away from ladders.

All three modes catch falling feet crossing the authored prism, including a
swept crossing between simulation samples. Catch stops downward velocity
immediately and aligns to the rail gradually. Auto-traverse catches and holds
until E is pressed. A short detach cooldown prevents immediate recatching after
jumping. Collision remains enabled, including thin-wall sweeps. The controller
never attaches in flight/noclip. World changes, explicit camera moves, respawn,
mode switches, desktop exit and input handovers clear transient climbing state.

A 12 mm hand-over-hand camera bob is visual only and fades on hold/detach;
`graphics.reduced_motion` removes it. The controller does not rotate the view or
change look bindings. Attachment alignment, climbing acceleration and endpoint
motion are bounded, without pose teleports.

IPC **0.11** adds required `movement.state: walking | flying | climbing`,
`movement.ladderId: string | null`, and `movement.prompt: string` to snapshots
and deltas. `ladderId` is non-null exactly while climbing. The prompt contains
core's interaction guidance, for example `W/S climb / Ctrl slide / Space let go`.
The same text uses the native interaction-prompt path; shell clients may present
it without guessing movement state. `movement.modeId` remains the selected walk
or fly strategy. Noclip reports activity `flying`. Protocols 0.1–0.10 omit these
three fields and retain their original shapes. No public input-injection or
renderer protocol is introduced by this amendment.

## Amendment: adventure exits and declarative tool inputs (IPC 0.15)

This supersedes the free-cursor return-to-use/focus loop. Back/Super+Tab in use or
focus exits to world control; in world it enters free cursor (finishing an active
carry); in free cursor it restores the saved state. If a legacy/internal return
state is use/focus, the next press exits that state to world, without requiring a
400 ms timing window. Escape with no application keyboard focus returns to world;
Escape with application focus remains application input. The configured world
toggle always deactivates cleanly to the desktop, restoring its workspace and
cursor, and a subsequent activation begins in world control. Every compositor
focus, workspace or cursor mutation is deferred outside the render pass.

Tools declare four abstract slots: Primary, Secondary, Alternate, Cycle. Their
shared input.json world actions are `primary`, `secondary`, `alternate`, `cycle`,
initially LMB/RMB/MMB/Wheel. A null slot declaration consumes the slot as a no-op.
A slot press owns its action's release even if the selected tool changes. Global
Super gestures have precedence and cannot fall through to tool assignments.
Existing `wheel` configurations migrate to `cycle`; old protocols retain the old
name. Up to three bindings remain supported for each action.

| Tool | Primary | Secondary | Alternate | Cycle |
| --- | --- | --- | --- | --- |
| Normal | Click/interact | Right-click | Middle-click | Scroll client |
| Window | Tag/mount or lock per sub-mode | Lock/unlock | Unassigned | Place/lock sub-mode |
| Path | Add point | Remove last point | Open/close | Line/curve/arc |
| Position | Select/drag gizmo | World/local axes | Toggle snapping | Move/rotate/scale |
| Placement (5) | Place ahead | Mount on surface | Pocket aimed window | Select queue item |

The declaration pairs an action identifier with a human-readable label. Input
matching is independent of action execution: future trusted extension tools can
use this declaration/handler boundary without installing another input hook.
No new extension permissions or executable IPC actions are granted by this
amendment. The shell reads declarations rather than hardcoding tool meanings.

`carry.facing` defaults to R, matching through held Super during a carry.
`windows.carry_face_player` defaults true: picking up turns the window toward the
player and preserves the grab point. Heading follows the camera; vertical look
moves the grab point without tilting the window. Keep-orientation mode freezes
its quaternion. `content.scale` defaults Super+Shift+Wheel, `rotate` moves to
Super+Ctrl+Wheel, and `window.reset` defaults Super+Shift+MMB. Modifier gestures
apply regardless of selected tool. HUD concepts are selected in Settings;
`hud.cycle` has no default binding and key 5 selects Placement.

## Amendment: IPC 0.19 player settings and reticle

### Player settings

IPC 0.19 adds two methods for the settings that shape how moving and aiming feel:

| Method | Required grant | Parameters | Result |
| --- | --- | --- | --- |
| player.get | state.read | `{}` | player settings snapshot |
| player.set | movement.control | `{patch: playerPatch}` | player settings snapshot |

A snapshot is `{config, defaults, overrides, options, ranges, path, error}`.
`config` holds the effective values (Lua config plus persisted overrides),
`defaults` the built-in values and `overrides` only the persisted keys (never
null; empty when nothing is saved). `options` lists the choices for `view_bob` and
`reticle_style`; `ranges` gives `[min, max]` for every numeric key, so a settings
page needs no copy of these bounds. `path` (at most 4096 bytes) names the
overrides file and `error` (at most 4096 bytes, `""` when fine) reports the last
failure to read or write it.

| Key | Type | Range or values | Default | Meaning |
| --- | --- | --- | --- | --- |
| walk_speed | number | 0.5–20 | 4.0 | m/s; walking and the flight base speed |
| run_speed | number | 0.5–30 | 10.0 | m/s while run (Shift) is held; flight scales by run/walk |
| view_bob | enum | `off`, `subtle`, `normal` | `subtle` | walking view bob |
| reticle_style | enum | `cross_dot`, `t_dot`, `circle_dot`, `dot`, `cross`, `chevron` | `cross_dot` | reticle shape |
| reticle_size | number | 6–64 | 18 | logical px, full extent |
| reticle_thickness | number | 1–6 | 2 | logical px |
| reticle_gap | number | 0–20 | 4 | logical px from the centre to where the arms start |
| reticle_opacity | number | 0.2–1 | 0.9 | |
| reticle_outline | boolean | | true | dark 1 px contrast outline |
| reticle_colour | `"theme"` or `[r,g,b]` (0–1) | | `"theme"` | `"theme"` uses the overlay style's `reticleColor` |
| reticle_dynamic | boolean | | true | the reticle opens up while moving or turning |
| reach_grab | number | 1–100 | 15 | m; Super+button window gestures (carry, resize, roll) |
| reach_mount | number | 1–100 | 8 | m; snapping into tool-mount frames (tool 2, tool 5, carry release) |
| reach_placement | number | 1–100 | 12 | m; tool 5 place on a surface and pocket, tool 2 mount on a wall, tool 3 path points |

`playerPatch` is a closed object with any of these keys (at least one). Changes
apply live and the overrides are persisted to `$HYPRUNE_PLAYER_FILE`, else
`$XDG_CONFIG_HOME/hyprune/player.json`, else `~/.config/hyprune/player.json`. A
`null` value removes that override, returning the key to its default (or Lua)
value. An invalid value fails the whole patch with -32602 and nothing is applied.
Peers below 0.19 get method-not-found (-32601).

`hl.plugin.hyprune.config({player = {...}})` accepts the same keys; persisted
overrides win over Lua. `player.run_multiplier` is no longer a core setting: Lua
still accepts it as a deprecated alias that sets `run_speed = walk_speed ×
multiplier`.

`graphics.reduced_motion` always wins: it turns off the view bob (whatever
`view_bob` says) and the dynamic reticle, like the climbing bob above.

### Reach

Reach limits are enforced by core. A Super+button gesture aimed at a window beyond
`reach_grab` does nothing. Tool 5 surface placement and pocketing beyond
`reach_placement`, and mount snaps beyond `reach_mount`, are refused with a
`runtime.notice` (code `placement.out_of_range`, level `info`, for example "Too
far: 18 m (reach 12 m)"). The pointer tool's click into a window has no reach
limit.

### Reticle state

`state.interaction` gains the required `reticle: {state, action}`, published with
the rest of `interaction` whenever either value changes (no distances on the
wire):

| state | Meaning |
| --- | --- |
| `hidden` | free cursor; no reticle is drawn |
| `typing` | typing mode; the reticle follows the pointer |
| `neutral` | nothing actionable under the reticle |
| `target` | the primary button clicks into the aimed window (pointer tool), action `click` |
| `valid` | the current action has a valid target within its reach |
| `out_of_range` | the same kind of target, beyond its reach |
| `invalid` | aimed at something that can't take the action (no free space, a locked window) |
| `holding` | carrying a window, and releasing it just leaves it where it is |

"The current action" is a held Super gesture, the selected tool's placement or
mount action, or the release of a carried window. `action` is one of `""`,
`click`, `grab`, `pocket`, `place`, `mount`, `select`, `path` or `drop`. Peers
below 0.19 receive `interaction` without `reticle`.

Core draws the reticle itself, at native output resolution in the final present
pass (never in the scaled world pass). Each state changes shape as well as colour
or opacity, so no state depends on colour alone:

- `valid`: theme `validColor` plus four corner brackets.
- `out_of_range`: dimmed, with a hollow centre and a small "N m" distance hint.
- `invalid`: `invalidColor`, with the arms turned 45° into an x.
- `holding`: corner brackets in the reticle colour.
- `target`: a slightly tighter gap.

### Overlay colours and field of view

`overlayStyle` gains three colours, RGB arrays 0–1 like `promptColor`:
`reticleColor` (default `[0.95, 0.95, 0.95]`), `validColor` (default
`[0.35, 0.95, 0.6]`) and `invalidColor` (default `[1.0, 0.62, 0.35]`). In 0.19
they are required in the `overlay.style` result and optional in the style patch.
Results to older peers omit them and older peers cannot send them. The reference
shell sends them from the active HUD theme (foreground for the reticle, the
positive colour for valid, the warning colour for invalid) whenever it sends
`promptColor`.

`graphics.fov` accepts 30–120 degrees in 0.19 (was 30–110) and now defaults to
65 (was 60). Replies to older peers clamp `fov` to 110 in `config`, `effective`
and `overrides`, and an older peer's `graphics.set` with `fov` above 110 is
rejected ("setting requires IPC 0.19").

All other 0.18 state, events, grants and methods are inherited unchanged.
