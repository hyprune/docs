---
title: "RFC-0014 — In-world builder: importing objects and making worlds"
description: "Import models inside Hyprune through a sandboxed converter, manage and repair user objects, and turn an imported scene into a world package in an official builder world with a guided checklist."
---

**Status: draft · proposed 2026-10-12.** Nothing here is implemented. It builds on the object
catalog, user folder, placements and placement rules of [RFC-0011](/rfcs/0011-objects/) as
shipped in [IPC 0.22](/rfcs/0011-objects/#amendment-p1-in-ipc-022), the world format of
[RFC-0004](/rfcs/0004-world-format/) (spawns, areas and workspace homes, playable volumes,
derived visibility, placed objects), the workspace homes of [RFC-0005](/rfcs/0005-surfaces/),
the tools and gizmo of [RFC-0006](/rfcs/0006-interaction/), the process and sandbox model of
[RFC-0007](/rfcs/0007-extensions/), the Director of [RFC-0008](/rfcs/0008-shell/) and the
markers and tracker of [RFC-0012](/rfcs/0012-quests/). It switches on RFC-0011's reserved
`mount` trait for one purpose: empty workspace screens that become homes.

## Goal

A user can bring their own models into Hyprune without leaving it, and can turn a whole scene
into a world they can live in:

- **Import inside Hyprune.** Director → Objects → **Import…** opens the desktop's file dialog.
  Hyprune converts the file out of process, shows what it found, and puts the result in the
  user folder, ready to place. The same tab renames, re-tags, re-checks, deletes and
  **repairs** objects.
- **Make a world from a scene.** A downloaded CC-licensed level scene is too big to place in
  an existing world. It goes into the **builder world**, an official open plain. There the
  user aligns and locks the scene, sets a spawn, places at least two empty workspace screens,
  and presses **Make world**. Hyprune writes a world package with collision, a walkable floor,
  playable volumes, derived visibility and workspace homes, and the user can load it like any
  other world.
- **Approachable.** A checklist in the HUD, shaped like a quest, says what is missing and shows
  where the problem is. Every failure is a checklist item, never a log.
- **Users own what they make.** Imports record source, author and licence (or "unknown"),
  and made worlds and exports carry that record. Hyprune shows it and never enforces it: no
  licence blocks an import, a world or an export. Only publishing to the official hyprune org
  checks it.

Non-goals: modelling or sculpting tools, terrain editing, lightmap baking on the user's
machine, scripted behaviour, network fetches of any kind, and editing an installed package.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Import | Turning a user-chosen file into an object directory in the user folder, through an import job. |
| Import helper | `hyprune-import`, the bundled converter. It runs as a sandboxed child of the daemon, never in the compositor. |
| Job | A long-running daemon task with progress: `import`, `check` or `make-world`. |
| Size class | `object` or `map`, measured at import (below). |
| Map | An object of the `map` class: a whole scene. Placeable only in a builder world. |
| Builder world | A world package that carries the `com.hyprune.builder` extension. The official one is the open plain `com.hyprune.builder`. |
| Session | One builder project: maps, screens, markers, objects, sky and checklist state. |
| Workspace screen | An object with a `mount` trait whose anchor has the `mounted-workspace` role: an empty frame that becomes a workspace home. |
| Lock | Freezing a map's pose; a locked map gets collision and becomes walkable. |
| Make world | The job that writes a world package from a session. |
| Repair | Resetting a broken object entry, per-world overlay or setting to a known-good state, with a backup. |

## Importing objects

### Flow

1. **Director → Objects → Import….** The shell opens the xdg-desktop-portal
   `org.freedesktop.portal.FileChooser` (`OpenFile`, filters below, one file). Core never opens
   a dialog. The CLI equivalent is `hyprune object import PATH`.
2. The shell calls `objects.import {source: {path}}` with the path the portal returned. The
   daemon copies the file (and, for `.gltf`, the files it references) into a private staging
   directory and starts an `import` job. From here on, only the staged copy is read.
3. The import helper converts the staged copy into a candidate object directory, measures it,
   classifies it and renders a thumbnail. The job publishes progress by stage.
4. The job stops in **`review`**. The shell shows the review form: thumbnail, name, category,
   tags, surfaces, size class with the measured numbers against the budgets, warnings, and the
   provenance fields (source, author, licence; each may stay unknown). A licence text found in
   the source is shown, never applied silently.
5. **Add to my objects** (`objects.import.commit`) validates the candidate with the user's
   answers using the same checks as RFC-0011's user folder, and moves it into
   `$XDG_DATA_HOME/hyprune/objects/<id>/` atomically. **Change options** (`objects.import.revise`)
   reruns conversion with new options (reduce, units, up axis, lighting); **Discard** cancels.
6. The catalog lists the new entry after the user folder's usual quiet period. Its **Place**
   action works as in RFC-0011 (pocket, tool 5, gizmo). A `map` entry offers **Open in
   builder** instead.

Nothing is written to the user folder before step 5, and a failed or cancelled job leaves no
files behind. RFC-0011 forbids core from converting assets at load or on add; this RFC keeps
that rule. Conversion happens only in the helper, only as an explicit user action, and its
output passes the ordinary validation.

### Formats

| Input | Extensions | Conversion |
| --- | --- | --- |
| glTF 2.0 | `.glb`, `.gltf` with relative buffers and images | **Wrap.** Validate (Khronos glTF validator), keep geometry and materials, decode `KHR_draco_mesh_compression` to plain buffers, drop what the world format ignores (cameras, punctual lights, animations, skins: listed as warnings), fix the origin for the object's support surface, write `object.json`, render the thumbnail, compress where cheap. |
| Archive | `.zip` holding exactly one supported model at any depth | Extracted inside the sandbox with the RFC-0004 archive rules (no links, devices, absolute paths or traversal), then converted by its model's format. Licence and readme files in the archive are surfaced in the review. |
| FBX | `.fbx` (binary and ASCII, 7.x) | **Convert** through the helper's importer backend (Assimp) to glTF: units from the file's unit scale, axes from its axis system, embedded and relative textures, then as glTF. |
| OBJ | `.obj` with `.mtl` | Convert: MTL diffuse, normal (`map_Bump`/`norm`), roughness (`map_Pr`) and emission to metallic-roughness; `--units` and up-axis choice in the review, since OBJ declares neither. |
| COLLADA, PLY, STL, 3DS | `.dae`, `.ply`, `.stl`, `.3ds` | Convert through the same backend. PLY and STL get a neutral material. |
| Blender | `.blend` | Only with the optional Blender backend (`import.blender_backend`, off by default; Blender must be installed). Same sandbox and limits; scripts in the file never run (`--disable-autoexec`). |

Other inputs are refused with `import.unsupported`. glTF 1.0, USD and Alembic are open
questions.

**Compress where cheap.** Geometry is always meshopt-compressed (`EXT_meshopt_compression`,
16-bit positions, as the world format 0.7 rules ask): it is fast and lossless at those
tolerances. Colour textures larger than 1024 px are encoded to KTX2 (Basis ETC1S, full mip
chain) while the job's texture-encoding budget lasts (60 s for objects, 10 min for maps);
textures left over stay PNG or JPEG and the review says so. Normal and data textures stay PNG
unless the user asks for **Reduce**. JPEG sources are never re-encoded to JPEG. No step is
lossy without appearing in the review's step list.

**Lighting.** Many downloaded scenes have lighting painted into their textures. The review
offers **Lighting: lit (default) / baked into textures**; the second marks every material
`KHR_materials_unlit`. Imported content is never lightmapped (RFC-0004 0.8 objects aren't).

**Thumbnails** are rendered by the helper on the CPU (a software rasteriser in the sandbox, no
GPU device) from a fixed three-quarter view of the bounds: 256 × 256 PNG, at most 256 KiB, as
RFC-0011 requires.

### The import helper (normative)

The helper parses untrusted files with large third-party parsers, so it runs where a crash or
an exploit can do the least harm.

- **Out of process.** `hypruned` spawns the helper; the compositor plugin never parses a source
  format and never waits on the helper. Core reads only the helper's output, and treats it as
  untrusted: the output passes the full object validation before it is offered for review.
- **Sandbox.** The RFC-0007 first sandbox profile: user, mount, PID, IPC and network
  namespaces; the helper binary and its libraries read-only; the staged input read-only; one
  writable output directory; a private `/tmp`; no network; no host runtime directory, Wayland,
  D-Bus or `/dev/dri`; `no_new_privs`; seccomp denying ptrace, mount, kernel module, keyring
  and namespace calls. If these controls can't be enforced, imports of formats other than
  glTF and `.zip`-wrapped glTF are refused (`import.sandbox`); glTF still goes through the
  same validator-first path in an unprivileged child process.
- **Inputs.** The daemon resolves the portal path once, opens it without following a final
  symlink and copies it. A `.gltf`'s referenced files are copied only when they resolve
  beneath the `.gltf`'s directory without symlinks or `..`. Data URIs are decoded; remote URIs
  are refused.
- **Priority.** The helper runs at nice 10 with idle I/O priority and at most
  `import.max_threads` worker threads (default: half the logical CPUs, at most 8). On battery
  power, `map` conversions, checks and make-world ask before they start
  (`import.ask_on_battery`, default true).
- **Queue.** One job runs at a time; up to 8 wait. A queued job can be cancelled; a running
  one is cancelled with SIGTERM, then SIGKILL after 5 s. Staging and output are removed.

| Limit | Object import | Map import | Check | Make world |
| --- | --- | --- | --- | --- |
| Source size | 2 GiB (file or archive) | 2 GiB | — | — |
| Archive expanded | 4 GiB, 20,000 files | 4 GiB, 20,000 files | — | — |
| Address space (`RLIMIT_AS`) | 4 GiB | 12 GiB | 8 GiB | 12 GiB |
| Wall time | 5 min | 30 min | 15 min | 60 min |
| Output | the object directory limits | 1 GiB, 10,000 files, 128 MiB per file (RFC-0004 installer caps) | 256 MiB | 1 GiB, 10,000 files, 128 MiB per file |

A job over a limit fails with the limit's name (`import.limit.time`, `import.limit.memory`,
`import.limit.output`) and the stage it reached. A helper crash fails only that job.

### Size classes

The helper measures the converted result with the SDK's estimates (the same numbers
`hyprune object check` and the catalog show: PNG and JPEG at 4 B/px, KTX2 at 1 B/px, ×4/3 for
mips, plus every buffer). An import is an **object** when every object limit holds; it is a
**map** when any object limit is exceeded and every map limit holds. Above a map limit it is
**refused** unless **Reduce** brings it under.

