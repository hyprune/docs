---
title: "NPC characters"
description: "How to make an ambient character for a Hyprune world: the rig, the clips and the checks."
---

Ambient characters are a draft feature ([RFC-0010](/rfcs/0010-npcs/)): worlds can't place
them yet, but you can make and check characters now.

## Make the character

- **Size and axes:** a humanoid about 1.6-1.9 m tall, in metres, +Y up, facing +Z.
- **Skeleton:** the common auto-rig humanoid template (`mixamorig:Hips` …) or plain bone
  names. Put a `root` bone on the ground between the feet above the hips; the import step adds
  one if your export has none. Keep it near 40 bones. Fingers and a few accessory bones are
  fine, but core can't skin more than 64 joints.
- **Mesh:** 4,000-8,000 triangles, at most 4 influences per vertex. Name the mesh nodes `body`,
  `head` and `visor` where you have them.
- **Materials:** the base, an optional `accent` material that the world recolours per area,
  and an optional emissive material for a visor or eyes. Textures are scaled to 1024 px.
- **Mechanical props:** a drone or a turning ring needs no skeleton. Use format 0.8 node
  animation (spin, orbit) for its parts.

## Animate it

All clips go in the same file at 30 fps, **in place**: no root motion. Core moves the
character along its route and plays `walk` at the speed the clip was made for.

| Clip | | Notes |
| --- | --- | --- |
| `idle` | required | loops |
| `walk` | required | loops; about 1.2-1.4 m/s; set `extras.speed` (m/s) or let the import step measure it |
| `run` | optional | loops |
| `turn_left`, `turn_right` | optional | 90 deg on the spot |
| `look_around`, `wave`, `nod` | optional | |
| `sit`, `sit_idle` | optional | `sit_idle` loops |

Characters that share the same skeleton template can share clips (`--clips-from`).

## Import and check

```
tools/npc-import my-character/export.glb build/my-character.glb --render build/
hyprune-npc-check build/my-character.glb
```

`tools/npc-import` (worlds repository, runs Blender on the bake host) does the following:

- fixes units and axes and adds `root`;
- keeps the clips in place;
- renames clips through a mapping file;
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
