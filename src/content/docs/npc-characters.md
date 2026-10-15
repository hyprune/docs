---
title: "NPC characters"
description: "How to make an ambient character for a Hyprune world: the rig, the clips and the checks."
---

Ambient characters follow [RFC-0010](/rfcs/0010-npcs/) and are objects with the `character`
trait ([RFC-0011](/rfcs/0011-objects/)). World format 0.9 places them: on a route, on a
standing spot or on a seat, with a few predefined interactions. Users can also spawn
characters from the object catalog (IPC 0.23). This page covers making a character and
putting it in a world.

## Make the character

- **Size and axes:** a humanoid about 1.6-1.9 m tall, in metres, +Y up, facing +Z.
- **Skeleton:** the common auto-rig humanoid template (`mixamorig:Hips` …) or plain bone
  names. Put a `root` bone on the ground between the feet above the hips; the import step adds
  one if your export has none. Keep it near 40 bones. Fingers and a few accessory bones are
  fine, but core can't skin more than 64 joints.
- **Mesh:** 4,000-8,000 triangles, at most 4 influences per vertex. Name the mesh nodes `body`,
  `head` and `visor` where you have them.
- **Materials:** the base, an optional `accent` material that the world recolours per area,
  and an optional emissive material for a visor or eyes. A single baked material is fine too;
  colour variants are then separate characters. Textures are scaled to 1024 px.
- **Mechanical props:** a drone or a turning ring needs no skeleton. Use format 0.8 node
  animation (spin, orbit) for its parts.

## Animate it

All clips go in the same file at 30 fps, **in place**: no root motion. Core moves the
character along its route and plays `walk` at the speed the clip was made for (measured
from the planted foot), so it never slides.