| Measure | Object (RFC-0011 per-asset budgets) | Map | Map limit's reason |
| --- | --- | --- | --- |
| Triangles | ≤ 50,000 | ≤ 2,000,000 | Frustum-culled drawing in the builder on the reference Intel iGPU at 4K |
| Largest texture side | ≤ 2,048 px | ≤ 4,096 px | Larger textures are downscaled by Reduce |
| GPU memory | ≤ 48 MiB | ≤ 384 MiB | The 512 MiB world budget minus the builder plain, screens and a sky |
| Largest bounds extent | ≤ 32 m | ≤ 2,000 m | The builder plain |
| Collision proxy | ≤ 2,000 triangles, if any | generated at lock, ≤ 20,000 (the world collision budget) | RFC-0004 static collision budget |
| Nodes | ≤ 256 | ≤ 8,192 | Visibility node references |
| Materials | ≤ 64 | ≤ 1,024 | |
| Directory | 64 files, 64 MiB, 32 MiB per file | 10,000 files, 1 GiB, 128 MiB per file | RFC-0004 installer caps |

- The 32 m bound is new: RFC-0011's budgets don't limit size, and a light but huge model (a
  low-poly landscape) placed in a home would bury its screens. Objects keep every other
  RFC-0011 rule.
- **Treat as map.** The review can turn any object-class import into a map (a small room
  interior can become a world). A map can't be turned into an object; Reduce first.
- **Reduce** decimates (meshoptimizer simplification with a reported error), downscales
  textures and drops tiny disconnected parts below a size the user picks, to fit the class the
  user asks for. The review lists each step and its error.
- Map imports keep the scene's own origin (alignment happens in the builder) and split meshes
  larger than 32 m into grid chunks along existing material boundaries, so the builder can
  frustum-cull and make-world can derive visibility per chunk. Node names survive with a
  `#<n>` suffix per chunk.
- Skinned characters are out of scope here: the review points to RFC-0010's character import.

**Map entries.** The catalog lists maps with `class: "map"` and the measured numbers. They are
`placeable: false` with the reason `map.builder-only` in every world that is not a builder
world. The user folder's 256-object limit counts maps; maps have their own total of 16 GiB on
disk, shown in the Objects tab.

### What an import writes

The object directory is an RFC-0011 directory plus one known file, `import.json`, which
records how it was made. The shared validator accepts `import.json` beside `object.json`
(schema `import.schema.json`); it is covered by the `"."` attribution like every other file.

```text
harbour-plaza/
  object.json        # formatVersion "0.9"; map-class objects carry no traits
  object.glb
  thumbnail.png
  LICENSE            # copied from the source archive when present
  import.json
```

```json
{
  "importVersion": "0.1",
  "source": {"name": "harbour-plaza.zip", "format": "gltf", "bytes": 187654321,
             "sha256": "9f2c41d0…", "entry": "scene.gltf"},
  "converter": {"name": "hyprune-import", "version": "0.1.0", "backend": "gltf"},
  "options": {"units": "m", "up": "+y", "lighting": "baked", "reduce": null, "class": "map"},
  "class": "map",
  "measured": {"triangles": 1284112, "maxTexture": 4096, "gpuBytes": 301989888,
               "nodes": 412, "materials": 96,
               "bounds": {"min": [-104.2, -3.1, -88.0], "max": [107.9, 41.6, 93.5]}},
  "steps": ["validated", "draco decoded", "3 animations dropped", "chunked 18 meshes into 212",
            "meshopt", "ktx2 etc1s: 41 of 58 textures", "unlit materials"],
  "license": {"spdx": "CC-BY-4.0", "author": "A. Modeller",
              "source": "https://example.com/models/harbour-plaza", "detectedFrom": "license.txt"},
  "importedAt": "2026-10-12T14:03:11Z",
  "history": [],
  "original": "sha256:9f2c41d0…"
}
```

The original file is kept under `$XDG_DATA_HOME/hyprune/imports/<sha256>/` so the object can be
converted again with other options or repaired (`import.keep_originals`, default true, 8 GiB
cap, least recently used first). Deleting the object offers to delete its original.

### Licence and provenance (normative)

Users own what they make. Hyprune records licence and provenance, carries them along and shows
them; it does not judge them. The only place a licence is checked is the path into the official
hyprune org (below).

