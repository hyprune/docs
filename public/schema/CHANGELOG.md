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

## IPC 0.19: player settings, view bob and reticle

- `player.get {}` (state.read) and `player.set {patch}` (movement.control) return
  `playerSettings {config, defaults, overrides, options, ranges, path, error}`.
  `playerConfig` keys: `walk_speed`, `run_speed`, `view_bob`
  (`off|subtle|normal`), `reticle_style`, `reticle_size`, `reticle_thickness`,
  `reticle_gap`, `reticle_opacity`, `reticle_outline`, `reticle_colour`
  (`"theme"` or RGB), `reticle_dynamic`, `reach_grab`, `reach_mount`,
  `reach_placement`. `playerPatch` takes any subset (at least one key); `null`
  removes a persisted override. `overrides` uses `playerOverrides` (the same
  keys, never null, may be empty).
- `graphics` `fov` accepts 30..120 (was 30..110) in config and patches.
- `overlayStyle` gains `reticleColor`, `validColor` and `invalidColor` (RGB
  0..1; required in the result, optional in the params patch).
- `interaction.reticle {state, action}` (required): what the reticle shows
  (`hidden|neutral|typing|target|valid|out_of_range|invalid|holding`) and the
  action it would take (`""|click|grab|pocket|place|mount|select|path|drop`).
- Everything else is inherited from 0.18 unchanged, including the offload cap
  and device keys; `session.hello` reports `0.19`.

## IPC 0.20: pocket actions and blueprint map levels

- `surface.pocket {surfaceId}` and `surface.unpocket {surfaceId}` (surface.control).
  Pocket: the window leaves the world for the Placement queue, its placement kept;
  idempotent. Unpocket: placed at a free spot in front of the player
  (`placed: true`) or left in the pocket, selected for the Placement tool
  (`placed: false`). Results `{revision}` / `{revision, placed}`.
- `map.levels` (optional, 1..6): `{id, name, minY, maxY, svg, sha256}` per
  blueprint level, sorted by `minY`, in the frame of the map (`worldToMap`).
- New `extensions/blueprint.schema.json`: the `com.hyprune.blueprint` 0.1 world
  extension (levels with package-relative SVG paths; byte budgets, ordering and
  the `class` vocabulary are stated in its description and enforced by consumers).
- Everything else is inherited from 0.19 unchanged; `session.hello` reports
  `0.20` and lists the two methods. Inheritance test included.

## World 0.8: placed world objects

- World format **0.8** adds `objectAssets` (at most 32) and `objects` (at most
  256). An asset is a package-relative glTF (`scene`, same extension rules as the
  world's scene.gltf; never lightmapped) with optional declarative node animation
  (at most 16: `spin` or `orbit` about `pivot`/`axis` in asset space, or `bob`
  along `axis` by `amplitude` metres; `period` 0.5–3600 s, optional `phase`), an
  optional static `collision` proxy node and `lighting.mode` (`probe` default, or
  `unlit`). Nodes are referenced by unique glTF node name. `library` (`id@version`)
  is reserved for shared object libraries and rejected in 0.8. An object places an
  asset with a `pose`, uniform `scale` (0.01–100), animation `speed` (0–10, default
  1), `phase` (0–1) and an optional `ambient` RGB override (0–16).
- `validate('world')` (from 0.8): unique asset and object ids, known asset
  references, normalised poses, unit axes, per-type fields (spin/orbit need a
  pivot and take no amplitude; bob the reverse), one animation per node, collision
  node not animated, library references rejected. `validate('scene', gltf,
  undefined, '0.8', {world, asset: id})` checks an asset's glTF: extension rules,
  referenced node names exist exactly once, no animated node inside another
  animated subtree, the collision node has a mesh and is outside every animated
  subtree.
- `v0.8/common.schema.json` is the 0.7 common definitions under the 0.8 `$id`
  (the directory already held IPC 0.8, which keeps its own references).
  Everything else is inherited from 0.7 unchanged. Inheritance test included.

## @hyprune/schema 0.6.0 (2026-10-11)

Publishes IPC 0.20 and world format 0.8 to npm.

## Object manifests 0.9, libraries and the library release record (RFC-0011)

New contract files; no IPC or world format change (world formats stay 0.1–0.8).
Object manifests use the world format numbering: a world may use objects whose
`formatVersion` is at most its own.

- `v0.9/object.schema.json` (`object.json`): `id` (slug, equals the directory
  name), SemVer `version`, `name`, `category`, `tags`, a directory-relative
  `scene`, `license` + `attribution`, rest-pose `bounds`, optional `thumbnail`
  and `lighting`, `traits` and optional `slots`. Traits: `decorative` (0.8 node
  animations), `collidable` (0.8 proxy), `movable` (`surfaces`, `upright`,
  `scale`), `character` (measured `clips` with `walk` and `idle`, `height`,
  `radius`, `accent`, asset-level `say`/`panel` interactions) and `seat`
  (anchors, `capacity`). `mover`, `machine`, `mount` and `interactive` are
  reserved and rejected with a reason. Slots `states`, `labels`, `spawns` and
  `effects` (at most 8 each) are validated and inert.
- `v0.9/library.schema.json` (`library.json`): reverse-domain `id`, `version`,
  `name`, `license` + `attribution` and 1–256 listed `objects`.
- `v0.9/library-releases.schema.json`: the meta repository's
  `libraries/releases.json`, one record per `id@version` (`id`, `version`,
  `formatVersion`, `url`, `sha256`, `nixHash`, `published`).
- **Draft** `v0.10/object.schema.json` and `v0.10/library.schema.json`: 0.9 plus
  the `mover` trait, RFC-0013's `machine` trait (typed `inputs` with `repeat`,
  `drives` in the mapping language, `primary`, `positions`, `recipes`) and the
  slot additions (`labels` font/align/colour/plate, `spawns` track/items/maxRate,
  `effects` kind/colour/durationMs, new `tracks`, `stacks`, `toggles`, `ports`).
  It may change until world format 0.10 is defined.