| Clip | | Notes |
| --- | --- | --- |
| `idle` | required | loops; calm, little arm motion: the character spends most of its time in it |
| `idle_fidget` | optional | a busier idle, played through once now and then when the player is near |
| `walk` | required | loops; 0.7-1.4 m/s (stylised characters walk slower than people); set `extras.speed` (m/s) or let the import step measure it |
| `run` | optional | loops |
| `turn_left`, `turn_right` | optional | 90 deg on the spot |
| `look_around`, `wave`, `nod` | optional | |
| `sit`, `sit_idle` | optional | `sit_idle` loops; the character sits at seat stops and permanent seats ([seats](#seats)) |

Characters that share the same skeleton template can share clips (`--clips-from`).

### Shared clips (motion packs)

A character on the Mixamo-style skeleton (`mixamo-v1`: the humanoid `Hips`, `Spine`, `Head`,
arm and leg bones, any `mixamorig:` prefix) also plays the clips of every installed **motion
pack** it lacks, retargeted to its body by core when it loads ([RFC-0010 shared clip
library](/rfcs/0010-npcs/#amendment-shared-clip-library), core 0.10.0 and IPC 0.28). Its own clips always win, so a character only needs `idle` and `walk`; the starter
kit's `starter-motion` pack adds styled walks, runs and idles, `wave`, `sit`, `sit_idle`,
`stand` and talk reactions. Packs come from the world package (`motion/<id>/`), installed
libraries and `$XDG_DATA_HOME/hyprune/motion/<id>/`.

Styled clips are named `<role>_<style>` (`walk_confident`, `idle_calm`, `dance_shimmy`):
users pick a walk, run and idle style for their characters and their companion in the
Director, and a companion with `dance_*` clips offers Dance in its E menu.

To make a pack from your own rigged exports (worlds repository):

```sh
node tools/gltf/motion-pack.mjs pack-spec.json motion/my-moves --rig a=export.glb
hyprune motion check motion/my-moves
hyprune-npc-check my-character.glb --motion motion/my-moves   # the clips it gains, speeds, foot slip
```

The spec names each clip's source animation, its public name, role and style, and optional
`trim` and `hold` (a seated idle from the held end of a sit-down). Clips come out in place at
30 fps; a walk's or run's speed is measured from its planted feet.

## Import and check

```
tools/npc-import my-character/export.glb build/my-character.glb --render build/
hyprune-npc-check build/my-character.glb
```

`tools/npc-import` (worlds repository, runs Blender on the bake host) does the following:

- fixes units and axes and adds `root`;
- keeps the clips in place;
- renames clips through a mapping file (it can pick the calmest of several idles as `idle`
  and map a livelier one to `idle_fidget`);
- limits weights, decimates and compresses;
- with `--render`, renders a check video: a turntable, then the walk over a floor that
  scrolls at the walk speed. Planted feet should move with the tiles.

It needs a `PROVENANCE` note next to the source with these fields:

- `Source:`
- `Author:`
- `Licence:` (CC-BY-4.0 or CC0)
- `Animations:` (where the clips came from)
- `Resemblance check:` a statement that the design resembles no third-party or game
  character.

`hyprune-npc-check` reports errors (core won't load the character), warnings and notes. It
exits 1 on errors. `--against base.glb` checks that a variant shares the base's skeleton, and
`--json` produces machine-readable output.

## Put it in a world (format 0.9)

A world references a character like any other object asset and places instances of it.
The schema repository's [`examples/world-npcs.json`](/schema/examples/world-npcs.json) is a
complete synthetic manifest; the excerpt below follows it.

```json
{
  "formatVersion": "0.9",
  "objectAssets": [
    {"id": "resident", "dir": "characters/resident-blue"},
    {"id": "porter", "library": "com.hyprune.starter@0.1.0", "object": "porter"},
    {"id": "court-bench", "scene": "objects/bench.glb", "collision": {"node": "proxy"},
     "traits": {"movable": {}, "seat": {"capacity": 2, "anchors": [
       {"id": "left", "position": [-0.4, 0, 0.55], "yaw": 0, "height": 0.45},
       {"id": "right", "position": [0.4, 0, 0.55], "yaw": 0, "height": 0.45}]}}}
  ],
  "objects": [
    {"id": "bench-east", "asset": "court-bench", "locked": true,
     "pose": {"position": [3.6, 0, -2], "rotation": [0, -0.7071068, 0, 0.7071068]}},
    {"id": "porter-1", "asset": "porter", "path": "court-loop", "phase": 0.25, "speed": 1,
     "accent": [0.9, 0.5, 0.1],
     "interactions": [
       {"id": "talk", "label": "Talk", "action": {"type": "say",
        "lines": ["The desk is on the north side.", "Mind the fountain."]}},
       {"id": "where", "label": "Where is work?", "prompt": "Mark it",
        "action": {"type": "waypoint", "target": {"zoneId": "work"}}},
       {"id": "show-desk", "label": "Show me the desk", "prompt": "Follow me",
        "action": {"type": "guide", "path": "to-desk"}},
       {"id": "map", "label": "Open the map", "action": {"type": "panel", "panel": "map"}}]},
    {"id": "reader", "asset": "resident", "seat": "fountain-ledge",
     "pose": {"position": [1.5, 0, 1.8], "rotation": [0, 1, 0, 0]}}
  ],
  "paths": [
    {"id": "court-loop", "name": "Court loop", "use": "route", "closed": true, "speed": 1.1,
     "points": [{"position": [-3.5, 0, 3], "type": "line"}, {"position": [-3.5, 0, -2], "type": "line"},
                {"position": [3, 0, -2], "type": "curve"}, {"position": [3, 0, 3], "type": "arc"}],
     "stops": [{"point": 1, "seconds": 3, "clip": "look_around"},
               {"point": 2, "seconds": 20, "seat": "bench-east/left"},
               {"point": 3, "seconds": 4, "face": {"anchor": "desk"}}]},
    {"id": "to-desk", "name": "To the desk", "use": "route",
     "points": [{"position": [0, 0, 3], "type": "line"}, {"position": [0, 0, -2], "type": "line"}]}
  ],
  "seats": [
    {"id": "fountain-ledge", "height": 0.5, "use": ["sit"], "approach": 0.6,
     "pose": {"position": [1.5, 0, 1.2], "rotation": [0, 1, 0, 0]}}
  ],
  "keepClear": [
    {"id": "north-door", "min": [-0.8, 0, -4.2], "max": [0.8, 2.4, -3.6]}
  ]
}
```

### Assets

`objectAssets[]` entries have exactly one source:

- **`dir`**: a directory inside the package holding the character's `object.json` and glTF
  (the output of `tools/object-import --character`). Its `formatVersion` must be at most the
  world's.
- **`library`** + **`object`**: an object of an installed library, pinned to an exact
  `id@version`. A world whose library is not installed fails to load
  (`world.library.missing`) and the previous world stays.
- **`scene`** (inline): a package glTF with its `traits` written in `world.json`, as in an
  `object.json`.

### Instances

An `objects[]` entry of a character asset is an NPC:

- **On a route:** `path` names a `paths[]` entry with `"use": "route"` and replaces `pose`.
  `phase` (0 to under 1) is where along the route it starts, so several characters can share
  one route out of step (at most 8 per route); `reverse: true` walks it the other way.
- **On a standing spot:** `pose` is the spot. Add `seat` (a `seats[]` id, `<objectId>/<anchorId>`
  or `<objectId>` for any free anchor) to have it sit there permanently.
- `speed` scales its pace and clip rate together (feet stay planted); `accent` (linear RGB
  0-1) recolours the `accent` material; `scale` must be 1.
- `interactions` (1-8) replace the asset's own list: `say` (up to 8 caption lines), `waypoint`
  (a zone, position, anchor or object), `guide` (the character walks a route ahead of the
  player and comes back) and `panel` (opens the Director on a panel such as `map`). `travel`
  and `quest` are reserved and rejected in 0.9.

A world holds at most 16 character instances (users can spawn 8 more).

### Paths and stops

`paths[]` hold up to 64 paths and 1,024 points in total. A point's `type` (`line`, `curve`,
`arc`) is the segment that arrives at it. Characters only walk `route` paths. A stop pauses
at a point index for `seconds` (default 3) and does at most one thing: play a `clip`
(`look_around`, `wave`, `nod`, `idle_fidget`), `face` a position, anchor or object, or sit
on a `seat`.

Routes must be walkable: every 0.25 m there must be floor within 0.35 m of the last step,
the character's capsule must be clear of collision and inside the playable volume, and no
segment may cross the free space in front of a screen. Core suspends the characters of an
unwalkable route where they stand, and `hyprune-world-check` reports each problem with its
position.

### Seats

Seats are anchors on a `seat` object (asset space, moving with the object) or world-space
`seats[]` for benches that are part of the scene. A seat's `pose` (or an anchor's `position`
and `yaw`) is where the character's root stands at the start of `sit`, in front of the seat
and facing away from it; `height` (0.2-1 m) is the seat surface above that point;
`approach` (default 0.6 m) is the free floor in front.

Core lifts the seated character by the seat's height minus the height the `sit` clip was
made for (`clips.sit.seatHeight`, or measured from the clip), and uses the seat only when
the feet then end between 25 cm below and 45 cm above the floor; otherwise the stop is a
plain stop. A seat lower than the character's own seat height (by up to 25 cm) is taken by
seat adaptation: the hips sit lower and both legs bend more, with a two-bone solve that keeps
each foot on the floor (a little forward) and flat, so a tall character sits on a low bench
(core 0.10.1 and later; older cores refuse a seat more than 3 cm too low). `hyprune-npc-check` prints the clip's measured seat height and how far its ankles
sink.

**The starter kit residents** (objects 1.1.0, starter kit 0.3.0) have no sit of their own:
they take `sit`, `sit_idle` and `stand` from the kit's `starter-motion` pack, an upright sit
for ordinary benches (measured seats 0.24-0.36 m, no ankle sink; they sit on 0.40 m benches
with the root lifted 0-0.16 m). On a core without motion packs they don't sit. The residents
of starter kit 0.2.0 and earlier have a sit clip made for a very low seat (a seat height of
about -0.06 m, the ankles 0.08-0.13 m below standing): on a 0.45 m bench their feet dangle
about 0.4 m above the floor.

### Keep clear

`keepClear[]` boxes (`min`, `max` in world space) mark doorways, stairs and narrow passages.
Placed objects may not block them, and route stops and seat approaches must lie outside
them; a route may pass through.

### Check it

```sh
npx hyprune-validate world world.json - 0.9
```

The validator checks references (assets, routes, seats, anchors, zones), character-only
fields and the limits. Give it the `object.json` of `dir` and `library` assets to check
their traits too: `validate('world', manifest, undefined, '0.9', {assets: {resident:
objectJson}})`. `hyprune-world-check` adds what needs the scene: walkability, seat
reachability, stops outside keep-clear boxes and the navigation mesh.