- **Record.** The review asks for `license` (an SPDX id from a short list: `CC0-1.0`,
  `CC-BY-4.0`, `CC-BY-3.0`, `CC-BY-SA-4.0`, `CC-BY-NC-4.0`, any other SPDX expression, or
  **I don't know**), `author` and `source` (a URL or a free-text origin such as "my own work").
  Every field may be left unknown. They become `object.json` `license` and an `attribution`
  entry for `"."`; an unknown licence is written as `LicenseRef-unknown` and an unknown author
  or source as `"unknown"`, and the UI shows all three as **unknown**.
- **Never block.** The review's Add button MUST NOT depend on these fields. No licence value,
  unknown or otherwise, may refuse or limit an import, an edit, a placement, a builder session,
  make-world or an export.
- **Suggest, don't decide.** A licence detected from files in the source is shown with its text
  as a suggestion; the user chooses. The helper never infers a licence from a file name alone.
- **Carry.** Make-world and every export write the recorded licences and attributions into the
  package metadata (`license`, `attribution[]`, `ATTRIBUTION.md`, the `LICENSE` texts found)
  unchanged, including unknown entries. Exports MUST NOT drop, merge away or rewrite
  attribution.
- **Show.** The catalog, the review, the Builder page and the make-world result show each
  entry's licence, author and source, and a world's provenance summary lists which parts are
  unknown.
- **Official publishing is the one check.** Content accepted into the official hyprune org
  must be CC0-1.0 or CC-BY-4.0 with a named author and source (the RFC-0004 rights policy).
  **Check for official publishing** (`publish.check`) reports, file by file, whether an object
  or a made world meets that bar and what is missing. It writes nothing and blocks nothing;
  submission itself is a reviewed pull request to the org, outside Hyprune, as RFC-0015
  (the community registry, in draft) describes. Community and custom sources in that RFC
  link to content and trust its declared licences; Hyprune does not police them either.

### Managing objects

The Objects tab gains per-entry actions for user-folder entries. Library and package entries
are read-only and show **Copy to my objects** instead; the copy keeps the original's licence
and attribution.

| Action | Effect | Method |
| --- | --- | --- |
| Rename | Changes `name` (display). The directory id and every `user/<id>` reference stay. | `objects.edit {ref, patch: {name}}` |
| Re-tag | `category`, `tags`, `description`. | `objects.edit` |
| Re-trait | `movable` (surfaces, upright, scale range); add or remove a **box** or **convex** collision proxy; remove `decorative` animations. Changes that rewrite the glTF (a new proxy, a new origin) run as an import job from the existing entry and end in review. | `objects.edit`, or `objects.import {source: {ref}}` |
| Provenance | `license`, `author`, `source`; any value, unknown included. The previous values are kept in `import.json` history. | `objects.edit` |
| Re-check | Validates again now and shows the result. | `objects.recheck {ref}` |
| Repair | See [Repair](#repair). | `repair.apply` |
| Delete | Moves the directory to a backup, then removes it. Placements of it become `missing` (RFC-0011), never silently removed. | `objects.delete {ref}` |

`objects.edit` writes `object.json` atomically (temporary file and rename) after validating the
patched manifest; a patch that would make the entry invalid is refused with the validator's
errors and nothing is written. Edits made outside Hyprune keep working as in RFC-0011 (watched
folder, revalidation).

## Repair

Repair turns a broken piece of user data back into a working one, keeps a backup, and can be
undone. It never touches installed packages or libraries.

| Target | Broken when | Repair | Backup of |
| --- | --- | --- | --- |
| Object entry (`user/<id>`) | `invalid` in the catalog | In order, the first that validates: restore `object.json` from `import.json`'s recorded manifest; recompute `bounds` and drop unknown or reserved traits and dangling node names; reconvert from the kept original with the recorded options. If none validates, offer Delete. | The object directory |
| Per-world overlay (one `worldId` in `editor.json`) | Records that fail the schema, reference unknown ids, or are `blocked` or `missing` | **Clean:** drop invalid and dangling records, keep the rest. **Reset:** drop every record of that world (placements, overrides, paths, transforms, locks). | `editor.json` |
| Overlay file | `editor.json` unreadable or of an unknown version | Rename it aside and start empty; offer **Restore** of the newest backup that parses. | The file |
| Setting | A settings file core keeps "last valid" for (`input.json`, `guidance.json`, player and graphics settings) currently fails validation, or the user asks | **Reset key** to its default, or **reset file** to defaults. | The file |
| Builder session | Unreadable or referencing missing maps | Drop the broken records, keep the rest; maps that return later are not re-added. | The session file |

- `repair.scan` lists problems with a suggested action; Settings → **Repair** and the Objects
  tab show them. Core also offers a repair in the notice that reports a broken item
  (`catalog.invalid`, `object.missing`, an invalid input file).
- Backups go to `$XDG_STATE_HOME/hyprune/backups/<timestamp>-<kind>-<name>/` with a
  `backup.json` (`{kind, target, reason, createdAt, files}`), 0600, the newest 32 kept and
  none older than 30 days removed. `repair.restore {backupId}` puts a backup back (and backs up
  what it replaces).
- Repairs are atomic per target and run in the daemon, off the compositor thread. A reset of
  the loaded world's overlay takes effect at once, like "Remove my objects".

## The builder world

### Package

The official builder world is a small package in the worlds repository,
`com.hyprune.builder` ("Open plain"), original and CC0:

- **Scene:** a flat plain 2,000 × 2,000 m at y = 0 with a faint grid (1 m minor, 10 m major
  lines, fading with distance), a horizon ring, and nothing else.
- **Collision:** the plain (two triangles). **Playable:** one box, x and z ±1,000 m, y −50 to
  500 m, `maxFlyHeight` 500.
- **Spawn:** one, at the origin facing −Z.
- **Sky:** a neutral gradient with a sun; the session's panorama replaces it (below).
- **No areas, anchors, placement zones or data objects.** It has no workspace homes.
- **Object assets:** the workspace screens and the builder markers (below), as package object
  directories.
- **Extension** `com.hyprune.builder` 0.1 marks it as a builder world.

```json
"extensions": {
  "com.hyprune.builder": {"version": "0.1",
    "plain": {"size": 2000, "height": 0}, "maxMaps": 4,
    "screens": ["workspace-screen-wall", "workspace-screen-stand"],
    "markers": {"spawn": "spawn-marker", "area": "area-marker"}}
}
```

Any package with this extension that also declares no `areas`, `anchors`, `placementZones`
or `dataObjects` is a builder world, so a community can ship other plains (a shallow sea, a
desert). A package that carries the extension and any of those fields is rejected
(`builder.invalid`). Cores without builder support ignore the extension and load an empty
plain.

### Behaviour (normative)

While a builder world is loaded:

- **No windows.** Core captures no windows into the world, composes no workspace walls,
  creates no room placements and restores no placement rules. Windows on the room workspace
  stay where they are and appear again in the next world. Tool 2 is disabled; tool 5 and the
  pocket hold objects only; window pocket items are kept for the next world. Switching to a
  workspace whose home is in another world leaves the builder (the session is already saved).
- **The overlay is the session.** `objects.place`, `objects.transform`, `objects.remove`,
  `objects.configure` and the tools write to the active session, not to `editor.json`. Undo and
  redo work as in Gizmo 2.0.
- **Maps are placeable**, up to `maxMaps` (at most 4) instances whose summed GPU estimate stays
  within the map limit. RFC-0011 budgets apply to the other objects as in any world.
- **Placement rules** (RFC-0011) apply with these changes: an unlocked map is exempt from
  rules 2, 3 and 5 (it has no collision yet and can overlap the plain); a locked map's
  collision becomes static collision for every rule; workspace screens and markers follow the
  rules of their surfaces.
- **The plain** stays visible under maps. **Hide the plain** (Builder page) removes its drawing
  and collision when at least one map is locked, so a map's own floor is the only floor.
- Entering the builder renders with the in-process renderer (objects; RFC-0009's existing
  reason).

### Sessions

A session is one builder project. Sessions live in
`$XDG_STATE_HOME/hyprune/builder/<sessionId>/` (`session.json`, the sky image, check results),
written atomically, 0600. `builder.open` creates or opens one and loads the builder world with
it; at most one is active. The Director's **Builder** page lists sessions (open, duplicate,
rename, delete with backup) and shows the active one.

```json
{
  "sessionVersion": "0.1",
  "id": "s-5d1a7c",
  "name": "Harbour plaza",
  "builderWorld": "com.hyprune.builder",
  "maps": [
    {"id": "m-1", "ref": "user/harbour-plaza", "digest": "sha256:9f2c41d0…",
     "pose": {"position": [0, -2.35, 0], "rotation": [0, 0.7071, 0, 0.7071]}, "scale": 1,
     "locked": true, "collision": {"mode": "simplified", "triangles": 19804, "maxError": 0.06}}
  ],
  "screens": [
    {"id": "screen-1", "ref": "package/workspace-screen-wall", "slot": "01",
     "areaId": "quay", "pose": {"position": [12.4, 1.1, -30.02], "rotation": [0, 0, 0, 1]},
     "scale": 1, "size": [4.8, 2.7]},
    {"id": "screen-2", "ref": "package/workspace-screen-stand", "slot": "02",
     "areaId": "market", "pose": {"position": [-18, 0, 6.5], "rotation": [0, 0.3827, 0, 0.9239]},
     "scale": 1, "size": [3.2, 1.8]}
  ],
  "spawn": {"pose": {"position": [0, 0.02, 14], "rotation": [0, 0, 0, 1]}},
  "areas": [
    {"id": "quay", "name": "Quay", "bounds": {"min": [-4, -1, -36], "max": [30, 12, -8]}},
    {"id": "market", "name": "Market", "bounds": {"min": [-34, -1, -8], "max": [-4, 12, 22]}}
  ],
  "objects": [
    {"id": "u-3e8a10", "ref": "library/com.hyprune.street@1.2.0/street-lantern",
     "pose": {"position": [4, 0, 9], "rotation": [0, 0, 0, 1]}, "scale": 1}
  ],
  "sky": {"panorama": "sky.jpg", "projection": "equirect", "rotation": 1.2, "intensity": 1,
          "license": "CC0-1.0", "author": "B. Photographer", "source": "https://example.com/hdri/dusk",
          "sun": {"azimuth": 241, "elevation": 18, "intensity": 3.2, "fromPanorama": true}},
  "plainHidden": true,
  "lastCheck": {"jobId": "job-57", "digest": "sha256:41aa…", "at": "2026-10-12T15:20:44Z"}
}
```

`digest` pins the map's content: if the user folder entry changes, the session shows the map as
**changed** and asks before using the new content (its lock is cleared).

### Sky: panorama

The user picks a sky on the Builder page (**Sky → Choose image…**, the same portal dialog):

- **Equirectangular** image, 2:1, PNG or JPEG, 1,024 to 8,192 px wide; or **six cube faces**,
  square, at most 2,048 px each, in the RFC-0004 environment order. Radiance HDR (`.hdr`) and
  OpenEXR inputs are tone-mapped to sRGB by the helper (world format v0 has no HDR images).
- The helper validates and normalises it (sRGB JPEG or PNG, at most 8,192 × 4,096) into the
  session; the review asks for its licence, author and source like any import.
- Core shows it in the builder world as the sky at infinity, rotatable about +Y, and derives
  the environment lighting from it (see the world format additions). **Sun from panorama**
  places the sun at the brightest region above the horizon (the centroid of the brightest
  0.1 % of texels after a 1° blur); the user can move it (azimuth, elevation, intensity).
- Built-in presets (CC0, shipped with the builder package) cover day, dusk and overcast.

### Lock

A map is aligned with the ordinary object tools: tool 5 places it ahead, the tool 4 gizmo moves,
rotates (yaw by default; **Allow tilt** on the Builder page unlocks the other rings for scenes
exported with a wrong up axis) and scales it (uniformly, 0.1 to 10, for scenes in the wrong
units). **Drop** (End) puts the map's lowest walkable-looking surface (the largest upward-facing
area within the bottom 10 % of its bounds) on the plain. A map's gizmo works at any distance.

