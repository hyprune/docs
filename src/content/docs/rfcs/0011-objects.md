---
title: "RFC-0011 — World objects: libraries, traits, user placement and paths"
description: "One object system for authored, shared and user objects: the object manifest and its traits, three sources in one catalog, user placement, tools on objects, paths, seats and the contract plan."
---

**Status: draft · proposed 2026-10-11.** Nothing here is implemented beyond world format 0.8
placed objects ([RFC-0004](/rfcs/0004-world-format/#amendment-world-08-placed-world-objects))
and the M3B path and position tools ([RFC-0006](/rfcs/0006-interaction/#amendment-m3b-keymap-v2)).
It extends 0.8 objects instead of adding a parallel system: ambient characters
([RFC-0010](/rfcs/0010-npcs/)) become one trait of an object, NPC routes become paths, and the
`library` field that 0.8 reserved is switched on. Two drafts build on it: [RFC-0012](/rfcs/0012-quests/) (quests,
markers and focus sessions) supplies the `quest` interaction action and marker targets, and
[RFC-0013](/rfcs/0013-live-objects/) (live objects: data bindings, machines and flows) fills the `machine` trait and the
slots reserved below.

## Goal

A world is assembled from tested pieces, and a user can add, move and remove pieces the way
they place windows: pick an object from a catalog, pocket it, place it, adjust it. The same
object can come from the world package, from a shared library or from the user's own folder.
Characters walk paths, sit on seats and offer a few predefined interactions; rigid movers and
short-lived items run along tracks. Nothing a user does edits an installed package, nothing a
tool does can push an object into a wall, a doorway or the void, and an object that is not
moving costs no frames.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Object asset | A glTF scene plus its manifest (`object.json`): geometry, rights, bounds and traits. |
| Instance | One placed copy of an asset with a pose: authored (`world.json` `objects[]`) or user (the per-world overlay). |
| Trait | A named capability of an asset with its own data. Traits decide which tools and behaviours apply. |
| Source | Where an asset comes from: the world package, a library or the user folder. |
| Catalog | The merged, validated list of assets from all sources that core offers for placement. |
| Path | A polyline of points with segment types, authored in the package or drawn with tool 3. |
| Binding | An instance attached to a path (characters to routes, movers and items to tracks). |
| Slot | A named, authored point, surface or material set in an asset that a later contract drives (RFC-0013). |

## Object assets

An object asset is a directory: a manifest next to its glTF. The same directory layout is used
inside world packages, inside libraries and in the user folder.

```text
street-lantern/
  object.json
  object.glb           # .gltf with external buffers/textures is equally valid
  thumbnail.png        # optional, 256 x 256
  LICENSE              # optional when object.json names an SPDX licence the source covers
```

```json
{
  "formatVersion": "0.9",
  "id": "street-lantern",
  "version": "1.0.0",
  "name": "Street lantern",
  "category": "lighting",
  "tags": ["lamp", "street"],
  "scene": "object.glb",
  "license": "CC-BY-4.0",
  "attribution": [{"path": ".", "author": "Hyprune contributors", "license": "CC-BY-4.0"}],
  "bounds": {"min": [-0.25, 0, -0.25], "max": [0.25, 2.4, 0.25]},
  "thumbnail": "thumbnail.png",
  "lighting": {"mode": "probe"},
  "traits": {
    "decorative": {"animations": [
      {"node": "flame", "type": "bob", "axis": [0, 1, 0], "amplitude": 0.01, "period": 3}]},
    "collidable": {"node": "proxy"},
    "movable": {"surfaces": ["floor"], "upright": true, "scale": [0.75, 1.5]}
  }
}
```

| Field | Rules |
| --- | --- |
| `formatVersion` | Required. Object manifests use the world format numbering and start at `"0.9"`: the version names the asset and trait rules the object follows. A world may use objects whose `formatVersion` is at most its own; user placement needs a core that supports the object's version. |
| `id` | Required slug (1-64), unique within its source. In a library or the user folder it equals the directory name. |
| `version` | Required SemVer. A library pins the version that counts (below); for user objects it is informative and core tracks the content digest. |
| `name`, `description` | Required display name (1-64 printable characters); optional description (at most 512). |
| `category` | Required: `furniture`, `lighting`, `plants`, `signage`, `machines`, `decor`, `characters`, `vehicles` or `other`. Catalog grouping only. |
| `tags` | Optional, at most 8 slugs, for search. |
| `scene` | Required directory-relative `.glb`/`.gltf`, with RFC-0004 path safety and the glTF extension rules of the object's format (0.7's KTX2, meshopt and quantisation included). |
| `license`, `attribution` | As world packages: an SPDX expression and attribution entries covering every file (`path: "."` is the object directory). `LicenseRef-` expressions are valid for private user objects. |
| `bounds` | Required rest-pose AABB in asset space, metres. Core recomputes it from the scene; more than 1 cm off on any face rejects the object. The 0.8 swept-bounds sphere is still derived by core for animated assets. |
| `thumbnail` | Optional PNG, 256 x 256, at most 256 KiB, sRGB, alpha allowed. Without one the catalog shows a placeholder. |
| `lighting` | As 0.8: `probe` (default) or `unlit`. |
| `traits` | Required object (may be empty). Keys are trait names; unknown or reserved names reject the object. |
| `slots` | Optional authored slots for RFC-0013 (below). Validated and inert in 0.9. |

**Asset conventions.** Asset space is the glTF scene root: metres, +Y up, the front faces +Z
(as surfaces do). The origin is the point that touches the support: the base centre for
floor objects (bounds min Y = 0 within 1 cm), the back centre for wall objects (bounds min Z =
0, the back against the wall), the top centre for ceiling objects (bounds max Y = 0), the feet
for characters (RFC-0010). An empty `traits` object is the plain 0.8 object: static,
render-only, never picked.

### Traits

| Trait | Data | Gives |
| --- | --- | --- |
| `decorative` | `animations`: the 0.8 node animations (spin, orbit, bob; at most 16). | The 0.8 animation clock, render on demand and reduced motion. |
| `collidable` | `node`: the 0.8 static collision proxy. | Static collision at the instance's committed pose; occludes picks; the stricter placement rules below. |
| `movable` | `surfaces`: any of `floor`, `wall`, `ceiling`, `any` (default `["floor"]`); `upright` (default true for floor and ceiling): gestures and the gizmo only turn it about +Y; `scale`: `[min, max]` within 0.25-4 (default `[1, 1]`). | Offered in the catalog for user placement. Instances can be carried, positioned, pocketed and reset; authored instances can be hidden. |
| `character` | `clips`: clip name to measured values (`walk` and `idle` required); `height` (1.2-2.2 m); `radius` (0.25-0.5 m, default 0.35); `accent` (bool); optional `interactions`. | The RFC-0010 character spec; binding to `route` paths; seats; interactions; protection. |
| `mover` | `speed` (m/s), `accel` (m/s², default 1), `bank` (`{max, gain}`, max 0-45 deg), `pitch` (`follow` or `level`), `offset` (asset-space vector from the path point to the origin), `item` (bool). | Binding to `track` paths; with `item: true`, pooled items on tracks. World format 0.10 (P3). |
| `seat` | `anchors`: 1-8 seat anchors; `capacity` (default: the number of anchors). | Sit stops for characters; player sitting later. |
| `mount` | `anchors`: RFC-0005 tool-mount anchors in asset space (`id`, `pose`, `size`, `screenType`). | **Reserved** (P4): a prop that holds a window. Rejected in 0.9. |
| `machine` | — | **Reserved** for RFC-0013: animation, state palette and labels driven by bound data. Rejected in 0.9. |
| `interactive` | — | **Reserved** (P4): use actions on ordinary objects. Rejected in 0.9. Character interactions are not this trait. |

Allowed combinations (a combination not listed rejects the object):

| Trait | May combine with |
| --- | --- |
| `decorative` | `collidable`, `movable`, `seat`, `mover` (spinning propellers, wheels) |
| `collidable` | `decorative`, `movable`, `seat` |
| `movable` | `decorative`, `collidable`, `seat` |
| `character` | nothing |
| `mover` | `decorative` |
| `seat` | `decorative`, `collidable`, `movable` |

A collision proxy follows the 0.8 rules (a mesh, not animated, not in an animated subtree).
A `character`'s `clips` record what the import step measured and core checks against the glTF:
`{"walk": {"speed": 1.12}, "run": {"speed": 2.9}, "sit": {"seatHeight": 0.46}, "sit_idle": {}}`.
`speed` must match the clip's `extras.speed` within 2%; `seatHeight` is the seat-surface height
the `sit` clip was authored for (the lowest thigh point above the root in its final pose).

### Slots (reserved for RFC-0013)

Slots name the parts of an asset that external data will drive. 0.9 validates their shape and
references (node and material names exist and are unique, poses lie inside the bounds grown by
0.5 m) and otherwise ignores them, so assets can be authored ahead of RFC-0013, which defines
what fills them.

```json
"slots": {
  "states":  [{"id": "status", "materials": ["lamp-glass"],
               "palette": [{"id": "idle", "colour": [0.3, 0.5, 1.0], "emission": 1},
                           {"id": "busy", "colour": [1.0, 0.7, 0.2], "emission": 2},
                           {"id": "fault", "colour": [1.0, 0.2, 0.2], "emission": 3}]}],
  "labels":  [{"id": "title", "pose": {"position": [0, 1.9, 0.26], "rotation": [0, 0, 0, 1]},
               "size": [0.6, 0.15], "maxChars": 24}],
  "spawns":  [{"id": "outfeed", "pose": {"position": [0.8, 0.9, 0], "rotation": [0, 0.707, 0, 0.707]}}],
  "effects": [{"id": "vent", "pose": {"position": [0, 2.3, 0], "rotation": [0, 0, 0, 1]}}]
}
```

| Slot kind | Shape | Purpose (defined by RFC-0013) |
| --- | --- | --- |
| `states` | `materials` (or `nodes`) plus an authored `palette` of named states: linear colour, emission factor; at most 16 states. | A state palette applied to those materials. |
| `labels` | A planar rectangle (`pose`, `size` in metres, front +Z) and `maxChars` (at most 64). | Short text drawn on the object. |
| `spawns` | A `pose`. | Where items enter or leave a track at a machine. |
| `effects` | A `pose`. | Anchors for later effects (light pulses, particles). |

At most 8 slots of each kind, ids unique per kind. Labels and effects never become pick or
collision geometry.

## Three sources, one catalog

| Source | Location | Mutability | Reference |
| --- | --- | --- | --- |
| World package | Inside the package, listed in `objectAssets[]` | Read-only, versioned with the package | `package/<assetId>`, only inside that world |
| Library | `$XDG_DATA_HOME/hyprune/libraries/<id>@<version>/`, then `$HYPRUNE_LIBRARY_DIR` and directories handed to core by the system modules | Immutable per version | `library/<libraryId>@<version>/<objectId>` |
| User folder | `$XDG_DATA_HOME/hyprune/objects/<id>/` | Edited by the user; revalidated on change | `user/<id>` |

### Libraries

A library is a published set of object directories with one manifest:

```text
com.hyprune.street/
  library.json
  LICENSE
  ATTRIBUTION.md
  objects/
    street-lantern/   object.json, object.glb, thumbnail.png
    bench/            ...
```

```json
{"formatVersion": "0.9", "id": "com.hyprune.street", "version": "1.2.0", "name": "Street kit",
 "license": "CC-BY-4.0",
 "attribution": [{"path": ".", "author": "Hyprune contributors", "license": "CC-BY-4.0"}],
 "objects": ["street-lantern", "bench"]}
```

`id` is reverse-domain like world ids, `version` SemVer, `objects` lists 1-256 object ids in
catalog order, each a directory under `objects/` whose manifest `formatVersion` is at most the
library's. Libraries are published like worlds: a GitHub Release `<library>-v<version>` with a
`.tar.zst` archive, and a pinned record in the meta repository's `libraries/releases.json`
(`id`, `version`, `formatVersion`, `url`, `sha256`, `nixHash`, `published`). Archive rules and
caps follow RFC-0004 (no links, devices or traversal; 512 MiB expanded, 4,000 files).
Installers (the meta repository's installer and modules, `hyprune library install id@version`)
verify the hash before extraction. Core never downloads anything: a world or placement only
resolves libraries that are already installed. Official libraries follow the RFC-0004 rights
policy (original, CC0 or CC-BY-4.0 with provenance).

A world package references a library object instead of carrying it:

```json
"objectAssets": [
  {"id": "lantern", "library": "com.hyprune.street@1.2.0", "object": "street-lantern"},
  {"id": "armillary", "dir": "objects/armillary"},
  {"id": "buoy", "scene": "objects/buoy.glb", "animations": [
    {"node": "buoy", "type": "bob", "axis": [0, 1, 0], "amplitude": 0.05, "period": 4}]}
]
```

Installing a world installs the exact library versions it references from the releases
record. A world whose referenced library version is not installed fails activation with
`runtime.notice` `world.library.missing` naming `id@version`, and the previous scene stays.

### User folder

The user folder holds private objects. Adding one is a validation step, never a conversion:

1. The user copies an object directory into the folder, or runs `hyprune object add PATH`,
   which checks it and copies it atomically. For a bare `.glb` the CLI writes a minimal
   `object.json` from flags (`--name`, `--license`, `--author`, `--surface`) and stops at the
   first failure.
2. Core watches the folder (a parent-directory watch like `input.json`'s) and validates new or
   changed directories off-thread after a 1 s quiet period. Results are cached by content
   digest; an unchanged object is not validated again.
3. A valid object becomes a `ready` catalog entry. An invalid one is listed as `invalid` with up
   to 8 errors and, where a conversion would fix it, a pointer to the import tool.

Validation on add is exactly the world validator's object checks: manifest schema, path safety
and symlinks, the glTF validator, the format's extension rules, bounds and origin convention,
trait rules (for characters the `hyprune-npc-check` rules), slot references, attribution
coverage, thumbnail size and the per-asset budgets below. Core MUST NOT decimate, resize or
transcode textures, re-rig, retarget, bake or render thumbnails at load or on add.

**Conversion** is the import tool's job: `tools/object-import` in the worlds tooling (P3)
generalises `npc-import`. It runs on the bake host, needs a provenance note next to the
source, normalises units, axes and origin, decimates to the budget, scales textures, compresses
(meshopt, KTX2), generates an optional box or convex collision proxy, measures bounds and (for
characters) clip speeds and seat height, renders the thumbnail and writes `object.json`.

### Catalog, resolution and id collisions

References are always qualified by source, so the same id in two sources never collides; the
catalog lists both with a source badge. Inside a source, ids are unique by construction
(package asset ids per RFC-0004, object ids per library, directory names in the user folder;
an `object.json` whose `id` differs from its directory is invalid). Several versions of one
library may be installed; the catalog shows the highest and lists the others under it.

| Reference | Resolution |
| --- | --- |
| `package/…` | The package only. |
| Authored `library` | Exact `id@version` only, else activation fails (above). |
| User placement `library/…` | Exact version; if it is no longer installed, the highest installed version with the same major version that still has the object, with `runtime.notice` `object.substituted`; else the placement is `missing`. |
| `user/…` | The folder entry while it is `ready`; else `missing`. |

A `missing` placement keeps its record, draws nothing, has no collision and is listed in the
Director until the source returns or the user removes it. The same `id@version` in two library
roots must have the same digest; different content refuses that version
(`library.conflict`) rather than picking one.

## Placements

### Authored

Authored instances stay in `world.json` `objects[]` with the 0.8 fields and the 0.9 additions
(contract plan below). An authored instance of a `movable` asset can be rearranged by the user
unless it sets `"locked": true`; the change is an overlay, the package is untouched.

### User overlay

User placements, overrides of authored instances, user paths and user characters are a
per-world overlay in core's editor state (`$XDG_STATE_HOME/hyprune/editor.json`, beside today's
paths, transforms and locks; atomic 0600 replacement). Records are keyed by world id (not
package version) and carry the area that owned the position when placed, like window placement
rules.

```json
{"placements": [
  {"worldId": "com.hyprune.lumen-reach", "id": "u-7c2e91", "areaId": "sun-court",
   "ref": "library/com.hyprune.street@1.2.0/street-lantern",
   "pose": {"position": [3.2, 0, -4.5], "rotation": [0, 0.259, 0, 0.966]}, "scale": 1.1, "phase": 0.4},
  {"worldId": "com.hyprune.lumen-reach", "id": "u-npc-1", "areaId": "sun-court",
   "ref": "library/com.hyprune.residents@1.0.0/resident-blue",
   "path": "user/path-17", "phase": 0.2, "accent": [0.9, 0.5, 0.1]}],
 "overrides": [
  {"worldId": "com.hyprune.lumen-reach", "objectId": "court-bench-2",
   "pose": {"position": [1, 0, 2], "rotation": [0, 0, 0, 1]}},
  {"worldId": "com.hyprune.lumen-reach", "objectId": "porter-1", "hidden": true}]}
```

When a package updates, an override whose `objectId` disappeared or whose asset changed stays
dormant and is listed in the Director. User placements keep their world coordinates and are
rechecked against the new geometry at load; one that now breaks a placement rule is `blocked`:
not drawn, no collision, listed with a "Move" action, `runtime.notice` `object.blocked`. Core
never relocates an object silently.

### Adding objects (like windows)

1. **Director → Objects.** A catalog grid: thumbnail, name, source badge, size, trait icons;
   filters by source, category and trait; search over names and tags; `invalid` entries with
   their errors. A **Placed** list shows this world's authored and user instances with their
   state (active, hidden, missing, blocked).
2. **Put in pocket.** The entry joins the pocket queue
   ([RFC-0005](/rfcs/0005-surfaces/#amendment-pocket-queue-and-client-content-sizing-ipc-015)),
   which now holds windows and objects, and tool 5 is selected; Cycle selects the item.
3. **Tool 5.** A translucent ghost follows the aim, coloured by the reticle state. Primary
   places ahead (floor objects drop to the floor under the aim point within `reach_placement`);
   Secondary aligns to the aimed surface (wall objects on walls, floor objects on upward
   surfaces). Placing consumes the item, as for windows.
4. **Configure.** Placing opens the instance's configure panel in the Director when the asset
   has anything to configure (path and stops for characters and movers, speed, phase, accent).
   The panel is built from per-trait sections, so RFC-0013 adds a data-binding section without
   changing this flow; `objects.configure` takes one closed patch per section.
5. **Tool 4** and the Super gestures adjust it afterwards (below).

### Removing, hiding and resetting

- **User placements:** tool 5 Alternate pockets an aimed movable object (it leaves the world and
  becomes the selected pocket item; an unplaced object item is dropped when the world unloads).
  The Director's Remove deletes the record.
- **Authored instances are never deleted.** A `movable` authored instance or an authored
  character can be **hidden** (disabled): it is not drawn, has no collision, does not animate,
  interact or hold a seat. Hidden is persisted per world. Other authored instances can't be
  hidden: the world may rely on them.
- **Reset:** the `window.reset` action (Super+Shift+MMB by default) on an aimed authored movable
  object clears its override; on a user object it restores upright orientation and scale 1. The
  Director offers Reset per instance, "Show and reset authored objects" per world and "Remove my
  objects" per world.

### Budgets and limits

Provisional values, measured and fixed in P1 (Intel iGPU at 4K is the reference machine):

| Limit | Value |
| --- | --- |
| User placements per world | 128 (authored instances keep their own 256) |
| Distinct assets used by user placements per world | 32 (authored keep their own 32) |
| Triangles per asset | 50,000 (characters 16,000, items 2,000) |
| Triangles drawn by user placements (sum over instances) | 400,000 |
| Texture size | 2048 px (characters 1024) |
| GPU memory per asset (textures with mips, buffers) | 48 MiB |
| GPU pool for user-placed assets | 192 MiB, separate from the world's 512 MiB |
| Collision proxy triangles | 2,000 per asset; 10,000 summed over user placements (authored keep 20,000) |
| User characters per world | 8 (authored up to 16, RFC-0010) |
| Object directory | 64 files, 64 MiB, 32 MiB per file |
| User folder | 256 objects |

A placement over a limit is refused with `runtime.notice` `object.budget` naming the limit. The
catalog shows each asset's triangles, GPU bytes and proxy triangles; Performance lists the
user-object totals.

**Rendering** follows 0.8 exactly: one upload per asset, instanced draws, swept-bounds culling,
shared visibility with the static geometry around the instance (recomputed on commit), probe
lighting, render on demand, reduced motion. A static user object costs nothing between frames.
Editing (carry, gizmo) renders frames because the scene changes; a commit recomputes the
instance's probe and visibility off-thread. Asset uploads are staged in the tick in bounded
chunks, never in the render pass. Any object in the world selects the in-process renderer
(RFC-0009 offload draws scene geometry only), with the existing reason.

## Tools on objects

### Targets

| Target | Tool 4 gizmo | `carry` | `distance` | `rotate` | `content.scale` | `window.reset` | Tool 5 Alternate | `interact` (E) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Window | as today | as today | as today | as today | as today | as today | pocket | use |
| Movable object, not locked | yes | yes | yes | yes | uniform scale | reset | pocket | — |
| Other object, mover, item | — | — | — | — | — | — | — | — |
| Character | — | — | — | — | — | — | — | interactions |
| Scene node owning collision | tool 4 only (M3B) | tool 4 only | tool 4 only | tool 4 only | — | — | — | — |

The actions keep their keymap defaults: `carry` Super+LMB, `distance` Super+Wheel, `rotate`
Super+Ctrl+Wheel, `content.scale` Super+Shift+Wheel; on an object, `content.scale` scales it by
1.12 per step within its `movable.scale` range. Carry needs no particular tool for movable
objects (as for windows), keeps the grab point, follows the camera's heading and keeps the
object's own orientation otherwise; `carry.facing` behaves as for windows.

**Picking.** A ray tests window planes, movable instances (swept sphere, then the asset's
triangles at the instance pose; core keeps a CPU copy for movable assets), collision-owning
scene nodes for tool 4, and characters for `interact`; the nearest hit wins. Objects without
a collision proxy never block a window pick (the 0.8 behaviour); proxies are world collision
and occlude like walls. Tool 4 selection is `selectedKind: "object"` for instances and
`"node"` for scene nodes (contract plan).

**Gizmo.** Move, rotate and scale as M3B, with objects' scale uniform (the centre cube only);
`upright` objects show the yaw arc only. Locked authored instances show the lock badge and
refuse edits.

### Placement rules (normative)

Core checks every **commit** (carry release, gizmo drag end, tool 5 place, `objects.place`,
`objects.transform`); intermediate drag poses are previewed, not committed. The placement shape
is the collision proxy for collidable objects, otherwise the instance's bounds box shrunk by
2 cm. A committed pose MUST satisfy all of:

1. **Inside the world.** The shape's centre and support point lie inside the playable union
   (unexpanded) when the world declares one, and above the fall-respawn height.
2. **Not in walls.** The shape does not intersect static collision or another collidable
   instance, except touching its own support (floor under a floor object, wall behind a wall
   object) within 2 cm.
3. **Supported.** A floor object stands on an upward-facing collision surface (normal Y at
   least 0.65) under its base; a wall object has a wall behind it; a ceiling object a ceiling
   above. Only `any` objects may float. Worlds without collision skip this rule.
4. **Windows stay visible.** The shape does not intersect any placed window's oriented
   rectangle plus its RFC-0005 margin, and window placement, carry and spawning treat every
   object's bounds as obstacles, so a window never ends up inside an object.
5. **Screen approaches stay free.** No part higher than 0.1 m above its floor lies in an
   approach zone: the box in front of every anchor, tool mount and workspace wall, its width
   plus 0.3 m each side, from the floor to its top edge, 1.5 m deep. Nothing lies in a
   `placementZones` box (they are reserved for windows).
6. **Ways stay open.** Collidable objects, and any object taller than 0.3 m, do not intersect
   spawn capsules (0.3 m radius, 1.8 m, grown by 0.2 m), climbable prisms and endpoints, or the
   world's `keepClear` volumes (doorways, stairs, narrow passages; world 0.9).
7. **Not into the player.** A collidable shape does not intersect the player's capsule.
8. **Within reach**, per RFC-0006 (`reach_grab` for carry, `reach_placement` for tool 5).

A failing pose shows the `invalid` reticle and a ghost in `invalidColor`; releasing returns the
object to its last valid pose (carry) or its start pose (gizmo); a refused method returns an
error naming the rule. Core never commits an intersecting result. `hyprune-world-check`
applies rules 1, 2 and 6 to authored collidable instances.

### Snapping

- **Surface snap** (on by default; tool 4 Alternate toggles all snapping): floor objects follow
  the highest support under their footprint centre within 0.35 m up and 2 m down; wall objects
  stick to the aimed wall with +Z along its normal; ceiling objects likewise.
- **Shift:** 0.1 m, 15 deg and 0.1 scale steps (M3B).
- **Square to walls:** within 5 deg, a floor object's ±X/±Z turns square to a wall within 0.5 m.

### Characters are protected (normative)

- A character instance (any asset with the `character` trait, authored or user) MUST NOT be a
  target of `carry`, `distance`, `rotate`, `content.scale`, the tool 4 gizmo, tool 5 pocketing
  or any later push or throw gesture. Such a gesture aimed at a character does nothing: the
  reticle shows `invalid`, and core MAY show `runtime.notice` `object.protected` at most once
  every 10 s.
- No tool, gesture, IPC method or path edit may put a character's root off walkable ground,
  over a drop of more than 0.35 m, inside collision or outside the playable union. Path edits
  that would do so are refused. A bound route that becomes unwalkable (package update, edited
  path) suspends its characters where they stand, idle, instead of moving them.
- Characters are never moved by collision response, the player's body or physics. RFC-0010's
  "never in the way" rules apply.
- A character moves only along its route, to a seat, or by an explicit rebinding: a user
  character to another valid route or standing spot; an authored one only by hiding it.
  `objects.transform` on a character is refused (-32005).

## Paths

Paths are first-class data. Authored paths live in the package; tool 3 draws user paths into
the overlay (today's M3B paths, gaining the fields below). Both have one shape:

```json
"paths": [
  {"id": "market-loop", "name": "Market loop", "use": "route", "closed": true, "speed": 1.1,
   "points": [
     {"position": [-6.5, 0, 7], "type": "line"},
     {"position": [-6.5, 0, -3], "type": "line"},
     {"position": [5, 0, -3], "type": "curve"},
     {"position": [5, 0, 7], "type": "line"}],
   "stops": [
     {"point": 1, "seconds": 3, "clip": "look_around"},
     {"point": 2, "seconds": 20, "seat": "court-bench-2/left"},
     {"point": 3, "seconds": 4, "face": {"anchor": "board-north"}}]}
]
```

| Field | Rules |
| --- | --- |
| `id` | Slug, unique among the package's paths. User paths keep their generated ids. References are qualified like objects: `package/<id>` or `user/<id>` (inside `world.json`, a bare id is a package path). |
| `name` | Optional label, at most 64 characters. |
| `use` | `route` (characters walk it), `track` (movers and items ride it) or `generic` (default: drawn, referenced by `travel` or RFC-0012 markers, nothing binds to it). |
| `closed` | Default false. Open routes and tracks are followed to the end and back, unless the track has item sinks. |
| `points` | 2-256 points `{position, type}`. A point's `type` (`line`, `curve`, `arc`) is the segment that arrives at it; on an open path the first point's type is ignored, on a closed one it is the closing segment. |
| `speed` | Optional m/s, 0.1-30. Routes default to the character's walk speed, tracks to the mover's `speed`. |
| `stops` | At most 32: `point` (index), `seconds` (0.5-600, default 3), and for routes optionally `clip` (`look_around`, `wave`, `nod`, `idle_fidget`), `face` (`{position}`, `{anchor}` or `{object}`) or `seat` (`<objectId>/<anchorId>`, `<objectId>` for any free anchor, or a world `seats[]` id). Tracks allow `seconds`, `source` and `sink` (items, below). |
| `areaId` | User paths record their area (as today). |

**Segment geometry** is the curve tool 3 draws today, so a drawn path and what follows it are
the same: a segment from *a* to *b* is straight for `line`; for `curve` a cubic Hermite with
start tangent (*b* − previous point) / 2 and end tangent *b* − *a*; for `arc` the straight line
plus a horizontal offset of 0.3·|*b* − *a*|·sin(π*t*) towards (*b* − *a*) × +Y. An `arc` whose
horizontal chord is under 0.1 m is invalid. Followers move by arc length; core samples 24
steps per segment for drawing and length.

**Limits.** Authored: 64 paths, 256 points per path, 1,024 points in total. User paths keep the
M3B limits (128 paths, 256 points per path, 2,048 points).

### Use and binding

| `use` | Binds | Requirement |
| --- | --- | --- |
| `route` | Character instances; the `guide` interaction; player `travel` | The character has `walk` (and uses `run` above 1.25 x its walk speed when it has it); the path passes the walkability check. |
| `track` | `mover` instances; pooled items | The mover's swept bounds along the track clear static collision by 0.1 m and stay out of approach zones. |
| `generic` | Nothing; `travel` and markers may reference it | Points inside the playable union, when declared. |

An instance binds with `"path": "<id>"` (optionally `"reverse": true`); its `phase` (0.8) is
the fraction of the path's length at which it starts, so several share one path out of step;
`pose` is omitted for bound instances. A path holds at most 8 characters and 8 movers. Binding
an ineligible instance (a lamp to a route, a character to a track) is a validation error or a
refused method.

### Walkability (routes)

Core checks a route at load and on every edit, against collision; the worlds tooling's Recast
navmesh checks (`hyprune-world-check`) apply the stricter release gates to authored routes.

- Every 0.25 m along the curve there is an upward-facing collision surface (normal Y at least
  0.65) within 0.35 m of the previous sample's floor: no ledges, no gaps.
- The character's capsule (its `radius`, its `height`) is clear of collision at each sample,
  and each sample lies inside the playable union.
- No segment crosses an approach zone; a route may pass through a `keepClear` volume (a
  doorway) but no stop or seat approach may lie in one.
- With navigation data, every sample lies on the default spawn's navmesh island and the
  release gate demands the tooling's door width (1.2 m) along the route.

Tool 3 refuses a route point that is not on walkable floor (reticle `invalid`). A route that
fails after a geometry change is listed as `unwalkable`, and its characters idle where they
stand.

**Probe lighting along paths** (RFC-0010 open question 7): core samples a probe every 2 m along
each bound path (at most 256 per path) at load or after an edit, off-thread, and a follower
uses the samples interpolated by arc length.

## Characters

A character is an object asset with the `character` trait; an NPC is an instance of it bound to
a `route` or standing on a spot. The character spec, import pipeline and runtime rules stay in
[RFC-0010](/rfcs/0010-npcs/).

### Interactions

World-authored characters can offer a few predefined interactions. An interaction is data,
never script: an id, a label, an optional prompt and one action from a small vocabulary.

```json
"interactions": [
  {"id": "talk", "label": "Talk", "action": {"type": "say",
    "lines": ["The lifts run every few minutes.", "Mind the gap on the east rail."]}},
  {"id": "show-observatory", "label": "Show me the observatory", "prompt": "Follow me",
   "action": {"type": "guide", "path": "to-observatory"}},
  {"id": "where", "label": "Where am I?", "action": {"type": "panel", "panel": "map"}},
  {"id": "signal", "label": "Ask about the signal",
   "action": {"type": "quest", "quest": "lost-signal", "step": "find-relay"}}
]
```

| Action | Fields | Effect |
| --- | --- | --- |
| `say` | `lines`: 1-8 strings of at most 160 characters | Core shows the lines one at a time as a world-locked caption above the character; E advances; walking more than 4 m away ends it. |
| `waypoint` | `target`: an IPC `Target` (`{zoneId}` or `{position}`), `{anchor}`, `{object}`, or an RFC-0012 marker | Sets the waypoint, as `waypoint.set` does. |
| `guide` | `path`: a `route` path | The character leaves its route and walks the guide path ahead of the player, waiting while the player is more than 6 m behind; at the end it plays `wave` if it has it, then walks the path back and resumes. Cancelled when the player is 30 m away or makes no progress for 60 s. |
| `travel` | `path`: a `route` or `generic` path | The player travels along the path under core's existing travel rules; the character stays. |
| `panel` | `panel`: a shell panel id the shell already opens through `ui.opened` (for example `map`, `help`, `objects`) | Opens the Director on that panel. |
| `quest` | `quest`, `step` | Defined by RFC-0012. The shape is reserved here; validators reject it until a world format with quests. |

At most 8 interactions per character, ids unique per list, labels at most 32 characters,
prompts at most 64 (default: the label). Interactions can sit on the asset (`character.interactions`
in `object.json`) or the instance (`objects[].interactions`); an instance list replaces the
asset list. Asset-level interactions may only use `say` and `panel`, which reference nothing in
a world; that is all a user-spawned character offers.

**At runtime.** Aiming at a character within the use distance shows the prompt through the
existing interaction-prompt path ([RFC-0005](/rfcs/0005-surfaces/#amendment-world-locked-overlays-and-screen-ui))
with the reticle `valid` and action `interact`. E runs a single interaction; with several, the
shell shows a short choice list (menu mode) and returns the choice with `interaction.choose`.
The character stops, turns to face the player (turn clips or at most 180 deg/s) and plays `nod`
if it has it; it resumes its route when the action ends or the player leaves 4 m. Interactions
never run while the player is reading a window, and hidden or `npc.motion = off` characters
offer none.

### User-spawned characters

Users can spawn characters from the catalog (libraries or their folder):

1. **Director → Objects →** a character → **Spawn**.
2. **Choose where it lives:**
   - "Walk a route": pick a listed route (authored or user, with its walkability), or "Draw a
     new route", which selects tool 3 with `use: route` preset; finishing the path binds it.
   - "Stand here": tool 5 shows the character's ghost at the aim; Primary places it on a
     standing spot.
3. **Configure:** speed, phase, accent and stops (per point: seconds, clip, facing, or a seat
   among those within 3 m).

User characters live in the overlay (8 per world); the user can rebind or remove them. Authored
characters can only be hidden (persisted per world) and shown again.

**Placement (normative).** A spawned character is never mid-air and never inside geometry. A
standing spot reuses the reachable-floor rule core applies to window spawns
([RFC-0005](/rfcs/0005-surfaces/#amendment-reachable-spawns-home-arrivals-and-world-switches-no-wire-change)),
for a body: an upward-facing collision surface under the root within 0.35 m, the character's
capsule clear of collision, inside the playable union, outside approach zones,
`placementZones`, `keepClear` volumes and spawn capsules, and, with navigation data, on the
default spawn's navmesh island. A route spawn starts at `phase` along a route that passes the
walkability check. Worlds without collision refuse user characters.

## Seats and sitting

Seat anchors live on `seat` assets (asset space, moving with the instance) or in the world's
top-level `seats[]` (world space, for benches that are part of the scene).

```json
"traits": {"seat": {"capacity": 2, "anchors": [
  {"id": "left",  "position": [-0.5, 0, 0.55], "yaw": 0, "height": 0.45},
  {"id": "mid",   "position": [0, 0, 0.55],    "yaw": 0, "height": 0.45},
  {"id": "right", "position": [0.5, 0, 0.55],  "yaw": 0, "height": 0.45}]}}
```

| Field | Rules |
| --- | --- |
| `id` | Slug, unique within the asset (world seats: unique among `seats[]`). |
| `position` | Where the sitter's root stands at the start of `sit`: on the floor in front of the seat. |
| `yaw` | Degrees about +Y; 0 means the sitter faces the asset's +Z (world seats use a `pose` instead). |
| `height` | Seat-surface height above `position`, 0.2-1 m, scaled with the instance. |
| `use` | Pose families allowed, default `["sit"]`; `perch`, `lean` and `ground` are reserved. |
| `approach` | Free floor in front of the anchor, 0.3-2 m, default 0.6. |
| `capacity` | On the trait: how many anchors may be occupied at once (default all). |

**Sitting (normative for core).** When a character reaches a stop with a `seat`:

1. **Choose.** The named anchor, or for an object reference the nearest free anchor, if the
   seat object is below its capacity and the character has `sit` and `sit_idle` with a
   `seatHeight` within ±0.08 m of the anchor's scaled height. Otherwise the stop is a plain
   stop. The anchor is reserved for this character.
2. **Approach.** Walk straight from the route point to the approach point (the anchor plus
   `approach` along its facing), then to the anchor, turning so the facing matches within
   10 deg on arrival. Both legs are checked for walkability when the route is validated.
3. **Align.** Blend the root onto the anchor's exact position and yaw over 0.25 s; a correction
   over 0.15 m abandons the seat for a plain stop.
4. **Sit.** Play `sit` once, then loop `sit_idle` for the stop's `seconds`; the root stays on
   the anchor.
5. **Stand.** Play `stand` if the character has it, else `sit` reversed; walk back to the route
   point, release the anchor and go on.

A character with a standing spot and an instance `seat` sits there permanently. Carrying,
hiding or removing a seat object, or a player within the personal space on the approach, makes
the sitter wait or stand up (RFC-0010 rules). Still characters (`npc.motion = still`, reduced
motion) at a seat stop are posed seated. **Player sitting** is reserved (P4): anchors will gain
player eligibility, the eye moves to a seated height and movement stands up.

## Movers and items (P3, world format 0.10)

A **mover** is a rigid object that rides a `track`: a drone, a tram, a gondola. It moves at the
path's speed (or its own), accelerates at `accel`, slows to dwell at stops, keeps `offset`
from the path, pitches with the slope (`follow`) or stays level, and banks into turns: roll =
min(`bank.max`, `bank.gain` · atan(*v*²κ / *g*)). Part animations (`decorative`) keep running.
Movers sharing a track keep a gap of their bounds length plus 0.5 m and queue rather than
overlap. Movers have no collision, never take part in picks and follow the character rules for
frames, settings and reduced motion (held still).

An **item** is a short-lived instance of a `mover` asset with `item: true` (at most 2,000
triangles, 1 MiB GPU memory, no collision, no seat). Tracks carry many of them, pooled, to show
work flowing through a pipeline. A track declares its pool:

```json
{"id": "build-line", "use": "track", "closed": false, "speed": 0.8,
 "items": {"assets": ["parcel", "crate"], "max": 64, "spacing": 0.6, "overflow": "refuse"},
 "points": [{"position": [0, 1, 0], "type": "line"}, {"position": [12, 1, 0], "type": "curve"}],
 "stops": [{"point": 0, "source": true}, {"point": 1, "sink": true}]}
```

- **What creates items is RFC-0013's job** (data bindings and machine spawn slots). This RFC
  fixes the runtime contract: an item enters at a `source` stop, the track start or a machine's
  `spawns` slot, moves at the track speed, queues `spacing` metres behind the item ahead (never
  overlapping), dwells at stops with `seconds` and leaves at a `sink` stop or the end of an open
  track. Each item carries a state index into its asset's `states` slot palette and an optional
  label text, set by RFC-0013.
- **Caps:** `max` at most 256 live items per track, 1,024 per world, 16 item assets per world,
  60 spawns per second per track. Over a cap, `overflow` decides: `refuse` (default) or
  `drop-oldest`; dropped counts are published.
- **Pooling:** core preallocates up to `max` instances per track and asset, draws one instanced
  call per asset primitive, allocates nothing in the tick, and derives positions from arc length
  in the tick. IPC carries per-track counts, never per-item state.
- **Frames:** moving items in view keep frames coming like animated objects; a stopped queue
  does not. Reduced motion moves items in steps at most once a second, without interpolation.

## Contract plan

### World format 0.9 (P2)

Every valid 0.8 document is valid as 0.9 apart from `formatVersion` (the inheritance rule).

| Field | 0.9 delta |
| --- | --- |
| `objectAssets[]` | Exactly one source: `scene` (inline, as 0.8, now with optional `traits` and `slots`), `dir` (a package object directory with `object.json`) or `library` + `object` (`library` enabled with the 0.8 pattern). Inline `animations` and `collision` are shorthand for the `decorative` and `collidable` traits; giving both forms is invalid. The 32-asset limit counts all three. RFC-0010's draft `kind: "character"` is replaced by the trait. |
| `objects[]` | Adds `path`, `reverse`, `seat`, `accent`, `interactions` and `locked`. `pose` is omitted for path-bound instances and is the standing spot for an unbound character. RFC-0010's draft inline `route` is replaced by `path`. |
| `paths[]` | New: authored paths (above). `track` paths are accepted; `items` and mover bindings wait for 0.10. |
| `seats[]` | New: world seat anchors `{id, pose, height, use?, approach?}`, at most 64. |
| `keepClear[]` | New: at most 64 boxes `{id, min, max}` that objects may not block (doorways, stairs, passages); the worlds tooling can derive them from its navmesh gates. |
| Limits | 16 character instances; interactions, paths and seats as above. |

Validation adds the trait, slot, path, walkability, binding, seat and interaction rules to the
schema, the shared validator, core and `hyprune-world-check` (scene- and collision-dependent
parts in the latter two). Object and library manifests get `object.schema.json` and
`library.schema.json` in the 0.9 schema directory; they ship with P1, ahead of the world
schema, and describe all 0.9 traits from the start. Core reports any trait it can't place yet
as `placeable: false` with a reason in the catalog. World format 0.10 (P3) adds the `mover`
trait, mover bindings and track `items`; later formats enable `mount`, `interactive` and
RFC-0013's `machine`.

### IPC

Version numbers are assigned when each phase lands; the methods below are grouped by phase. A
new grant, `objects.control`, covers changes to the overlay; reads need `state.read`.

| Method | Params → result | Grant | Phase |
| --- | --- | --- | --- |
| `objects.catalog` | `{}` → `{revision, entries}` (at most 1,024) | state.read | P1 |
| `objects.pocket` | `{ref}` → `{revision}` | objects.control | P1 |
| `objects.place` | `{ref, pose?, scale?}` → `{revision, id}`; without `pose`, in front of the player by the reachable-spawn rules | objects.control | P1 |
| `objects.transform` | `{id, pose, scale?}` → `{revision}` | objects.control | P1 |
| `objects.remove` | `{id}` (user placements) → `{revision}` | objects.control | P1 |
| `objects.hide` | `{id, hidden}` (authored movable or character) → `{revision}` | objects.control | P1 |
| `objects.reset` | `{id}` or `{all: true}` (this world) → `{revision}` | objects.control | P1 |
| `objects.configure` | `{id, patch}`: a closed patch with `speed`, `phase`, `accent`, `path`, `reverse`, `pose` (standing spot) or `seat`; RFC-0013 adds its binding section → `{revision}` | objects.control | P1/P2 |
| `paths.list` | `{}` → `{paths}` (authored and user, with `walkable`) | state.read | P2 |
| `paths.set` | `{path}` (create or replace a user path, validated) → `{revision, id}` | objects.control | P2 |
| `paths.remove` | `{id}` (user path; refused while bound unless `unbind: true`) → `{revision}` | objects.control | P2 |
| `interaction.choose` | `{objectId, interactionId}` → `{revision}` | world.control | P2 |

Catalog entries carry `{ref, source, id, version, name, category, tags, traits, bounds,
triangles, gpuBytes, collisionTriangles, thumbnail, license, state, placeable, errors}`;
`thumbnail` is a validated local PNG path or null, for the shell to display (core opens no path
it receives). State gains an `objects` key: `{catalogRevision, instances}` with at most 512
records `{id, source, ref, areaId, pose, scale, state, path, activity, seat}`; `state` is
`active`, `hidden`, `missing`, `blocked` or `suspended`, `activity` for characters and movers
`idle`, `walking`, `running`, `stopped`, `sitting`, `guiding`, `interacting` or `suspended`.
Positions of moving instances are published at most twice a second (for a map), never per
frame; tracks publish `{pathId, live, dropped}` counts (P3). `editor.paths` gains `use`,
`speed`, `stops` and `name`; `editor.unplaced` gains `objects`; `editor.selectedKind` gains
`node` (older peers see `object` for both). Errors: -32004 unknown id, -32005 locked or
protected, -32007 a placement rule failed (the rule in `error.data`). Older peers receive none
of these fields or methods.

### Shell, SDK and tooling

- **Shell:** a Director **Objects** tab (Catalog, Placed, Paths), the configure panel built from
  per-trait sections, the interaction choice list, and pocket items for objects in the tool 5
  HUD.
- **SDK:** types, mock-core support, `hyprune object check|add|list` and
  `hyprune library install|list|remove`.
- **Worlds tooling:** `object-import`, object and library packaging, the release record, and
  `hyprune-world-check` gates for paths, seats, `keepClear` and authored placements.

### Compatibility

- 0.8 and older packages load unchanged. Their objects have no `movable` trait, so they stay
  render-only and unpickable; user placements, being an overlay, work in any world.
- The draft RFC-0010 fields (`kind`, inline `route`) never shipped and are replaced, not
  migrated.
- Today's scene-node transforms (`editor.objects`) and M3B paths keep working; existing user
  paths become `generic` paths.
- Cores that don't support 0.9 reject 0.9 packages (exact versions), so a world using libraries
  never loads half-resolved.

## Phasing

| Phase | Scope | Contract |
| --- | --- | --- |
| **P1** | Catalog; user folder with validate-on-add; library install and resolution for static and `decorative` objects; `collidable` and `movable`; tool 4 and Super gestures on movable objects; tool 5 placement and pocket; user placements, hide, reset; placement rules and budgets; Director Objects tab (Catalog, Placed). | Object and library manifests 0.9; first objects IPC version; no world format change. |
| **P2** | Characters in the format; routes from tool 3 with walkability; stops; seats and sitting; interactions (except `quest` until RFC-0012); user-spawned characters; authored library references; probes along paths. | World format 0.9; IPC paths and interactions. |
| **P3** | Movers and pooled items on tracks; the shared library repository and release record; `object-import` generalised from the NPC pipeline; thumbnails. | World format 0.10; IPC track state. |
| **P4** | `interactive` objects, player sitting, `mount` props holding windows; RFC-0013 machines. | Later formats and IPC. |

## Open questions

1. **Library granularity:** kits of many objects per release (proposed) or one object per
   release?
2. **Budgets:** the numbers above are provisional; should user objects share the world's GPU
   budget instead of a separate pool?
3. **Pocket behaviour for objects:** consume on place (proposed, like windows) or a stamp mode
   that keeps the item for repeated placement?
4. **`say` text:** plain lines are enough for now, or should talk wait for RFC-0012's dialogue
   and localisation?
5. **Authored opt-in:** `movable` per asset plus per-instance `locked` (proposed), or also a
   world-wide switch that locks every authored object?
6. **Worlds without collision or playable volumes:** allow user objects there with the support
   rule skipped (proposed), or refuse them as for characters?
7. **Sharing layouts:** export a world's overlay (refs and poses) for others to import, later?
