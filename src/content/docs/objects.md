---
title: "Objects for authors"
description: "How to make and check a Hyprune world object: the object directory, its manifest, the import and check tools, libraries, licensing and provenance."
---

World objects are a draft feature ([RFC-0011](/rfcs/0011-objects/)). Worlds can already place
object glTFs as format 0.8 `objectAssets`; the catalog, user placement and libraries come with
core's first objects release. The object manifest and its checks are ready now, so objects
made today are catalog-ready.

## The object directory

An object is a directory: a manifest next to its glTF. The same layout is used in world
packages, in libraries and in a user's object folder.

```text
street-lamp/
  object.json
  object.gltf        # plus object.bin and textures, or a single object.glb
  thumbnail.png      # 256 x 256, optional
```

```json
{
  "formatVersion": "0.9",
  "id": "street-lamp",
  "version": "1.0.0",
  "name": "Street lamp",
  "category": "lighting",
  "tags": ["lamp", "street"],
  "scene": "object.gltf",
  "license": "CC-BY-4.0",
  "attribution": [{"path": ".", "author": "Your Name", "license": "CC-BY-4.0", "source": "https://example.com/street-lamp"}],
  "bounds": {"min": [-0.25, 0, -0.25], "max": [0.25, 2.4, 0.25]},
  "thumbnail": "thumbnail.png",
  "traits": {
    "collidable": {"node": "proxy"},
    "movable": {"surfaces": ["floor"], "scale": [0.75, 1.5]}
  }
}
```

- **`id`** is a slug and equals the directory name. **`version`** is SemVer.
- **`formatVersion`** follows the world format numbering: `0.9` is the first object format,
  and a world may use objects whose format is at most its own. `0.10` (movers, items and
  [RFC-0013](/rfcs/0013-live-objects/) machines) is a draft.
- **`bounds`** is the rest-pose box in metres. Don't type it: the import tool measures it,
  and the check rejects a box more than 1 cm off the geometry.
- **`category`** is one of `furniture`, `lighting`, `plants`, `signage`, `machines`,
  `decor`, `characters`, `vehicles` or `other`; at most 8 `tags`.

### Axes, origin and names

- Metres, +Y up, the front faces +Z (glTF axes).
- The origin is where the object touches its support: the base centre for floor objects
  (bounds min Y = 0), the back centre for wall objects (min Z = 0, the back against the
  wall), the top centre for ceiling objects (max Y = 0), the feet for characters. Objects
  that may float (`surfaces: ["any"]`) can put it anywhere.
- Every node or material the manifest names (an animated part, the collision proxy, a
  state lamp) must have a unique glTF name.
- A collision proxy is a simple mesh. Keep it out of the glTF scene's node list, so it is
  never drawn.

### Traits

| Trait | Data | Gives |
| --- | --- | --- |
| `decorative` | `animations`: up to 16 node animations (`spin`, `orbit`, `bob`) | Moving parts, paused off-screen and in reduced motion |
| `collidable` | `node`: the collision proxy | Static collision; the placement rules keep it out of walls and doorways |
| `movable` | `surfaces` (`floor`, `wall`, `ceiling`, `any`), `upright`, `scale` range | Offered in the catalog: users place, carry, scale and pocket it |
| `character` | measured `clips`, `height`, `radius` | An ambient character ([NPC characters](/npc-characters/)) |
| `seat` | 1-8 seat `anchors` | Characters sit there |

`decorative`, `collidable`, `movable` and `seat` combine freely; a character combines with
nothing. `mover`, `machine`, `mount` and `interactive` are reserved and rejected in `0.9`.
`slots` (state palettes, labels, spawn and effect points) name the parts that live data will
drive (RFC-0013); in `0.9` they are checked and otherwise inert.

### Budgets

| Limit | Value |
| --- | --- |
| Triangles | 50,000 (characters 16,000, items 2,000) |
| Texture size | 2,048 px (characters 1,024) |
| GPU memory | 48 MiB (items 1 MiB) |
| Collision proxy | 2,000 triangles |
| Directory | 64 files, 64 MiB, 32 MiB per file |
| Thumbnail | 256 x 256 PNG, at most 256 KiB |

These are the provisional numbers of RFC-0011. Core will check them when it loads an
object; it never resizes or converts anything itself, so fix an object with the import tool.

## Make an object