**Lock** (`builder.lock {id, locked: true}`):

1. Freezes the pose: the gizmo, carry and wheel gestures refuse the map (`object.locked`), as
   for locked RFC-0011 instances.
2. Builds the map's collision off-thread in the helper (a `check` job stage), using the first
   mode that fits the 20,000-triangle collision budget:
   - **`scene`:** the scene's opaque and masked triangles as they are, when there are at
     most 20,000 after removing degenerate and blended triangles;
   - **`simplified`:** those triangles simplified to at most 20,000 with an error cap of
     0.1 m (meshoptimizer, borders locked), with the measured maximum error;
   - **`boxes`:** per-chunk oriented boxes fitted to the opaque triangles, when simplification
     can't stay under the error cap. This is coarse, and the checklist shows a warning item
     with the error.
3. Makes the collision live: the player can walk on the map, and every placement rule sees it.

While the collision builds, the map shows a progress ring and the player can't walk on it.
**Unlock** removes the map's collision and marks every later checklist item unchecked; spawn,
screens and areas keep their poses and are rechecked after the next lock. The lock is a session
fact, not an RFC-0011 overlay lock.

## Workspace screens

### The `mount` trait for workspaces

RFC-0011 reserves `mount` for props that hold windows. This RFC enables it in object format
**0.11** for one role, `mounted-workspace`, and only for objects placed in a builder world or
authored by a world package. Window-holding props in ordinary worlds (tool mounts on user
placements) stay RFC-0011's P4.

```json
"traits": {
  "mount": {"anchors": [
    {"id": "screen", "role": "mounted-workspace", "mountType": "hanging-wall",
     "pose": {"position": [0, 1.35, 0.06], "rotation": [0, 0, 0, 1]},
     "size": [4.8, 2.7], "screenType": "com.hyprune.window", "frameNode": "bezel"}]},
  "collidable": {"node": "proxy"},
  "movable": {"surfaces": ["wall"], "scale": [0.5, 2]}
}
```

