# Changelog


## v0 / 0.1.0 — 2026-10-07 (proposed)

Initial JSON Schema 2020-12 family: world format `0.1`, IPC `0.1`, extension manifest/API `0.1`, screen descriptor `0.1`. Includes every core method's request and result plus notifications, offline examples and a Node validator. Identifiers are reserved for these contracts; incompatible changes require a new wire/format identifier and migration notes. No runtime compatibility is claimed yet.

## 0.2.0 — 2026-10-07

Adds frozen `v0.2/` schemas for IPC 0.2 and world format 0.2; `v0/` stays unchanged. The validator accepts an optional fourth `version` argument (default `0.1`); CLI accepts `[response-method|-] [contract-version]`.

IPC adds camera get/set, waypoint/route, travel, autodrive, ui.open/close, data.publish/remove and presentation notifications. `location` and `integrations` are revisioned state keys. Publishing requires its own capability; scalar values, TTL, sequence and ownership are specified by RFC-0003. World 0.2 has the same manifest shape, with RFC-0004's sampler/transform/PBR material semantics. No mock-only protocol is accepted.

M1 shell reconciliation adds stable transition IDs, output identity, monotonic timestamps and indeterminate loading/failed phases. World-load destinations remain distinct from point/zone navigation targets.

## 0.3.0 — first real session

Frozen IPC 0.3 adds verified shell Wayland-child binding, workspace activation,
revisioned safe inline map/metadata, selected-output descriptor and core-projected
markers. 0.1/0.2 and world formats remain frozen. New positive/negative tests cover
version isolation, reserved parameters, PID/workspace bounds and marker clipping.

## 0.4.0 (M2)

- World format 0.3: workspace homes, typed mounts/frames/limits, reserved placement
  volumes, camera-relative atmosphere, HDR bloom/exposure and static sky IBL.
- IPC 0.4: workspace bindings/focus, pull/place/return/recall, durable placement
  rules, data-object bindings, atmosphere and FOV. Older wire contracts stay frozen.
- Added independent ownership/interaction/limits and version-isolation tests.

## 0.5.0 (M3A)

Frozen IPC 0.5 adds revisioned interaction mode/tool state, workspace app metadata,
and custom surface pose/size placement rules. All prior schemas stay unchanged;
world format remains 0.3. Tests cover exact version isolation, closed objects,
bounded app/tool collections and complete custom placement records.

IPC 0.6 (M3B): independent input keymap v2, three variants per action, core-owned validated persistence and lease-bound capture; closed keymap/editor state, per-area paths and object transforms, scope FOV down to 3 degrees, Map opening intent. Older contracts remain byte-identical.

IPC 0.7 publishes the exact shell graphics handoff: discoverable presets/effects,
validated sparse `graphics.set`, effective settings and asynchronous GPU timings.
IPC 0.8 adds `keymap.holds` (monotonic start time and configured duration) for
shell-owned hold animation. Protocols through 0.7 retain their exact shapes;
world format remains 0.3. No compositor config reload is involved.

## Climbing: world 0.4 and IPC 0.11

World 0.4 adds validated oriented climbable segments, climb-face normals,
feet-position exits, material type and optional speed. Runtime validates capsule
clearance against world collision. IPC 0.11 adds version-isolated movement
activity, ladder identity and interaction prompt fields. Previous versions stay
unchanged. See `test/climbing.test.mjs` and RFC-0004/0006.

## IPC 0.12 — deterministic input and camera recordings

Extends frozen IPC 0.11 (climbing) with input.control-gated recording.start/stop/
mark/status and replay.start/stop/status, bounded assertion specs, and the
unbound record.toggle action in every input mode. Older keymaps are projected
without that action. Runtime records are private, versioned JSONL, with app
keystrokes masked by default. Replay uses a fixed 60 Hz clock; camera-only
replay never forwards input. Existing 0.11 movement activity remains inherited.

## IPC 0.13 and world 0.5 — generic authoring and rendering controls

- Capability-gated photo-camera hold with normalized quaternion, 5–140° vertical
  FOV, NDC lens shift and fixed render scale; camera.get reports actual lens state.
- Optional authored depth/normal ink style and Performance override/cost.
- Explicit visibility areas with bounds, scene-node subtrees and visibleFrom
  lists. Unassigned geometry and cameras outside areas remain visible.
- Prior world and IPC schemas are unchanged; positive/negative tests cover the
  new bounds, links, ownership and closed fields.

## IPC 0.15 — tool slots, pocket queue and content sizing

Adds generic tool declarations, bounded pocket/client feedback, canonical shared
Primary/Secondary/Alternate/Cycle bindings and optional persistent placement
content dimensions. Earlier IPC schemas stay byte-for-byte frozen. World format
is unchanged (0.5).

## World 0.7 — 2026-10-09

`v0.7/world.schema.json` (world.json shape as 0.6, `formatVersion: "0.7"`) and
`v0.7/common.schema.json` (0.6 definitions). New `scene` validation kind checks a
package's `scene.gltf` against its world format: 0.7 may require
`KHR_texture_basisu` (KTX2 material textures), `EXT_meshopt_compression` and
`KHR_mesh_quantization`, and must list those it uses in `extensionsRequired`;
lightmap textures stay PNG in every v0 format. Exports `atLeast()`,
`worldFormats` and `sceneExtensions()` so version gates are not hard-coded lists.
Inheritance test: every valid 0.6 document is valid as 0.7. IPC is unchanged.

## IPC 0.16 — 2026-10-10

`v0.16/ipc.schema.json`: graphics `upscaler` setting (`fsr1` | `bilinear` |
null) in config, effective values, overrides, presets and `graphics.set`
patches; `session.hello` reports `0.16`. Inheritance test: every 0.15
definition exists in 0.16 and the graphics properties differ only by the new key.

## IPC 0.17: debug capture notes

- `capture.annotate {captureId, note}` (shell.control): writes an optional note
  (0..1000 code points, no control characters) into a debug capture's JSON and
  the captures index. Result `{revision}`.
- `capture.taken {captureId, timestampMs, mode}` notification, sent to 0.17
  shells when U (or the mode's capture binding) snapshots the world, before the
  files are written.
- Everything else is inherited from 0.16 unchanged.

## IPC 0.18: device-scaled offload power cap and offload device selection

- `offload_power_cap_w` in `graphicsConfig`/`graphicsPatch` is a number 20–1000
  or `null` (was 20–100). `null`, the new default, is automatic: the battery
  profile ceiling with a battery, otherwise 75 % of the offload GPU's enforced
  power limit (80 W when the limit is unknown).
- New `offload_device`: `"auto"` (default) or the lowercase PCI address
  (`domain:bus:device.function`, e.g. `0000:65:00.0`) of the GPU that runs the
  offload renderer.
- `performance` (graphics.get/set) gains required `capSource` (`profile` |
  `device` | `configured` | `fallback`) and `device` (`null` or `{pci, node,
  name, enforcedLimitW, selection, drivesCompositor}`). `profile` is unchanged;
  systems without a battery report `full-ac`.
- `session.hello` reports `0.18`. Everything else is inherited from 0.17
  unchanged. Inheritance test: every 0.17 definition is identical except the
  graphics properties (only the two offload keys differ), `performance` (only
  the two new keys) and the hello protocol constant.