The worlds repository's import tool turns any glTF or GLB into an object directory. It runs
Blender on a bake host (`HYPRUNE_BAKE_HOST`).

```sh
tools/object-import src/street-lamp/lamp.glb objects/street-lamp \
  --name "Street lamp" --category lighting --surface floor --collision box
```

It decodes the source, fixes units (`--units cm`), axes (`--up`, `--forward`) and the origin
for the support surface, decimates to the triangle budget (`--max-tris`), scales textures
(`--max-texture`), adds a box or convex collision proxy, compresses geometry (meshopt) and
textures (KTX2), renders the thumbnail, measures the bounds, writes `object.json` and runs
the check. Traits and slots you wrote by hand go in a partial manifest passed with
`--base`; the tool keeps them and checks their names against the new glTF.

- **Characters:** `--character` runs the NPC import (`tools/npc-import`) and records the
  measured clips, walk and run speeds, height and seat height in the `character` trait.
- **Objects built by a script:** build the glTF yourself, then
  `tools/object-import --adopt DIR --name ...` adds the thumbnail and the manifest and checks
  the directory.
- **Items** for tracks (format `0.10`): `--item` caps them at 2,000 triangles and 512 px.

## Check an object

```sh
tools/object-check objects/street-lamp           # worlds repository
hyprune object check objects/street-lamp         # @hyprune/sdk
npx hyprune-validate object object.json - 0.9 object.gltf   # @hyprune/schema, manifest and glTF only
```

All three run the same validator from `@hyprune/schema`. A full check covers the manifest
and trait rules, the glTF extension rules of the object's format, node, material and
material-variant names, character clips and their measured speeds, bounds within 1 cm,
the budgets above, the thumbnail, links and executable files, and that the attribution
covers every file. `tools/object-check` decodes the geometry for the exact bounds and lists
build sources kept beside an object (`build.py`, `PROVENANCE`, `README.md`) as ignored; the
SDK checks a directory exactly as it ships, so it rejects them, and also runs the Khronos
glTF validator.

## Licensing and provenance

Every object states its rights in the manifest:

- **`license`** is an SPDX expression for the whole object.
- **`attribution`** lists who made which files: `{"path", "author", "license", "source"}`,
  where `path: "."` is the whole directory and a narrower path overrides it. Every file
  must be covered.
- **Official objects** (the worlds repository and official libraries) are original work,
  CC0-1.0 or CC-BY-4.0, with provenance. No third-party art, models, textures, sounds,
  marks, logos or names; no imitation of a recognisable character or product.
- **Your own objects** in your user folder may use any licence, including
  `LicenseRef-...` for private work; they stay on your machine.

The import tool refuses a source without a `PROVENANCE` note beside it
(`PROVENANCE`, `PROVENANCE.md` or `<name>.PROVENANCE.md`):

```text
Source: modelled in Blender from my own sketches
Author: Your Name
Licence: CC-BY-4.0
```

Characters also need `Animations:` (where the clips come from) and
`Resemblance check:` (a person's statement that the design resembles no third-party
character). If a tool generated the model or the clips, say so in `Source:`; you need the
rights to its output. When you change someone else's CC-BY work, keep their attribution
and describe the change (an `ATTRIBUTION.md` beside the objects is a good place).

## Libraries

A library publishes a set of objects with one manifest:

```text
com.example.street/
  library.json        # {"formatVersion", "id", "version", "name", "license", "attribution", "objects": [...]}
  LICENSE
  ATTRIBUTION.md
  objects/street-lamp/ ...
```

Its `id` is reverse-domain like a world id, and its `formatVersion` is at least that of
every object it lists. In the worlds repository `tools/library-pack NAME --dry-run` builds a
library from `libraries/NAME.json`: it checks each object and the library, writes a
reproducible `<id>-<version>.tar.zst` and the record that pins it in the meta repository's
`libraries/releases.json` (`url`, `sha256`, `nixHash`). Publishing is a reviewed release
step, like a world's. Worlds reference library objects by exact `id@version`, and installers
verify the archive's hash before unpacking it; core never downloads anything.

## Use it in a world today

Until worlds can reference object directories (world format 0.9), copy the glTF into the
package and add a format 0.8 `objectAssets` entry: `scene` (package-relative), `animations`
from `traits.decorative`, `collision` from `traits.collidable` and `lighting`.