| Field | Rules |
| --- | --- |
| `anchors` | 1 to 4 anchors in asset space. At most one has the role `mounted-workspace`; the others are `tool-mount` (P4 in ordinary worlds; in a builder world they become the home's tool anchors). |
| `role` | `mounted-workspace` or `tool-mount`. `data-object` stays with RFC-0004's `dataObjects`. |
| `mountType` | An RFC-0004 0.3 mount type (`facade-wall`, `hanging-wall`, `kiosk-pillar`, …). |
| `pose`, `size` | Asset space, front +Z, metres. A `mounted-workspace` anchor MUST be 16:9 within 0.5 % and at least 1.6 × 0.9 m at scale 1; scaling keeps the aspect. |
| `screenType`, `frameNode`, `limits` | As RFC-0004 anchors; `frameNode` is a glTF node name in the asset. |

`mount` combines with `decorative`, `collidable` and `movable`. The anchor's rectangle MUST lie
inside the bounds grown by 0.1 m and MUST NOT intersect the asset's collision proxy.

### Official screens

The builder package ships empty frames, all 16:9 and CC0:

| Asset | Support | Anchor size at scale 1 | Notes |
| --- | --- | --- | --- |
| `workspace-screen-wall` | wall | 4.8 × 2.7 m | A slim bezel that hangs on a wall. |
| `workspace-screen-stand` | floor | 3.2 × 1.8 m, centre at 1.9 m | A frame on two legs for open ground. |
| `workspace-screen-tool` | wall | 1.6 × 0.9 m | A `tool-mount` frame; snaps to the nearest home (below). |

In the builder an empty frame shows RFC-0005's placeholder (navy with the lockup) and the
workspace number it will get, `windows.workspace_base + slot` (21, 22, … by default), so the
user sees which home is which. Scaling (0.5 to 2) sizes the frame from 2.4 × 1.35 m to
9.6 × 5.4 m.

### Placing screens

The Builder page's **Add workspace screen** puts a screen in the pocket and selects tool 5,
like any object. Placement is RFC-0011's with one addition: the ghost also draws the screen's
**approach** (the box the checks below keep clear) and turns red while it is blocked, so the
user sees why before placing. Each screen gets the next free slot (`"01"`, `"02"`, …); the
Builder page reorders slots by drag. A `workspace-screen-tool` placed within 12 m of a
workspace screen joins that screen's area (the nearest one, or the one the user picks).

### From screen to home (make-world)

Each workspace screen becomes:

| World field | From the screen |
| --- | --- |
| `objects[]` | An authored instance of the screen asset, copied into the package as `objects/<asset>/` (world 0.9 `dir` source), `locked: true`. |
| `anchors[]` | `screen-<slot>`: pose = instance pose × anchor pose, size = anchor size × scale, `screenType`, `mount: {type, role: "mounted-workspace", interaction: "focus-in", frameObject: "<instance id>"}`. |
| `areas[]` | `{id, workspaceSlot: slot, primaryAnchor: "screen-<slot>", toolAnchors, spawnId: "home-<slot>", freePlacementZones}`, using the area marker's id and name when the screen lies in one, else `screen-<slot>`. |
| `spawns[]` | `home-<slot>`: the screen's standback point (below) on the floor, facing the screen. |
| `placementZones[]` | One box in front of the screen beyond the standback, for windows pulled from the home (RFC-0005), when the floor there is walkable; `windowSizes` 1.6 × 0.9 and 3.2 × 1.8, clearance 0.15. |

Homes then work exactly as authored ones: RFC-0005's default homes put slot `01` on workspace
21 (with the default base), the wall shows that workspace, and selecting the workspace travels
there. The room workspace (20) has no wall; its windows float in the world.

## Spawn and area markers

- **Spawn.** **Set spawn here** puts it at the player's feet facing the view; or **Place spawn**
  pockets the `spawn-marker` for tool 5. One spawn per session, which becomes `defaultSpawn`.
  The marker is a 0.3 m × 1.8 m capsule outline with a facing arrow; it is never exported as an
  object.
- **Areas.** **Add area** places an `area-marker`, a box drawn as translucent edges with its name
  on top. Tool 4 moves it and scales it **per axis** (markers are the only builder objects with
  non-uniform scale); the Builder page renames it (1 to 64 characters; the id is a slug of the
  name, unique). At most 32 areas. Areas are optional: they name places (HUD zone names, the map,
  markers) and group screens. An area becomes a `zones[]` entry `{id, name, bounds}`, and the
  `areas[]` entry of the screen inside it. Two workspace screens in one area box are allowed:
  each still gets its own home, named "<area> 1", "<area> 2".
- Markers follow the placement rules of `any` objects (they may float) but never collide and
  never block windows, screens or spawns.

## Checklist

The checklist turns the make-world checks into steps. It is builder state, published in the
`builder` state key, and the shell draws it with the RFC-0012 quest tracker component in the HUD
and in full on the Builder page. It is **not** an RFC-0012 quest: quest objectives never go
back, and a checklist item does (moving a screen into a wall unchecks it). Each item can show
where its problem is: the shell asks core for a marker (RFC-0012 marker kind `builder`) and
optionally a waypoint.

| Item | Done when | Blocks Make world | Show me |
| --- | --- | --- | --- |
| `map.placed` · "Place a map" | At least one map instance in the session | yes | Opens the catalog filtered to maps |
| `map.locked` · "Lock the map" | Every map is locked and its collision built | yes | Marks the unlocked map |
| `spawn.set` · "Set a spawn" | The spawn exists | yes | — |
| `spawn.floor` · "Spawn on the floor" | Floor (upward normal y ≥ 0.65) within 0.35 m under the spawn; the 0.3 × 1.8 m capsule clear; inside the playable union | yes | Marks the spawn |
| `screens.count` · "Place at least 2 screens" | Two or more workspace screens | yes | — |
| `screen.approach` · "Screen approaches clear" | For each screen, the approach checks below hold | yes, per screen | Marks the screen and its blocked approach |
| `walk.area` · "Check the walkable area" | A `check` job ran on the current session digest; the spawn is on the main navmesh island; every screen's standback is on it | yes (make-world runs the check itself when it is stale) | Turns on the navmesh overlay |
| `budgets` · "Within budgets" | GPU, triangles, collision and object counts within the limits | yes | Opens the Performance numbers |
| `rights` · "Record licences" | Every map, object and the sky have licence, author and source recorded (any value) | no | Lists the entries still unknown |
| `areas.named` · "Name your areas" | Every screen lies in a named area | no | Marks unnamed screens |
| `sky.set` · "Choose a sky" | A panorama or preset is chosen | no | Opens Sky |
| `make` · "Make world" | The last make-world job succeeded on the current digest | — | Opens the result |

Warnings (non-blocking) appear under the item they belong to: `boxes` collision, a navmesh island
larger than 25 m² that the spawn can't reach, visibility derivation skipped, parts with an unknown
licence, author or source (listed in the world's provenance).

### Approach checks (normative)

For a workspace screen of width *w* and height *h* (metres, after scale), with front normal *n*:

1. **Upright.** The screen's up axis is within 10° of +Y.
2. **Standback.** The standback point lies at distance *d* = max(2.5 m, 0.87 *w*) along *n*
   from the screen's centre, dropped to the first upward floor within 4 m below the screen's
   bottom edge. At *d*, a screen *w* wide fills about 60° of view. There must be floor there,
   the standing capsule must be clear, and the point must be inside the playable union.
3. **Clear box.** The box in front of the screen, *w* + 0.3 m each side, from 0.1 m above the
   approach floor to the screen's top edge, from the screen to the standback, intersects no
   collision, no collidable object and no other screen's box. (This is RFC-0011 rule 5's
   approach zone, lengthened to the standback.)
4. **Visible.** From the eye at the standback (feet + 1.7 m), rays to the screen's centre, its
   four corners inset by 5 %, and the midpoints of its edges reach the screen without hitting
   **rendered** geometry, not only collision. The screen rectangle grown by 5 cm intersects no
   rendered triangle (no frame half inside a wall).
5. **Height.** The screen's bottom edge is 0.2 to 3 m above the approach floor.
6. **Reachable.** The standback is on the spawn's navmesh island (after a check job).

## Make world

### Pipeline

**Make world** (`builder.make`) asks for a name (and optionally an id and version) and starts a
`make-world` job. The job works on a frozen copy of the session (its digest); edits during the
job don't affect it. Every stage runs in the import helper's sandbox, except the final install,
which the daemon does.

| # | Stage | Output |
| --- | --- | --- |
| 1 | **Freeze** | The session snapshot and its digest; refuse when a blocking checklist item other than `walk.area` is open (the result lists them). `walk.area` is decided by stages 3, 4 and 12. |
| 2 | **Compose scene** | `scene.glb`: one root per map with its locked pose as the node transform (vertices are not rewritten), meshes chunked as at import, materials and textures deduplicated across maps. Screens and other placed objects are not merged: they become authored objects. |
| 3 | **Collision** | The locked maps' collision (the lock's mode) plus the plain if it is not hidden, as one node outside the scene's node list; `collision: [{node, shape: "mesh", layer: "static"}]`. |
| 4 | **Navigation** | A Recast navmesh over the collision with the RFC-0004 capsule: radius 0.3 m, height 1.8 m, climb 0.35 m, slope normal y ≥ 0.65, cell 0.1 m (0.2 m for maps wider than 500 m), height 0.05 m. Islands are labelled; the spawn's island is the main island. Written as `navigation {kind: "mesh", node, agentRadius: 0.3, agentHeight: 1.8}`. |
| 5 | **Playable** | `playable.volumes`: up to 8 boxes covering the main island's polygons, merged greedily, grown 3 m sideways, from 2 m below the lowest floor to 20 m above the highest; `maxFlyHeight` = highest floor + 20 m. Islands the spawn can't reach stay outside unless an area box covers them. |
| 6 | **Homes** | Anchors, areas, home spawns and placement zones from the screens (above); `zones[]` from area markers; `defaultSpawn` from the spawn. |
| 7 | **Objects** | `objectAssets[]` and `objects[]` for screens and placed objects: user-folder objects copied into `objects/<id>/`; library objects referenced by exact `id@version`; all `locked: true` unless the user ticks **Let me rearrange objects in this world**. |
| 8 | **Visibility** | Derived visibility over the navmesh: 4 m cells over walkable floor, forward rays to each chunk's surface samples, 26-neighbour margin, merged camera regions (the worlds tooling's derived-visibility method). Capped at 15 minutes; over the cap the world ships without `visibility` (everything drawn) and a warning. |
| 9 | **Sky and lighting** | `atmosphere.panorama` from the session sky, environment lighting derived from it, the session sun as `atmosphere.sky.sun`, exposure 1, ACES tone mapping, mild bloom, no fog; the gradient sky colours estimated from the panorama's horizon and zenith rows as the fallback. |
| 10 | **Map** | `com.hyprune.map` and `com.hyprune.blueprint` levels drawn from collision, the navmesh, areas and screens (the worlds tooling's blueprint method). SHOULD; skipped with a warning when it fails. |
| 11 | **Provenance** | `license` (the SPDX `AND` of every distinct licence, `LicenseRef-unknown` included), `attribution[]` per copied path from each source's attribution, `ATTRIBUTION.md`, `LICENSE` texts, and `builder/session.json` (the frozen session, for **Edit in builder**). |
| 12 | **Validate** | The shared validator and the `hyprune-world-check` rules core can run: schema, references, path safety, glTF, extension rules, budgets, spawns against collision, placement rules for authored collidable objects, every approach check again on the final data. |
| 13 | **Install** | The daemon moves the package into `$XDG_DATA_HOME/hyprune/worlds/<id>/` atomically (staging directory and rename). A previous version of the same id is moved to a backup (see [Repair](#repair)) first. |

A stage that fails stops the job with `failed`, the stage, a code and checklist-style items
(the same item ids, plus `make.<stage>` for stage-only failures). The session is untouched.

### The made world

- **Id and version.** `local.<slug-of-name>` by default (`local.harbour-plaza`); version
  `0.1.0`, the patch number increasing with each make of the same id. The `local.` prefix is
  reserved for worlds made on this machine; official and published packages MUST NOT use it.
  **Export** asks for a reverse-domain id the user owns and writes it into the exported copy
  only.
- **Format.** The lowest world format that holds the result: 0.11 when screens are
  mount-backed or the sky is a panorama (always, for builder output), with
  `extensionsRequired` for the glTF extensions it uses.
- **Load.** The result offers **Load world now** (`world.load`) and **Edit in builder**, which
  opens a new session from `builder/session.json` with the maps resolved from the user folder.
- **Export.** Writes a `.tar.zst` with RFC-0004's archive rules and the package's provenance as
  recorded, for any world the user made. **Check for official publishing** reports whether
  every file meets the official bar (see [Licence and provenance](#licence-and-provenance-normative)).
- **Remove.** The Builder page lists made worlds; **Remove** deletes one (with a backup) after
  confirming. `worlds.remove` refuses any world that has a non-`local.` id or no
  `com.hyprune.builder.project` extension, so it never removes an installed official world.

### Make-world result

```json
{
  "id": "job-61", "kind": "make-world", "state": "succeeded",
  "sessionId": "s-5d1a7c", "digest": "sha256:41aa…", "elapsedMs": 412880,
  "world": {"id": "local.harbour-plaza", "version": "0.1.3", "formatVersion": "0.11",
            "path": "$XDG_DATA_HOME/hyprune/worlds/local.harbour-plaza/",
            "license": "CC-BY-4.0 AND CC0-1.0 AND LicenseRef-unknown",
            "provenance": {"entries": 6, "unknown": [{"path": "objects/old-crate/",
                           "fields": ["license", "source"]}], "officialEligible": false}},
  "stats": {"triangles": 1302566, "gpuBytes": 338689024, "collisionTriangles": 19806,
            "navmesh": {"polygons": 18342, "islands": 3, "mainIslandArea": 21840.5},
            "visibility": {"cells": 1366, "regions": 211}, "homes": 2, "objects": 4},
  "homes": [
    {"slot": "01", "areaId": "quay", "anchorId": "screen-01", "workspace": 21,
     "standback": [12.4, 0.0, -25.84]},
    {"slot": "02", "areaId": "market", "anchorId": "screen-02", "workspace": 22,
     "standback": [-16.08, 0.0, 8.42]}
  ],
  "items": [
    {"id": "walk.area", "level": "warning",
     "message": "A walkable island of 64 m² can't be reached from the spawn (roof terrace)",
     "show": {"position": [31.5, 9.8, -12.2]}}
  ]
}
```

## World format additions (0.11)

World format **0.11** follows RFC-0011's 0.9 (objects, paths, seats, `keepClear`) and 0.10
(movers, items, machines). It is numbered when this RFC's P2 lands and may share a version with
RFC-0012 P3. Every valid 0.10 document is valid as 0.11 (the inheritance rule).

| Field | 0.11 delta |
| --- | --- |
| `atmosphere.panorama` | New, optional: the sky drawn at infinity from an image (below). |
| `anchors[].mount.frameObject` | New, optional: the id of an authored `objects[]` instance whose asset has a `mount` trait. Mutually exclusive with `frameNode`. The anchor's pose and size MUST equal the instance pose × the asset's anchor pose and the anchor size × the instance scale, within 1 mm and 0.001 in rotation. The instance MUST be `locked`. |
| `objectAssets[]` traits | `mount` is accepted with the `mounted-workspace` and `tool-mount` roles. Instances of mount assets without a `frameObject` anchor are props (window holding stays RFC-0011 P4). |
| Extensions | `com.hyprune.builder` 0.1 (builder worlds) and `com.hyprune.builder.project` 0.1 (`{path}` to the frozen session in a made world). Both optional; cores ignore them when they don't support them. |

```json
"atmosphere": {
  "panorama": {"image": "sky/panorama.jpg", "projection": "equirect", "encoding": "srgb",
               "intensity": 1, "rotation": 1.2, "maxResolution": 1024, "environment": true},
  "sky": {"zenith": [0.21, 0.32, 0.55], "horizon": [0.86, 0.62, 0.43], "ground": [0.2, 0.18, 0.16],
          "sun": {"direction": [-0.82, 0.31, -0.48], "color": [1, 0.86, 0.7], "intensity": 3.2,
                  "angularRadius": 0.0093}}
}
```

| `panorama` field | Rules |
| --- | --- |
| `projection` | `equirect` (one 2:1 `image`, 1,024 to 8,192 px wide) or `cube` (six square `faces` at most 2,048 px, RFC-0004 environment order). |
| `image` / `faces` | Package-relative PNG or JPEG paths (KTX2 later). |
| `encoding`, `intensity`, `rotation` | As `atmosphere.environment`. |
| `maxResolution` | Cube face size core resamples to, 256 to 2,048, default 1,024. The resampled cube (RGBA8 sRGB with mips) counts against the world GPU budget: 32 MiB at 1,024. |
| `environment` | Default true: when the world has no `atmosphere.environment`, core derives the prefiltered environment from the panorama exactly as it does from authored faces. |

The panorama replaces the gradient as the background. `sky` stays: it carries the sun, and its
colours are what object probes (RFC-0004 0.8) use for rays that miss; with a panorama, a missed
probe ray samples the panorama instead. Fog's `excludeUnlit` applies to the panorama. Core
resamples the equirectangular image on a loader worker, never in the render pass.

## Contract plan

### IPC

Methods arrive in one IPC version per phase, numbered at merge (the first after 0.22). Each
inherits every earlier method, event and grant; older peers get the exact older projections, and
`hello.methods` gates every control.

**New grants.**

| Grant | Allows | Holders |
| --- | --- | --- |
| `objects.manage` | Import jobs (reading a user-chosen file), editing, deleting, rechecking and repairing user-folder objects; overlay repair | Reference shell, CLI. Never a world; extensions only with explicit approval. |
| `builder.control` | Builder sessions, locks, markers, sky, checks, make-world, removing made worlds | Reference shell, CLI. Never a world or extension. |

Settings repair needs the existing `runtime.control`; reads need `state.read`.

| Method | Params → result | Grant | Phase |
| --- | --- | --- | --- |
| `objects.import` | `{source: {path} \| {ref}, options?}` → `{jobId}` | objects.manage | P1 |
| `objects.import.revise` | `{jobId, options}` (job in `review`) → `{jobId}` | objects.manage | P1 |
| `objects.import.commit` | `{jobId, manifest: {id, name, category, tags?, surfaces?, license, author, source, class?}}` → `{revision, ref}` | objects.manage | P1 |
| `jobs.get` | `{jobId}` → the full job record | state.read | P1 |
| `jobs.cancel` | `{jobId}` → `{revision}` (also discards a job in `review`) | the job's grant | P1 |
| `objects.edit` | `{ref, patch}` (`name`, `description`, `category`, `tags`, `traits.movable`, `traits.collidable: null`, `traits.decorative: null`, `license`, `author`, `source`) → `{revision}` | objects.manage | P1 |
| `objects.delete` | `{ref, deleteOriginal?}` → `{revision, backupId}` | objects.manage | P1 |
| `objects.recheck` | `{ref}` → `{revision, state, errors}` | objects.manage | P1 |
| `objects.export` | `{ref, path}` (a directory the portal returned) → `{jobId}` | objects.manage | P1 |
| `publish.check` | `{ref}` or `{worldId}` → `{eligible, files: [{path, license, author, source, ok, missing}]}` (read-only; the official-org bar) | state.read | P1 (objects), P3 (worlds) |
| `repair.scan` | `{}` → `{issues: [{id, kind, target, problem, actions}]}` (at most 128) | state.read | P1 |
| `repair.apply` | `{issueId, action}` → `{revision, backupId}` | objects.manage, or runtime.control for settings | P1 |
| `repair.backups` / `repair.restore` | `{}` → `{backups}` / `{backupId}` → `{revision, backupId}` | state.read / as `repair.apply` | P1 |
| `builder.sessions` | `{}` → `{sessions: [{id, name, updatedAt, maps, screens, made}]}` | state.read | P2 |
| `builder.open` | `{sessionId}` or `{new: {name}}`, optional `builderWorld` → `{revision, sessionId}` (loads the builder world) | builder.control | P2 |
| `builder.close` | `{}` → `{revision}` (saves; returns to the previous world) | builder.control | P2 |
| `builder.session.update` | `{patch}`: `name`, `plainHidden`, `allowTilt`, screen `slot` order, area names → `{revision}` | builder.control | P2 |
| `builder.session.remove` / `.duplicate` | `{sessionId}` → `{revision, backupId}` / `{revision, sessionId}` | builder.control | P2 |
| `builder.lock` | `{id, locked}` (a map) → `{revision, jobId?}` | builder.control | P2 |
| `builder.spawn.set` | `{pose}` or `{here: true}` → `{revision}` | builder.control | P2 |
| `builder.area.set` / `builder.area.remove` | `{area: {id?, name, bounds}}` / `{id}` → `{revision, id}` | builder.control | P2 |
| `builder.sky.set` | `{source: {path}, license, author, source}` or `{preset}` or `{rotation?, sun?}` → `{revision, jobId?}` | builder.control | P2 |
| `builder.check` | `{}` → `{jobId}` (collision, navmesh, approach checks; no package) | builder.control | P3 |
| `builder.walkable` | `{show}` → `{revision}` (core draws the last check's navmesh) | builder.control | P3 |
| `builder.make` | `{name, id?, version?, objectsMovable?}` → `{jobId}` | builder.control | P3 |
| `worlds.remove` | `{worldId}` (user worlds folder only) → `{revision, backupId}` | builder.control | P3 |
| `worlds.export` | `{worldId, path, id?}` → `{jobId}` | builder.control | P3 |

`objects.place` places map entries only in a builder world; elsewhere it returns `-32005` with
rule `map.builder-only`. Screens, markers and objects in the builder use the existing objects
methods.

**State.**

| Key | Shape |
| --- | --- |
| `jobs` | `{list: [{id, kind, state, stage, stages, progress, source?, class?, startedAtMs, elapsedMs, error?}]}`, at most 16 (running, queued and the last finished per kind). `state`: `queued`, `running`, `review`, `succeeded`, `failed`, `cancelled`. Full records (measurements, proposed manifest, warnings, items) through `jobs.get`. |
| `builder` | `null` outside a builder world; else `{sessionId, name, digest, maps: [{id, ref, locked, collision, state}], screens: [{id, slot, workspace, areaId, approach: "ok" \| "blocked" \| "unchecked"}], spawn, areas, sky, plainHidden, checklist: [{id, label, state: "done" \| "open" \| "warning", blocking, message?, show?}], lastCheck, lastMake}` |
| `objects` | Catalog entries gain `class` (`object` or `map`), `provenance` (`{license, author, source}`, `"unknown"` where unrecorded) and `imported` (`{at, sourceName}` or null). |

**Events.** `job.progress {jobId, kind, state, stage, progress, message?}`, at most 4 per second
per job, plus one on every state change. Notices: `import.started`, `import.review`,
`import.failed`, `import.unsupported`, `import.sandbox`, `import.limit`, `object.edited`,
`object.deleted`, `repair.applied`, `repair.restored`, `builder.locked`, `builder.check`,
`builder.made`, `builder.make.failed`.

**Errors.** `-32004` unknown job, ref, session or issue; `-32005` refused (locked, map outside a
builder world, read-only source); `-32007` a validation or placement rule
(`error.data {rule, errors}`); `-32008` a limit (queue full, a job limit, a budget).

**Paths from clients.** `objects.import`, `builder.sky.set`, `objects.export` and
`worlds.export` take an absolute local path, like `libraries.install`. The daemon resolves it
once, opens it without following a final symlink, and copies (or writes) only that file or
directory. The reference shell passes only paths the portal returned. Core never lists a
directory it was not given.

### Shell

| Piece | Where | Notes |
| --- | --- | --- |
| Import… | Objects tab toolbar | Portal FileChooser with filters for the formats above; then the job row with progress and Cancel. |
| Review form | Objects tab, modal | Thumbnail, class badge and measured numbers against both classes' limits, options (units, up axis, lighting, Reduce, Treat as map), provenance (licence list, author, source, the detected licence text), warnings and steps, Add / Change options / Discard. |
| Entry actions | Objects tab, per entry | Rename, Re-tag, Re-trait, Provenance, Re-check, Repair, Delete, Export, Check for official publishing, Open in builder (maps). A licence chip on every entry ("unknown" when unrecorded). |
| Repair | Settings → Repair, and Objects tab | `repair.scan` issues with their actions; backups with Restore. |
| Builder page | Director, after Objects | Sessions; the active session's maps, screens (slot order), areas, spawn, sky and sun, Hide the plain, Allow tilt; Check; Make world; made worlds with their provenance summary, Load, Edit in builder, Export, Check for official publishing, Remove. |
| Checklist | HUD, the RFC-0012 tracker component | Items with state and Show me; collapses to "3 of 9" in calm mode. |
| Dialog presentation | — | The portal dialog is an ordinary toplevel. The shell enters free cursor before opening it and restores the previous state after; core treats the portal's dialog (parented to the shell through xdg-foreign) as a transient window that is shown in front of the player in every world, the builder included, and never captured into placements. Every cursor and focus change this causes is deferred outside the render pass and goes on the supervised live checklist. |

### Schema, SDK and tooling

- **Schema:** `import.schema.json`; object format 0.11 (`mount` enabled as above);
  world format 0.11 (`panorama`, `frameObject`); `extensions/builder.schema.json` and
  `extensions/builder-project.schema.json`; `builder/session.schema.json`;
  `backup.schema.json`; the IPC versions above with the inheritance test and the shared version
  helper.
- **SDK:** types and mock-core support for jobs, builder state and repair;
  `hyprune object import PATH [--license --author --source --map --reduce]`,
  `hyprune object edit|delete|export`, `hyprune repair [scan|apply|restore]`,
  `hyprune builder open|check|make`, `hyprune world export|remove`,
  `hyprune publish check PATH|ID`.
- **Import helper:** `hyprune-import` in the meta repository's packages, with its sandbox
  launcher, the glTF wrap path, the Assimp backend, the optional Blender backend, the CPU
  thumbnail renderer, and the collision, Recast navmesh, derived-visibility and blueprint stages
  shared with the worlds tooling (one implementation, two callers).
- **Worlds:** the `com.hyprune.builder` package (plain, screens, markers, sky presets) and its
  release; checks that each screen asset's anchor is 16:9 and clear of its proxy.
- **Core:** the builder world behaviour, session overlay, map gating, lock collision swap,
  navmesh overlay drawing (world pass, GL state saved and restored), panorama sky, frame-object
  anchors, the `CHANGELOG.md` entry per IPC version.

### Compatibility

- RFC-0011 behaviour is unchanged outside a builder world, except that map-class entries are
  listed and refused with a reason.
- Objects imported here are ordinary 0.9 object directories plus `import.json`. A core or SDK
  whose validator predates `import.json` may list them as invalid; the validator change ships
  with P1, before any importer writes the file.
- Made worlds need a core that supports world format 0.11. Older cores reject them before
  activation (exact versions).
- Sessions and backups are new files; nothing existing is migrated.

## Phasing

| Phase | Delivers | Needs | Proven when |
| --- | --- | --- | --- |
| **P1** | Import (glTF wrap, `.zip`, FBX, OBJ, the rest of the Assimp formats), the sandboxed helper and its limits, size classes, review, provenance fields (recorded, never enforced), the official-publishing check, `import.json`, kept originals, entry management, object export, repair with backups. Maps are importable and listed, but nothing can place them yet. | RFC-0011 P1 (IPC 0.22). | A user imports a `.glb`, an `.fbx` and a zipped glTF scene from the Director without a terminal and places the first two. A crafted archive with traversal, a 3 GiB zip bomb, a parser crash and a 10-minute hang each fail only their job, with the right code and no files left. An import with licence, author and source all unknown is added, placed and exported, and its export carries them as unknown. Repair brings back an object with a broken manifest and a world overlay with dangling records, and Restore undoes both. |
| **P2** | The builder world package; sessions; map placement, alignment and lock with collision; workspace screens on the `mount` trait; spawn and area markers; panorama skies; the checklist with the items that need no navmesh; object format 0.11. | P1; world format 0.9 (object directories in packages). | In a nested session, a user places a downloaded CC-licensed level scene on the plain, aligns, locks and walks on it, sets a spawn and places two screens; moving a screen into a wall unchecks its item and shows why. |
| **P3** | `builder.check` (collision, navmesh, approach checks) with the navmesh overlay; make-world with every stage; made-world install, load, edit, export and remove; world format 0.11. | P2. | The made world loads in a nested session with both homes on workspaces 21 and 22, selecting each workspace travels to its screen, a window opened there shows on that wall, nothing is reachable outside the playable volumes, derived visibility culls without visible popping across the any-angle sweep, and `hyprune-world-check` passes the package. |
| **P4** | Composability: placing a made world's map, collision, navmesh and homes as an **area** inside another world (an area package with an attachment pose and connectors), and several sessions merged into one world. | P3; a world-format design for nested collision, navigation and visibility. | — |

Contract changes follow the usual path: RFC amendment, schema version and tests, SDK types and
the core changelog.

## Open questions

1. **Paths or file descriptors.** `objects.import` takes a path from the portal, like
   `libraries.install`. Should the shell instead pass an open file descriptor over the socket,
   so the daemon never resolves a client-supplied path? That needs descriptor passing in every
   shell transport.
2. **Collision budget for maps.** 20,000 static collision triangles forces simplification of
   almost every level scene. Raise it for made worlds (for example 200,000 with a BVH), or keep
   one budget for all worlds?
3. **Official bar versions.** The official-publishing check accepts CC0-1.0 and CC-BY-4.0.
   Should it also accept CC-BY-3.0? RFC-0015 sets the org policy; the check follows it.
4. **More formats.** USD/USDZ and Alembic are common for scenes; are they worth a backend in
   P1 or later?
5. **Lighting.** Imports are unlit-baked or lit by the sun and probes. Should make-world offer an
   optional lightmap bake out of process, or is that permanently the worlds tooling's job?
6. **One or more maps.** Up to 4 maps per session (proposed) lets users stitch pieces; is one map
   per session simpler and enough until P4?
7. **Approach geometry.** A standback of max(2.5 m, 0.87 × width) is shorter than authored
   worlds use (Lumen Reach reserves 16 m in front of primary walls). Should the builder ask for
   more space, or warn only?
8. **Dialogs in the world.** Is xdg-foreign parenting enough to recognise the portal dialog as
   transient, or does the shell need to name the dialog's window to core?
9. **Re-import updates.** When the user re-imports a map that a made world uses, should the
   Builder page offer to remake that world?
10. **Builder world variants.** Should third-party builder worlds (other plains) be allowed, as
    proposed, or only the official one?
