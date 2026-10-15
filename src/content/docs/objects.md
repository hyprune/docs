---
title: "Objects for authors"
description: "How to make and check a Hyprune world object: the object directory, its manifest, the import and check tools, libraries, licensing and provenance."
---

World objects follow [RFC-0011](/rfcs/0011-objects/). Core's object catalog (IPC 0.22; characters, paths and interactions IPC 0.23) lists a
world's own objects, installed libraries and your object folder
(`~/.local/share/hyprune/objects/`). The Director's Objects tab adds one to the pocket, tool 5
places it and the gizmo adjusts it; placements are saved per world. The first official library,
the **Hyprune starter kit**, is published (see [Libraries](#libraries)).

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

The official **Hyprune starter kit** (`com.hyprune.starter` 0.3.0, object format 0.11) holds the
Sun Court armillary, four ambient residents, five live machines with their job token, three
gauges (tube, abacus, voxel cube), four workspace screens (a wall bezel and a stand, each at
16:9 and 21:9) and the `starter-motion` pack of shared clips, under CC-BY-4.0. It is a GitHub
release on hyprune/worlds (`hyprune-starter-v0.3.0`); install it from the Director's Objects
tab or with `libraries.install`. The residents are characters: spawn them from the Objects tab
or reference them from a world 0.9 package ([NPC characters](/npc-characters/)); placed
machines and gauges read live data from a source of yours ([Wire a script to a
gauge](#wire-a-script-to-a-gauge)); a placed screen shows the next free workspace (or the one
you pick) and becomes its home. The screens need core 0.9.0 or later, the shared clips core
0.10.0.

The optional **Hyprune companions** library (`com.hyprune.companions` 0.1.0, release
`hyprune-companions-v0.1.0`, CC-BY-4.0) holds three original companions, Muse, Ember and
Starlit, with their own `companion-moves` pack of fourteen dances. It is not preinstalled:
install it from the registry or with `libraries.install`, then pick one in Director → Objects →
Characters. The dances need core 0.10.0.

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

## Place it in a world

With IPC 0.22 core lists objects from three places in one catalog: the loaded world's
object assets, installed libraries (`$XDG_DATA_HOME/hyprune/libraries/<id>@<version>/`) and
your own folder (`$XDG_DATA_HOME/hyprune/objects/<id>/`). Core applies the same checks as
`hyprune object check` and shows each entry's triangles and GPU estimate, so the numbers
match.

- **Your folder:** `hyprune object add ./street-lamp` checks a directory (or writes a minimal
  `object.json` for a bare `.glb` from `--name`, `--license`, `--author` and `--surface`) and
  copies it in. Core watches the folder and lists the object after a one-second pause; an
  invalid one appears with its errors.
- **A library:** `hyprune library install ./com.example.street-1.2.0.tar.zst` (or an
  `id@version` with a releases record next to the archive) hands core a local archive and its
  hash; core checks and unpacks it.
- **Placing:** the Director's **Objects** tab lists the catalog. **Add** puts an object in
  your pocket and selects tool 5: a ghost shows where it would go (green, or red with the
  reason), Primary places it ahead on the floor, Secondary on the surface you aim at. Tool 4
  and the Super gestures move, turn and scale it afterwards; the configure panel locks,
  resets or removes it. Placements are yours, per world, and never change the package.

Only objects with the `movable` trait can be placed. Characters are spawned instead (IPC
0.23): they walk a listed route, a route you draw with tool 3, or stand on a spot in front of
you, and they can't be carried, scaled or pocketed. Movers wait for tracks (P3); the catalog
says why an entry can't be placed.

## Wire a script to a gauge

Machines ([RFC-0013](/rfcs/0013-live-objects/), draft) show live data. The starter kit's
gauges show one number from 0 to 100 as a fill, a halo ring at its running average and a
label. Every placed machine reads its inputs from a data source named after its instance ID,
and the Director sets that source up for you: a script, an interval, a test run and Save.

1. **Write a script** that prints one JSON object, for example `~/bin/ram-gauge`:

   ```sh
   #!/bin/sh
   used=$(free | awk '/^Mem:/ {printf "%d", $3 * 100 / $2}')
   printf '{"value": %s, "display": "%s%%", "label": "RAM"}\n' "$used" "$used"
   ```

   It prints `{"value": 71, "display": "71%", "label": "RAM"}`. Each key feeds the gauge
   input of the same name: `value` (number 0–100), `display` (text, up to 12 characters),
   `label` (text, up to 16 characters), optionally `level` (`ok`, `warn` or `fail`: the
   fill's colour) and `average` (0–100, see below). Make the script executable.
2. **Place a gauge.** In the Director's **Objects** tab pick a gauge from the catalog;
   **Add** puts it in your pocket and selects tool 5, and Primary places it.
3. **Open its data source.** Director → Objects → **Placed**, select the gauge. Its configure
   panel shows `ID u-3f9a1c` (`u-` and 6 hex digits) and a **Data source** section listing the
   gauge's inputs with their live values.
4. **Choose the command.** Pick the script with **Choose…** (or type its path), add any
   arguments one per line, and set the **interval** (at least 5 seconds). The panel shows the
   exact command that will run; it runs without a shell.
5. **Test** runs it once and shows what it printed, checked against the gauge's inputs:
   unknown keys, values of the wrong type and missing inputs are flagged. Nothing is
   published yet.
6. **Save.** The source helper starts the command at once and publishes its output as source
   `com.hyprune.sources.<id>`, which is exactly the source the gauge reads by default. The
   gauge fills within one interval; the section shows each input's value, its age and the
   source's last run or error.

**Restart** runs the command again now; tick **Reset average** first to start the halo
ring's average over. **Restart helper** restarts every source and reconnects to core, and
**Remove** deletes the gauge's source. If the script fails or stops, the gauge keeps its last
reading and turns grey, and the section shows the error.

A ready-made script for system load ships with core: `dev/machines/scripts/system-gauges.py`
takes one argument, `cpu`, `ram`, `gpu` or `vram`, and prints the gauge's keys: choose it as
the command and enter `cpu` as its argument.

**The running average.** The halo ring sits at the running average of `value` over the last
60 seconds. A script that computes its own average sends it as `average`; while that key is
present it replaces the computed one.

### Feed a gauge from a web API

Director → Objects → **Data sources** lists every source and edits HTTP ones too. To show,
say, the worst queue lag of an API on a gauge:

1. **New HTTP.** Give it the gauge's ID (`u-3f9a1c`) as its **Id**, so the gauge reads it, and
   the **URL**. For a token, add a header `Authorization` with prefix `Bearer ` and a **secret
   name** (`ingest-token`); `{secret:name}` also works inside the URL or the body.
2. **The map.** **Value** is a path into the response: `$.items[*].lag` with **Maximum**
   picks the largest lag; **Scale** `0 … 60` makes 60 s a full gauge. **Level** thresholds
   colour it (`warn at 50`, `fail at 90`, on the 0–100 value; "Low is bad" flips them), or
   **Match text** maps a status text (`degraded=warn, down=fail`). **Display** is a template
   (`{raw:d} s behind`), **Label** text or a path (`$.name`).
3. **Test** shows the raw response beside what would publish and a preview of the gauge. A
   secret it names but can't find shows as missing: paste its value and **Store in file**
   (`~/.config/hyprune/secrets.json`, mode 0600) or **Keyring** (needs `secret-tool`). The
   value never goes into `sources.json`.
4. **Save.** The helper polls it (HTTP at least every 10 s; 2 s for this machine) and the gauge
   follows.

Paths: `$.a.b`, `$.items[0]`, `$.items[-1]`, `$.items[*].lag`, `$..name` (at any depth),
`$.jobs[?(@.status == 'queued')]` (with **Count**). A command source takes the same map: with
output **Number**, `{value}` is the number it printed.

### Advanced: the configuration files

The Director edits files you can also write by hand; the source helper and core re-read them
when they change.

- **Sources.** `$XDG_CONFIG_HOME/hyprune/sources.json` (usually
  `~/.config/hyprune/sources.json`) holds one entry per source; a gauge's source uses the
  gauge's ID as its `id`:

  ```json
  {"sources": [{"id": "u-3f9a1c", "kind": "command", "argv": ["/home/you/bin/ram-gauge"], "intervalS": 5}]}
  ```

  `argv` runs without a shell; `intervalS` is at least 5 seconds. Saving in the Director
  updates only the keys it edits and keeps everything else in the file (other entries and
  keys such as `env` or `ttlMs`). HTTP sources, secrets and the `map` are described in the
  source helper's README (`dev/machines/README.md` in core) and
  [RFC-0013](/rfcs/0013-live-objects/#amendment-data-sources-phase-2-helper-and-shell). For example, a CPU gauge on the
  bundled script is
  `{"id": "u-7c21e0", "kind": "command", "argv": ["/path/to/core/dev/machines/scripts/system-gauges.py", "cpu"], "intervalS": 5}`.
- **Bindings.** `$XDG_CONFIG_HOME/hyprune/machines.json` changes what a placed machine reads.
  `averageWindowS` sets the window of one gauge's running average, and the same entry can
  point its inputs at another source or other keys
  ([Default bindings](/rfcs/0013-live-objects/#default-bindings)):

  ```json
  {"instances": {"u-3f9a1c": {"averageWindowS": 300}}}
  ```

## Use it in a world

World format 0.9 references objects directly in `objectAssets[]`, with exactly one source
each:

```json
"objectAssets": [
  {"id": "lamp", "dir": "objects/street-lamp"},
  {"id": "lantern", "library": "com.example.street@1.2.0", "object": "street-lantern"},
  {"id": "buoy", "scene": "objects/buoy.glb", "traits": {"decorative": {"animations": [
    {"node": "buoy", "type": "bob", "axis": [0, 1, 0], "amplitude": 0.05, "period": 4}]}}}
]
```

- **`dir`**: an object directory inside the package, `object.json` and all; its
  `formatVersion` must be at most the world's.
- **`library`** + **`object`**: an object of an installed library at the exact `id@version`.
  A world whose library is missing doesn't load (`world.library.missing`).
- **`scene`**: an inline glTF with optional `traits` and `slots` written in `world.json`. The
  0.8 `animations` and `collision` fields still work as shorthand for the `decorative` and
  `collidable` traits; don't give both forms.

`objects[]` instances of a `movable` asset can be rearranged by users unless they set
`"locked": true`. Characters, paths, seats and keep-clear boxes are on the
[NPC characters](/npc-characters/#put-it-in-a-world-format-09) page; the format is
[RFC-0004's world 0.9 amendment](/rfcs/0004-world-format/#amendment-world-09-characters-paths-seats-and-keepclear).

A world on format 0.8 can't reference object directories: copy the glTF into the package and
add a format 0.8 `objectAssets` entry: `scene` (package-relative), `animations` from
`traits.decorative`, `collision` from `traits.collidable` and `lighting`.