- `validate('object', manifest, undefined, format?, options)`: trait
  combinations, origin conventions (floor, wall and ceiling within 1 cm; a
  character's rest-pose feet within 5 cm), slot
  ids, poses inside the bounds grown by 0.5 m, palettes, seat anchors, track
  points and arcs, stack layouts, machine input references, drive targets and
  output domains. With `options.gltf`: the format's glTF extension rules, node
  names (unique, in the scene; the proxy may sit outside it), the 0.8 animation
  and proxy rules, states-slot materials and nodes (one slot each),
  `KHR_materials_variants` mappings (variant names of a states slot are palette
  ids), character skins, clips and `extras.speed` (2%), triangle budgets
  (50,000; characters 16,000; items 2,000; proxy 2,000) and bounds (exact for
  axis-aligned meshes, else a containing box). `options.files`, `thumbnail`,
  `measured` and `directory` add the directory limits, attribution coverage, the
  256 x 256 thumbnail, the 1 cm bounds check and texture and GPU budgets.
  Results carry `warnings`.
- `validate('library', manifest, undefined, format?, {objects, files})` and
  `validate('library-releases', record)`. `objectFormats` and `objectLimits` are
  exported. The CLI accepts `object` (with an optional glTF/GLB), `library` and
  `library-releases`.

## IPC 0.21: markers, personal quests and focus sessions

- New grant `quest.control` (hello capabilities): every quest and focus mutation
  and `guidance.set`.
- Required state keys: `markers {reveal, persistent, calm, coreDraw, list}`
  (reveal `holdMs` 0 = toggle or 1000..15000, `fadeMs` 0..600; at most 64
  markers with tier 1..4, labels up to 48 characters, one target of position,
  zone, area, place or workspace), `quests {enabled, tracked, active[<=16],
  counts, world: null}` and `focus {state, pausedState, sessionId,
  phaseStartedAtMs, phaseEndsAtMs, phaseMs, remainingMs, creditedMs, crediting,
  cycle, cycles, breakKind, countMode, target, calm}`. Times are monotonic ms.
- Methods: `markers.reveal {durationMs?}` (shell.control); `guidance.get`,
  `guidance.set {patch}` returning `{config, defaults, overrides, ranges,
  options, path, error}` over 21 flat dotted keys; `quests.list {states?,
  sources?}`, `quests.get {questRef}`, `quests.track {questRef|null}`,
  `quests.accept/abandon/resume/delete {questRef}`, `quests.create {quest}`
  (`{revision, questRef}`), `quests.update {questRef, quest}`, `quests.mark
  {questRef, stepId, objectiveId}`; `focus.start {target?, questRef?,
  objectiveId?, overrides?}` (`{revision, sessionId}`),
  `focus.pause/resume/skip/stop {}`, `focus.history {days?}` (at most 512
  intervals). Personal quests: 1..16 steps, 1..8 `manual`, `reach` or `focus`
  objectives per step.
- Events: `quest.progress` and `focus.phase` (`focusSessionId`; every event
  carries the IPC `sessionId` and `revision`).
- `inputConfig` world mode gains `markers.reveal`; `overlayStyle` gains
  required `questColor` (optional in the patch); `spatial.projection` markers
  gain optional `markerId`.
- File schemas: `v0.21/quests-personal.schema.json`,
  `v0.21/guidance.schema.json`, `v0.21/focus-history.schema.json`.
- Everything else is inherited from 0.20 unchanged; `session.hello` reports
  `0.21`. Inheritance test included.

## IPC 0.22: object catalog, user placements and libraries (RFC-0011 P1)

- New grant `objects.control` (hello capabilities): every overlay change and
  library install/remove.
- Required state key `objects {catalogRevision, instances[<=512], pocket[<=16],
  usage, limits}`. An instance is `{id, source (authored|user), ref, name,
  areaId, pose, scale, state (active|hidden|missing|blocked|loading|suspended),
  movable, locked, rule, path, activity, seat}`; `path`, `activity` and `seat`
  are always null until P2. `usage`/`limits` count this world's user
  placements (placements, assets, triangles, gpuBytes, collisionTriangles).
- Methods: `objects.catalog {}` (`{revision, entries[<=1024]}`; an entry carries
  ref, source, id, version, formatVersion, name, description, category, tags,
  traits, surfaces, scale range, bounds, triangles, gpuBytes,
  collisionTriangles, an absolute thumbnail path, license, library, other
  versions, state, placeable, reason and up to 8 errors);
  `objects.pocket {ref}` (`{revision, itemId}`); `objects.place {ref, pose?,
  scale?}` (`{revision, id}`); `objects.transform {id, pose, scale?}`;
  `objects.remove {id}|{all:true}`; `objects.hide {id, hidden}`;
  `objects.reset {id}|{all:true}`; `objects.configure {id, patch:{locked}}`;
  `libraries.list {}`; `libraries.install {archive, sha256}` (`{revision, id,
  version}`); `libraries.remove {id, version}`. Refs are
  `package/<asset>`, `library/<id>@<semver>/<object>` or `user/<object>`.
- `editor.selectedKind` gains `node`; `editor.submode` gains `universal`;
  `editor.unplaced` gains `objects` (pocket items, `count` up to 32); new
  required `editor.gizmo {space, pivot, snap}`.
- Error `data` may carry `rule` (the placement rule or limit that refused a
  method).
- Everything else is inherited from 0.21 unchanged; `session.hello` reports
  `0.22`. Inheritance test included.

## @hyprune/schema 0.7.0 (2026-10-12)

Publishes IPC 0.21 (markers, personal quests, focus sessions) and IPC 0.22 (object catalog, user placements, libraries), plus the object manifest (`object.json` 0.9 and the 0.10 draft), library and library release-record schemas.

## World 0.9: characters, paths, seats and keepClear (RFC-0011 P2)

- `objectAssets[]` (at most 32, ids unique) take exactly one source: inline
  `{id, scene, animations?, collision?, lighting?, traits?, slots?}` (the 0.8
  asset plus object.json 0.9 `traits` and `slots`; `decorative`, `collidable`,
  `movable`, `character` and `seat` are allowed, `mover`, `mount`, `machine` and
  `interactive` rejected), `dir {id, dir}` (a package directory holding
  `object.json`, object format at most the world's) or `library {id, library,
  object}` (`library` is `<reverse-domain id>@<semver>`, `object` a slug).
  `animations` is shorthand for `traits.decorative.animations` and `collision`
  for `traits.collidable`; giving both forms of one is invalid.
- `objects[]` gain `path` (a `route` path; replaces `pose`), `reverse` (only
  with `path`), `seat` (a `seats[]` id, `<objectId>/<anchorId>` or
  `<objectId>`; characters without a path), `accent` (linear RGB 0..1),
  `interactions` (1..8, replacing the asset's list) and `locked` (movable
  assets). `pose` is required unless `path` is set and forbidden with it. A
  character's `scale` must be 1; at most 16 character instances and 8 per path.
- Instance interactions `{id, label (1..32), prompt? (1..64), action}` with
  `say {lines[1..8]}`, `waypoint {target: {zoneId}|{position}|{anchor}|{object}}`,
  `guide {path}` (a route) or `panel {panel}`. `travel` and `quest` are
  reserved and rejected. Asset-level interactions stay `say`/`panel`.
- `paths[]` (at most 64, 1,024 points in total): `{id, name?, use?
  (route|track|generic, default generic), closed?, points[2..256] {position,
  type: line|curve|arc}, speed? (0.1..30), stops?[<=32]}`. A stop is `{point,
  seconds? (0.5..600), clip? (look_around|wave|nod|idle_fidget), face?
  ({position}|{anchor}|{object}), seat?}` with at most one of clip, face and
  seat, one stop per point and the point below the point count. Track stops
  take only `point` and `seconds`; generic paths have no stops. An `arc` needs
  a horizontal chord of at least 0.1 m.
- `seats[]` (at most 64): `{id, pose, height (0.2..1), use? (["sit"]),
  approach? (0.3..2)}`. `keepClear[]` (at most 64): `{id, min, max}`, min
  below max on every axis.
- `validate('world', manifest, undefined, '0.9', {assets})` adds unique ids,
  asset, path, seat, waypoint and face references, route-only bindings,
  character-only and movable-only fields, pose/path exclusivity, normalised
  seat poses, arc chords, the point total, keepClear ordering and the
  character limits. `assets` maps a dir or library asset id to its parsed
  `object.json`, so its traits are checked like an inline asset's; without it
  those checks skip the asset. Reserved traits and actions are reported with a
  plain reason. `worldLimits` exports the limits.
- `validate('scene', gltf, undefined, '0.9', {world, asset})` reads an inline
  asset's animations and proxy from either form and checks an inline
  character's skin and clips; dir and library assets are checked as objects.
- `v0.9/common.schema.json` is the 0.8 common definitions under the 0.9 `$id`
  (the directory's IPC, input, object and library schemas are untouched).
  `examples/world-npcs.json` is a synthetic 0.9 manifest. Everything else is
  inherited from 0.8 unchanged. Inheritance test included.

## IPC 0.23: characters, paths and interactions (RFC-0011 P2)

- Required state key `npcs {motion (auto|always|still|off), state
  (none|animating|paused|still|off), reason (null or up to 64 characters, e.g.
  battery), usage {authored, user}, limits {authored (<=16), user (<=8)},
  drawing, aimed, interaction}`. `drawing` is null or `{pathId, use, spawn:
  null|{ref}, bind: null|objectId}` (a `paths.draw` in progress); `aimed` is null
  or `{objectId, name, prompt, interactions[<=8] {id, label, type}}`;
  `interaction` is null or `{objectId, interactionId|null, type
  (choose|say|waypoint|guide|panel), label, choices[<=8] {id, label},
  line|null, lineIndex, lineCount, panel|null}`.
- `objects.instances[]` gain required `character` (boolean) and `accent`
  (null or linear RGB); `path` is null or a qualified path ref
  (`package/<id>`, `user/<id>`), `activity` null or
  `idle|walking|running|stopped|sitting|guiding|interacting|suspended`, `seat`
  null or a seat ref (up to 192 characters).
- `editor.paths[]` gain required `use` (route|track|generic), `name`
  (string|null), `speed` (number|null) and `stops` (at most 32, the world 0.9
  stop shape).
- `interaction.reticle.action` gains `interact`. `graphicsConfig` and
  `graphicsPatch` gain `npc_motion` (`auto`, `always`, `still`, `off`).
- Methods: `npcs.spawn {ref, path?, pose?, phase?, speed? (0.25..2), accent?,
  reverse?}` (`{revision, id}`; path and pose exclusive, reverse needs a path);
  `npcs.bind {id, path?, pose?, phase?, speed?, accent?, reverse?}` (at least one
  setting); `npcs.disable {id, disabled}`; `npcs.remove {id}|{all:true}`;
  `paths.list {}` (`{paths[<=192]}`: `{ref, source (package|user), id, name,
  use, closed, points, speed, stops, walkable (null for non-routes),
  problems[<=8], bound[<=8]}`); `paths.set {path: {id?, name?, use, closed,
  points[2..256], speed?, stops?}}` (`{revision, id}`); `paths.remove {id,
  unbind?}`; `paths.draw {use?, name?, spawn? {ref, phase?, speed?, accent?},
  bind?}` (`{revision, id}`; spawn and bind exclusive); `paths.finish {}`
  (`{revision, id|null, bound|null}`); `interaction.choose {objectId,
  interactionId|null}`. Path params take a qualified ref or a bare id
  (`package/<id>`); `paths.set/remove/draw/finish` ids are user path ids.
  Grants: `npcs.*` and `paths.set/remove/draw/finish` need `objects.control`,
  `paths.list` needs `state.read`, `interaction.choose` needs `world.control`.
- Everything else is inherited from 0.22 unchanged (no new grant or event);
  `session.hello` reports `0.23` and lists the ten methods. Inheritance test
  included.

## @hyprune/schema 0.8.0 (2026-10-12)

Publishes IPC 0.23 and world format 0.9: characters and NPC instances, authored paths (route/track/generic) with stops, seats, keepClear volumes and NPC interactions.

## Unreleased: object manifest 0.10 draft additions

Draft only; no version changes. `v0.10/object.schema.json` and the validator:

- Mappings take an `average` modifier `{windowS? (1–3600, default 60),
  override?}`: the running average of a numeric value, alone or under `scale`,
  `thresholds`, `cases` or `format`; never with `becomes` or `counter`. The
  validator requires an `int` or `number` input, and in drives an `override`
  that names another non-event input of the machine (recipes take no override).
  A direct average of an `int` is fractional, so counts need a rounded scale.
- New slot kind `levels` (at most 8): `{id, node, mode: fill|slide, axis?
  (unit vector, default [0, 1, 0]), length (> 0, ≤ 10), surface? (fill only),
  settle?: ease|spring}` and drive target `level:<id>` (outputs 0–1). With the
  glTF: `node` and `surface` exist in the scene, the surface is not inside the
  fill node's subtree, no node is moved by two slots, and the collision proxy
  is never moved.
- `stacks`: `cap` up to 100 (was 64) and an optional `rate` (copies per second,
  0–1000). `layout.spacing` components may be negative (−10 to 10 m; copies fill
  from the node towards the sign) and must be non-zero where that axis's grid is
  above 1.

## IPC 0.24: machine inputs in the catalog and live machine state (RFC-0013)

- `objects.catalog` entries gain required `machine`: null for an entry without
  the machine trait, else `{primary: input id|null, inputs[1..16]}`. Each input
  is the object 0.10 declaration as authored: `{id, type (enum|int|number|bool|
  text|event|items), label, explain, default?, values? (enum), min?/max?
  (int, number), maxLength? (text), repeat? (2–16, not expanded), states?
  (items)}`.
- Required state key `live {instances[<=64]}`, published on change and never
  per frame. An instance is `{id, asset, ref|null, source|null (the source
  every bound input reads, null when they differ), status (ok|error|null, the
  source's _status), error (<=256|null, its _error), stale, inputs}`; `inputs`
  maps up to 16 input ids, repeated inputs expanded (`health.1`), to `{source|null,
  key|null, value, raw, condition (fresh|stale|missing|error), publishedAt}`.
  Values are scalars (strings <=256) or null; `publishedAt` is the wall-clock
  Unix ms of the publication core holds, null when missing.
- Everything else is inherited from 0.23 unchanged (no new method, grant or
  event); `session.hello` reports `0.24`. Inheritance test included.

## @hyprune/schema 0.9.0 (2026-10-13)

Publishes IPC 0.24: `objects.catalog` entries carry a placed machine's declared inputs (`machine`), and a new `live` state key reports each placed machine's source, status and per-input values (published only on change). Inherited from 0.23 otherwise; no new grant. Also the object 0.10 draft additions for gauges: the `average` mapping modifier, `levels` slots (fill/slide with spring) and stack rate, cap 100 and signed spacing.

## Unreleased: registry documents

Registry documents (RFC-0015), versioned independently under `registry/v0.1/`:
`index.schema.json` (index documents; `$defs.entry` for registry entry files),
`release-record.schema.json` and `sources.schema.json`. `validateRegistry(kind, doc,
version?)` for kinds `registry-index`, `registry-entry`, `release-record` and `sources`
checks unique ids, versions unique and newest first (SemVer, no build metadata), tags
naming their version (`v<version>` or `<name>-v<version>`), SPDX licences, per-type
archive limits and custom source rules. New exports: `registryVersions`,
`registryLimits`, `parseSemver`, `compareSemver`, `tagVersion`. The CLI accepts the four
registry kinds. The package ships `registry/`. World formats and IPC are unchanged.
