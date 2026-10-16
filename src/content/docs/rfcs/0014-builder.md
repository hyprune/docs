---
title: "RFC-0014 — In-world builder: importing objects and making worlds"
description: "Import and simplify models inside Hyprune through a sandboxed converter, manage and repair user objects, and build a world in its own git-versioned folder: start from a starter, place maps and workspace screens, follow a checklist, make the world, save and release versions."
---

**Status: draft · proposed 2026-10-12; revised 2026-10-12 with decisions on the file dialog,
size caps and Simplify, the screen standback, the builder entry flow and version control.**
Implemented so far (core 0.9.0, @hyprune/schema 0.13.0, SDK 0.11.0): workspace screens (object
format 0.11, IPC 0.27), importing objects from the Director and the builder world ([amendments below](#amendment-import-in-the-objects-tab-object-format-011-and-ipc-027));
the rest is not implemented. It builds on the object catalog, user folder, placements and
placement rules of [RFC-0011](/rfcs/0011-objects/) as shipped in
[IPC 0.22](/rfcs/0011-objects/#amendment-p1-in-ipc-022), the world format of
[RFC-0004](/rfcs/0004-world-format/) (spawns, areas and workspace homes, playable volumes,
derived visibility, placed objects), the workspace homes of [RFC-0005](/rfcs/0005-surfaces/),
the tools and gizmo of [RFC-0006](/rfcs/0006-interaction/), the process and sandbox model of
[RFC-0007](/rfcs/0007-extensions/), the Director of [RFC-0008](/rfcs/0008-shell/), the
markers and tracker of [RFC-0012](/rfcs/0012-quests/), and the release convention of
[RFC-0015](/rfcs/0015-registry/). It switches on RFC-0011's reserved `mount` trait for one
purpose: empty workspace screens that become homes.

## Goal

A user can bring their own models into Hyprune without leaving it, and can turn a whole scene
into a world they can live in, keep and publish:

- **Import inside Hyprune.** Director → Objects → **Import…** opens the desktop's file dialog.
  Hyprune converts the file out of process, shows what it found, and puts the result in the
  user folder or in the world being built. The same tab renames, re-tags, re-checks,
  **simplifies**, deletes and **repairs** objects.
- **No size homework.** Large scenes import with warnings, not refusals. One click on
  **Simplify** reduces triangles, builds collision proxies and shrinks textures, and shows the
  numbers before and after.
- **Build a world.** **I want to build a world** asks for a name, creates the world's own
  folder from a starter (flat land with a simple floor texture and a default sky) and warps the
  user into it in editor mode. There they import or place a scene (a downloaded CC-licensed
  level scene, say), align and lock it, set a spawn, place at least two empty workspace
  screens, and press **Make world**: collision, a walkable floor, playable volumes, derived
  visibility and workspace homes are written into the folder. Everything the world uses is
  copied into that folder, so it is self-contained.
- **Versions like a project.** The world's folder is a git repository. Changes are pending until
  **Save**, which makes one commit; **Release** tags a version, and with a remote also pushes
  and creates a GitHub release in RFC-0015's format. History shows every save and version, and
  any version can be opened or restored as a new save.
- **Approachable.** A checklist in the HUD, shaped like a quest, says what is missing and shows
  where the problem is. Every failure is a checklist item, never a log.
- **Users own what they make.** Imports record source, author and licence (or "unknown"), and
  made worlds and releases carry that record. Hyprune shows it and never enforces it: no
  licence blocks an import, a world, a save or a release. Only publishing to the official
  hyprune org checks it.

Non-goals: modelling or sculpting tools, terrain editing, scripted behaviour, merging other
people's changes (Hyprune never pulls, merges or rebases), network access other than an
explicit Release to the user's own remote, and editing an installed package.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Import | Turning a user-chosen file into an object directory, through an import job. |
| Import helper | `hyprune-import`, the bundled converter. It runs as a sandboxed child of the daemon, never in the compositor. |
| Project helper | `hyprune-project`, the bundled helper that runs the user's `git` and `gh` for a world folder. A child of the daemon, never in the compositor. |
| Job | A long-running daemon task with progress: `import`, `simplify`, `check`, `make-world` or `release`. |
| Size class | `object` or `map`, measured at import (below). |
| Map | An object of the `map` class: a whole scene. Placeable only in a world being built. |
| World folder | The folder of a world being built: a git repository holding the world package, its copied assets and the editor's project file. |
| Starter | A small official package a world folder is created from. |
| Editor mode | A world folder loaded for building: no windows, maps placeable, edits written to the folder. |
| Play mode | A world folder loaded like any other world, from its last Make world. |
| Pending changes | The folder's working-tree changes since the last save. |
| Save | One commit of all pending changes. |
| Release | A version tag on a save; with a remote, also a push and a GitHub release. |
| Workspace screen | An object with a `mount` trait whose anchor has the `mounted-workspace` role: an empty frame that becomes a workspace home. |
| Lock | Freezing a map's pose; a locked map gets collision and becomes walkable. |
| Make world | The job that writes the playable world package into the world folder. |
| Repair | Resetting a broken object entry, per-world overlay, setting or project file to a known-good state, with a backup. |

## Importing objects

### Flow

1. **Director → Objects → Import….** The shell opens the xdg-desktop-portal
   `org.freedesktop.portal.FileChooser` (`OpenFile`, filters below, one file); see
   [File dialogs](#file-dialogs). Core never opens a dialog. The CLI equivalent is
   `hyprune object import PATH`.
2. The shell calls `objects.import {source: {path}}` with the path the portal returned. The
   daemon copies the file (and, for `.gltf`, the files it references) into a private staging
   directory and starts an `import` job. From here on, only the staged copy is read.
3. The import helper converts the staged copy into a candidate object directory, measures it,
   classifies it and renders a thumbnail. The job publishes progress by stage.
4. The job stops in **`review`**. The shell shows the review form: thumbnail, name, category,
   tags, surfaces, size class with the measured numbers against the recommended limits,
   warnings, **Simplify**, and the provenance fields (source, author, licence; each may stay
   unknown). A licence text found in the source is shown, never applied silently.
5. **Add** (`objects.import.commit`) validates the candidate with the user's answers using the
   same checks as RFC-0011's user folder and moves it atomically to its target:
   - **My objects** (`$XDG_DATA_HOME/hyprune/objects/<id>/`), the default outside editor mode;
   - **This world** (`<world folder>/objects/<id>/`, maps in `maps/<id>/`), the default in
     editor mode. It becomes a pending change of the world folder.

   **Change options** (`objects.import.revise`) reruns conversion with new options (Simplify,
   units, up axis, lighting); **Discard** cancels.
6. The catalog lists the new entry. Its **Place** action works as in RFC-0011 (pocket, tool 5,
   gizmo). A `map` in My objects offers **Build a world from this** (a new world folder with
   the map copied in) and, in editor mode, **Add to this world**.

Nothing is written to a target before step 5, and a failed or cancelled job leaves no files
behind. RFC-0011 forbids core from converting assets at load or on add; this RFC keeps that
rule. Conversion happens only in the helper, only as an explicit user action, and its output
passes the ordinary validation.

### Formats

| Input | Extensions | Conversion |
| --- | --- | --- |
| glTF 2.0 | `.glb`, `.gltf` with relative buffers and images | **Wrap.** Validate (Khronos glTF validator), keep geometry and materials, decode `KHR_draco_mesh_compression` to plain buffers, drop what the world format ignores (cameras, punctual lights, animations, skins: listed as warnings), fix the origin for the object's support surface, write `object.json`, render the thumbnail, compress where cheap. |
| Archive | `.zip` holding exactly one supported model at any depth | Extracted inside the sandbox with the RFC-0004 archive rules (no links, devices, absolute paths or traversal), then converted by its model's format. Licence and readme files in the archive are surfaced in the review. |
| FBX | `.fbx` (binary and ASCII, 7.x) | **Convert** through the helper's importer backend (Assimp) to glTF: units from the file's unit scale, axes from its axis system, embedded and relative textures, then as glTF. |
| OBJ | `.obj` with `.mtl` | Convert: MTL diffuse, normal (`map_Bump`/`norm`), roughness (`map_Pr`) and emission to metallic-roughness; units and up-axis choice in the review, since OBJ declares neither. |
| COLLADA, PLY, STL, 3DS | `.dae`, `.ply`, `.stl`, `.3ds` | Convert through the same backend. PLY and STL get a neutral material. |

Other inputs are refused with `import.unsupported`; Blender users export glTF. Import,
conversion and Simplify never need Blender. Blender stays an optional, user-installed tool for
work such as light baking, outside this RFC (open question). glTF 1.0, USD and Alembic are open
questions.

**Compress where cheap.** Geometry is always meshopt-compressed (`EXT_meshopt_compression`,
16-bit positions, as the world format 0.7 rules ask): it is fast and lossless at those
tolerances. Colour textures larger than 1024 px are encoded to KTX2 (Basis ETC1S, full mip
chain) while the job's texture-encoding budget lasts (60 s for objects, 10 min for maps);
textures left over stay PNG or JPEG and the review says so. JPEG sources are never re-encoded to
JPEG. No step is lossy without appearing in the review's step list. Simplify (below) goes
further on request.

**Lighting.** Many downloaded scenes have lighting painted into their textures. The review
offers **Lighting: lit (default) / baked into textures**; the second marks every material
`KHR_materials_unlit`. Imported content is never lightmapped (RFC-0004 0.8 objects aren't).

**Thumbnails** are rendered by the helper on the CPU (a software rasteriser in the sandbox, no
GPU device) from a fixed three-quarter view of the bounds: 256 × 256 PNG, at most 256 KiB, as
RFC-0011 requires.

### The import helper (normative)

The helper parses untrusted files with large third-party parsers, so it runs where a crash or
an exploit can do the least harm. Simplify, the builder checks and Make world use the same
helper and sandbox.

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
  power, `map` conversions, Simplify of maps, checks and Make world ask before they start
  (`import.ask_on_battery`, default true).
- **Queue.** One job runs at a time; up to 8 wait. A queued job can be cancelled; a running
  one is cancelled with SIGTERM, then SIGKILL after 5 s. Staging and output are removed.
- **File sizes.** Everything the helper writes into a world folder keeps each file at most
  64 MiB (large maps are split into several `.glb` files or external buffers), so a world
  folder can be pushed to a git host without large-file storage.

These are safety limits, not size judgements: they stop runaway or hostile input.

| Limit | Object import | Map import, Simplify of a map | Check | Make world |
| --- | --- | --- | --- | --- |
| Source size | 2 GiB (file or archive) | 2 GiB | — | — |
| Archive expanded | 4 GiB, 20,000 files | 4 GiB, 20,000 files | — | — |
| Address space (`RLIMIT_AS`) | 4 GiB | 16 GiB | 8 GiB | 16 GiB |
| Wall time | 5 min | 45 min | 15 min | 60 min |
| Output | 256 MiB | 2 GiB, 10,000 files, 64 MiB per file | 512 MiB | 2 GiB, 10,000 files, 64 MiB per file |

A job over a limit fails with the limit's name (`import.limit.time`, `import.limit.memory`,
`import.limit.output`) and the stage it reached. A helper crash fails only that job.

### Size classes

The helper measures the converted result with the SDK's estimates (the same numbers
`hyprune object check` and the catalog show: PNG and JPEG at 4 B/px, KTX2 at 1 B/px, ×4/3 for
mips, plus every buffer). An import is an **object** when every object limit holds, and a
**map** otherwise. Nothing is refused for its size: a measure above a recommended limit is a
**warning** in the review, the catalog and the checklist, each with **Simplify** next to it.

| Measure | Object (RFC-0011 per-asset budgets) | Map, recommended | Above the recommendation |
| --- | --- | --- | --- |
| Triangles | ≤ 50,000 | ≤ 2,000,000 | Warning: may run slowly on integrated GPUs (the reference is an Intel iGPU at 4K). |
| Largest texture side | ≤ 2,048 px | ≤ 4,096 px | Warning: GPU memory. |
| GPU memory | ≤ 48 MiB | ≤ 384 MiB | Warning; see the world budget below. |
| Largest bounds extent | ≤ 32 m | ≤ 2,000 m | Warning: beyond the starter's flat land. |
| Collision | ≤ 2,000 proxy triangles, if any | built at lock, ≤ 500,000 triangles | Collision is simplified to fit at lock (below), with a warning. |
| Nodes | ≤ 256 | ≤ 8,192 | Warning: visibility derivation slows down. |
| Materials | ≤ 64 | ≤ 1,024 | Warning. |
| Directory | 64 files, 64 MiB, 32 MiB per file | 10,000 files, 2 GiB | Warning. |

- The 32 m bound is new: RFC-0011's budgets don't limit size, and a light but huge model (a
  low-poly landscape) placed in a home would bury its screens. Objects keep every other
  RFC-0011 rule; an import over an object limit is a map, not a refused object.
- **Treat as map.** The review can turn any object-class import into a map (a small room
  interior can become a world). A map becomes an object only if Simplify brings it within
  every object limit.
- **The world GPU budget** is the one limit a machine can't wave through: core loads a world
  only if it fits `graphics.world_budget_mib` (default 512, RFC-0002). A map or a world that
  doesn't fit is not refused at import or placement; it is placed as a bounds outline with a
  **Too large for this machine's world budget** item whose actions are **Simplify** and
  **Raise the budget** (Settings → Performance, up to three quarters of the GPU's memory).
- Map imports keep the scene's own origin (alignment happens in editor mode) and split meshes
  larger than 32 m into grid chunks along existing material boundaries, so the editor can
  frustum-cull and Make world can derive visibility per chunk. Node names survive with a
  `#<n>` suffix per chunk.
- Skinned characters are out of scope here: the review points to RFC-0010's character import.

**Map entries.** The catalog lists maps with `class: "map"` and the measured numbers. They are
`placeable: false` with the reason `map.editor-only` in every world that is not in editor mode.
The user folder's 256-object limit counts maps; maps have their own total of 16 GiB on disk,
shown in the Objects tab.

### Simplify

**Simplify** is one click in the import review and on any user-folder or world-folder entry in
the Objects tab. It runs as a `simplify` job in the import helper's sandbox, without Blender,
and ends in a review with the numbers before and after. **Use simplified** replaces the entry
(the previous version goes to a backup, or for a world folder stays in its history until the
next save); **Keep original** discards the result.

| Part | Method | Default target |
| --- | --- | --- |
| Render triangles | meshoptimizer `meshopt_simplifyWithAttributes` per mesh (normals and UVs weighted, so seams and shading hold), borders of map chunks locked (`meshopt_SimplifyLockBorder`), then vertex-cache, overdraw and vertex-fetch optimisation. Each mesh stops at the first of its target count or its error target. | Objects: within 50,000 triangles, error ≤ 1 % of the object's size. Maps: half the triangles or the 2,000,000 recommendation, whichever is lower, error ≤ 2 cm. |
| Collision | Objects: approximate convex decomposition (a CoACD-class library, V-HACD as the fallback) into a proxy node outside the scene's node list. Maps: the opaque triangles simplified with meshoptimizer (convex hulls would fill rooms and corridors). | Objects: ≤ 16 hulls, ≤ 64 vertices each, ≤ 2,000 triangles, concavity 0.05. Maps: ≤ 500,000 triangles, error ≤ 5 cm. |
| Textures | Downscale in linear light (colour) or as data (normal, metallic-roughness, occlusion), then KTX2 with the existing encoders (Basis ETC1S for colour, UASTC with Zstandard for normals). | Objects: 2,048 px; maps: 2,048 px. |
| Tiny parts | Optional: drop disconnected parts smaller than a size the user picks. | Off. |

The user can open **Options** to change any target; the one-click default needs none.

```json
{
  "id": "job-44", "kind": "simplify", "state": "review", "ref": "user/harbour-plaza",
  "before": {"triangles": 3412880, "maxTexture": 8192, "gpuBytes": 1174405120,
             "fileBytes": 612368384, "collisionTriangles": null},
  "after":  {"triangles": 1706102, "maxTexture": 2048, "gpuBytes": 289406976,
             "fileBytes": 151519232, "collisionTriangles": 212870},
  "error":  {"renderMax": 0.018, "renderMean": 0.002, "collisionMax": 0.047},
  "thumbnails": {"before": "thumb-before.png", "after": "thumb-after.png"},
  "class": {"before": "map", "after": "map"},
  "warnings": []
}
```

The review shows the two thumbnails side by side and a table of the numbers, with each measure
against its recommendation. Errors are metres in asset space.

### What an import writes

The object directory is an RFC-0011 directory plus one known file, `import.json`, which
records how it was made. The shared validator accepts `import.json` beside `object.json`
(schema `import.schema.json`); it is covered by the `"."` attribution like every other file.

```text
harbour-plaza/
  object.json        # formatVersion "0.9"; map-class objects carry no traits
  object.glb         # or several .glb files / buffers, each at most 64 MiB
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
  "options": {"units": "m", "up": "+y", "lighting": "baked", "simplify": null, "class": "map"},
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
cap, least recently used first). It is never copied into a world folder. Deleting the object
offers to delete its original.

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
  unknown or otherwise, may refuse or limit an import, an edit, a placement, editor mode,
  Make world, a save, a release or an export.
- **Suggest, don't decide.** A licence detected from files in the source is shown with its text
  as a suggestion; the user chooses. The helper never infers a licence from a file name alone.
- **Carry.** Copying into a world folder, Make world, releases and exports write the recorded
  licences and attributions into the package metadata (`license`, `attribution[]`,
  `ATTRIBUTION.md`, the `LICENSE` texts found) unchanged, including unknown entries. They MUST
  NOT drop, merge away or rewrite attribution.
- **Show.** The catalog, the review, the Builder page and the Make world result show each
  entry's licence, author and source, and a world's provenance summary lists which parts are
  unknown.
- **Official publishing is the one check.** Content accepted into the official hyprune org
  must be CC0-1.0 or CC-BY-4.0 with a named author and source (the RFC-0004 rights policy).
  **Check for official publishing** (`publish.check`) reports, file by file, whether an object
  or a world meets that bar and what is missing. It writes nothing and blocks nothing;
  submission itself is a reviewed pull request to the org, outside Hyprune, as
  [RFC-0015](/rfcs/0015-registry/) describes. Community and custom sources in that RFC link to
  content and trust its declared licences; Hyprune does not police them either.

### Managing objects

The Objects tab gains per-entry actions for user-folder entries and, in editor mode, for the
world folder's own objects and maps. Library and installed-package entries are read-only and
show **Copy to my objects** instead; the copy keeps the original's licence and attribution.

| Action | Effect | Method |
| --- | --- | --- |
| Rename | Changes `name` (display). The directory id and every reference stay. | `objects.edit {ref, patch: {name}}` |
| Re-tag | `category`, `tags`, `description`. | `objects.edit` |
| Re-trait | `movable` (surfaces, upright, scale range); add or remove a collision proxy (made by Simplify's collision step alone); remove `decorative` animations. Changes that rewrite the glTF run as a job from the existing entry and end in review. | `objects.edit`, or `objects.simplify {ref, parts: ["collision"]}` |
| Simplify | See [Simplify](#simplify). | `objects.simplify {ref}` |
| Provenance | `license`, `author`, `source`; any value, unknown included. The previous values are kept in `import.json` history. | `objects.edit` |
| Re-check | Validates again now and shows the result. | `objects.recheck {ref}` |
| Repair | See [Repair](#repair). | `repair.apply` |
| Delete | User folder: moves the directory to a backup, then removes it; placements of it become `missing` (RFC-0011), never silently removed. World folder: removes it as a pending change, refused while the world still places it. | `objects.delete {ref}` |

`objects.edit` writes `object.json` atomically (temporary file and rename) after validating the
patched manifest; a patch that would make the entry invalid is refused with the validator's
errors and nothing is written. Edits made outside Hyprune keep working as in RFC-0011 (watched
folder, revalidation).

## File dialogs

The import dialog, **Sky → Choose image…** and the export and release-notes pickers all use the
portal FileChooser through the shell. Decided for P1:

1. **In the world (default).** The shell enters free cursor (RFC-0006) and opens the dialog
   with its window as parent (xdg-foreign). Core treats a toplevel parented to the shell this
   way as a **transient dialog**: shown in front of the player in every world, editor mode
   included, given keyboard focus, never captured into placements, rules or homes. When it
   closes, the shell restores the previous interaction state.
2. **Fallback: on the desktop.** If the portal backend gives no parent link, or core hasn't
   recognised the dialog within 2 s, the shell leaves world mode for the desktop (as the world
   toggle does), lets the dialog open there, and returns to the world at the same pose when it
   closes. `ui.file_dialog = "desktop"` makes this the default.

Every cursor, focus and workspace change in both paths is deferred outside the render pass and
goes on the supervised live checklist: nested sessions use a software cursor and can't test
them.

## Repair

Repair turns a broken piece of user data back into a working one, keeps a backup, and can be
undone. It never touches installed packages or libraries, and it never rewrites a world
folder's git history.

| Target | Broken when | Repair | Backup of |
| --- | --- | --- | --- |
| Object entry (`user/<id>`) | `invalid` in the catalog | In order, the first that validates: restore `object.json` from `import.json`'s recorded manifest; recompute `bounds` and drop unknown or reserved traits and dangling node names; reconvert from the kept original with the recorded options. If none validates, offer Delete. | The object directory |
| Per-world overlay (one `worldId` in `editor.json`) | Records that fail the schema, reference unknown ids, or are `blocked` or `missing` | **Clean:** drop invalid and dangling records, keep the rest. **Reset:** drop every record of that world (placements, overrides, paths, transforms, locks). | `editor.json` |
| Overlay file | `editor.json` unreadable or of an unknown version | Rename it aside and start empty; offer **Restore** of the newest backup that parses. | The file |
| Setting | A settings file core keeps "last valid" for (`input.json`, `guidance.json`, player and graphics settings) currently fails validation, or the user asks | **Reset key** to its default, or **reset file** to defaults. | The file |
| World folder | `builder/project.json` unreadable, invalid, or referencing missing files | **Back to last save:** discard pending changes to the broken files (as Discard). **Clean:** drop the broken records and keep the rest, as a pending change. | The pending files |

- `repair.scan` lists problems with a suggested action; Settings → **Repair** and the Objects
  tab show them. Core also offers a repair in the notice that reports a broken item
  (`catalog.invalid`, `object.missing`, an invalid input file).
- Backups go to `$XDG_STATE_HOME/hyprune/backups/<timestamp>-<kind>-<name>/` with a
  `backup.json` (`{kind, target, reason, createdAt, files}`), 0600, the newest 32 kept and
  none older than 30 days removed. `repair.restore {backupId}` puts a backup back (and backs up
  what it replaces).
- Repairs are atomic per target and run in the daemon, off the compositor thread. A reset of
  the loaded world's overlay takes effect at once, like "Remove my objects".

## Building a world

### I want to build a world

1. **Director → Worlds → I want to build a world** (or `hyprune builder create NAME`) asks for a
   name and, when there are several, a starter. Git is required: if `git` (2.30 or newer)
   isn't found, the dialog says so and offers nothing else.
2. The daemon creates the **world folder** `$HYPRUNE_PROJECTS_DIR/<slug>/` (default
   `$XDG_DATA_HOME/hyprune/projects/<slug>/`), copies the starter into it, writes the world id
   (`local.<slug>`), name and version `0.1.0`, and has the project helper run `git init` and make
   the first save, "Create <name> from the <starter> starter". Creating the world is its
   first save, so there is always a last save to go back to.
3. Core loads the folder in **editor mode** with the usual warp transition and puts the player
   at the starter's spawn.

**Edit** on any world folder (Director → Worlds → My worlds) opens it in editor mode again;
**Play** loads it in play mode. An installed package is never opened for editing; **Build a
world from this** on an installed world is an open question.

### Starters

A starter is a small official package, original and CC0, shipped with Hyprune. The first is
**Flat land**:

- **Scene:** flat land 2,000 × 2,000 m at y = 0 with a simple tiled floor texture (a soft grid,
  1 m minor and 10 m major lines, fading with distance).
- **Collision:** the land (two triangles). **Playable:** one box, x and z ±1,000 m, y −50 to
  500 m, `maxFlyHeight` 500.
- **Spawn:** one, at the origin facing −Z.
- **Sky:** the default sky, a CC0 panorama with its sun.
- **No areas, anchors, placement zones or data objects.** It has no workspace homes yet.

The workspace screens and markers come from the built-in builder kit (below), not the starter.

### The world folder

```text
harbour-plaza/                    # a git repository
  .git/
  .gitignore                      # builder/cache/, releases/
  .gitattributes                  # binary patterns; large-file lines commented out (RFC-0015 template)
  world.json                      # written by Make world; the starter's until the first one
  scene.glb, scene-1.glb, …       # written by Make world
  maps/harbour-plaza/             # copied map directories (object.json, glb, import.json, LICENSE)
  objects/workspace-screen-wall/  # copied objects, official screens included
  objects/street-lantern/
  sky/panorama.jpg
  starter/                        # the starter's land, used until Hide the land
  builder/project.json            # the editor's source of truth
  builder/cache/                  # check results, navmesh preview (ignored by git)
  ATTRIBUTION.md, LICENSE/        # written by Make world from every copied part
```

- **Self-contained.** Everything a world uses is **copied** into its folder: maps, objects from
  the user folder, library objects (the builder kit's screens included), the sky. A world
  folder never references the user folder or an installed library, so it builds, saves,
  releases and moves to another machine as it is. Copies keep their `import.json`, licence and
  attribution.
- **Project file.** `builder/project.json` is what editor mode reads and writes: maps, screens,
  spawn, areas, objects, sky. Make world turns it into `world.json` and the derived files.
- **Packaging.** The package is the folder minus `.git/`, `.gitignore`, `.gitattributes`,
  `.github/`, `builder/cache/` and `releases/`. `builder/project.json` stays in it, so a
  released world can be built on again.
- **Core writes only in editor mode**, only inside the folder, atomically per file. Play mode
  and every other world treat the folder as read-only.

```json
{
  "projectVersion": "0.1",
  "name": "Harbour plaza",
  "starter": "com.hyprune.starter.flat@1.0.0",
  "maps": [
    {"id": "m-1", "dir": "maps/harbour-plaza",
     "pose": {"position": [0, -2.35, 0], "rotation": [0, 0.7071, 0, 0.7071]}, "scale": 1,
     "locked": true, "collision": {"mode": "scene", "triangles": 212870, "maxError": 0}}
  ],
  "screens": [
    {"id": "screen-1", "dir": "objects/workspace-screen-wall", "slot": "01",
     "areaId": "quay", "pose": {"position": [12.4, 1.1, -30.02], "rotation": [0, 0, 0, 1]},
     "scale": 1, "size": [4.8, 2.7]},
    {"id": "screen-2", "dir": "objects/workspace-screen-stand", "slot": "02",
     "areaId": "market", "pose": {"position": [-18, 0, 6.5], "rotation": [0, 0.3827, 0, 0.9239]},
     "scale": 1, "size": [3.2, 1.8]}
  ],
  "spawn": {"pose": {"position": [0, 0.02, 14], "rotation": [0, 0, 0, 1]}},
  "areas": [
    {"id": "quay", "name": "Quay", "bounds": {"min": [-4, -1, -36], "max": [30, 12, -8]}},
    {"id": "market", "name": "Market", "bounds": {"min": [-34, -1, -8], "max": [-4, 12, 22]}}
  ],
  "objects": [
    {"id": "o-3e8a10", "dir": "objects/street-lantern",
     "pose": {"position": [4, 0, 9], "rotation": [0, 0, 0, 1]}, "scale": 1}
  ],
  "sky": {"panorama": "sky/panorama.jpg", "projection": "equirect", "rotation": 1.2,
          "intensity": 1, "license": "CC0-1.0", "author": "B. Photographer",
          "source": "https://example.com/hdri/dusk",
          "sun": {"azimuth": 241, "elevation": 18, "intensity": 3.2, "fromPanorama": true}},
  "landHidden": true,
  "lastMake": {"projectDigest": "sha256:41aa…", "at": "2026-10-12T15:20:44Z"}
}
```

### Editor mode (normative)

While a world folder is loaded in editor mode:

- **No windows.** Core captures no windows into the world, composes no workspace walls,
  creates no room placements and restores no placement rules. Windows on the room workspace
  stay where they are and appear again in the next world. Tool 2 is disabled; tool 5 and the
  pocket hold objects only; window pocket items are kept for the next world. Switching to a
  workspace whose home is in another world leaves editor mode; pending changes stay pending.
  Transient file dialogs are the exception (see [File dialogs](#file-dialogs)).
- **Edits go to the folder.** `objects.place`, `objects.transform`, `objects.remove`,
  `objects.configure` and the tools write to `builder/project.json` (debounced to once a
  second, atomically), not to `editor.json`. Every edit is a pending change; nothing is
  committed until Save. Undo and redo work as in Gizmo 2.0 within the editing session.
- **Placing copies.** Placing a user-folder or library object copies its directory into
  `objects/<id>/` first (once per asset); the placement refers to the copy.
- **Maps are placeable**, up to 4 instances. RFC-0011 budgets apply to the other objects as in
  any world; size warnings follow [Size classes](#size-classes).
- **Placement rules** (RFC-0011) apply with these changes: an unlocked map is exempt from
  rules 2, 3 and 5 (it has no collision yet and can overlap the land); a locked map's
  collision becomes static collision for every rule; workspace screens and markers follow the
  rules of their surfaces.
- **The land** stays visible under maps. **Hide the land** (Builder page) removes its drawing
  and collision when at least one map is locked, so a map's own floor is the only floor.
- Editor mode renders with the in-process renderer (objects; RFC-0009's existing reason).

### Sky: panorama

The user picks a sky on the Builder page (**Sky → Choose image…**, the same portal dialog):

- **Equirectangular** image, 2:1, PNG or JPEG, 1,024 to 8,192 px wide; or **six cube faces**,
  square, at most 2,048 px each, in the RFC-0004 environment order. Radiance HDR (`.hdr`) and
  OpenEXR inputs are tone-mapped to sRGB by the helper (world format v0 has no HDR images).
- The helper validates and normalises it (sRGB JPEG or PNG, at most 8,192 × 4,096) into
  `sky/`; the review asks for its licence, author and source like any import.
- Core shows it as the sky at infinity, rotatable about +Y, and derives the environment
  lighting from it (see the world format additions). **Sun from panorama** places the sun at
  the brightest region above the horizon (the centroid of the brightest 0.1 % of texels after
  a 1° blur); the user can move it (azimuth, elevation, intensity).
- Built-in presets (CC0, shipped with the builder kit) cover day, dusk and overcast.

### Lock

A map is aligned with the ordinary object tools: tool 5 places it ahead, the tool 4 gizmo moves,
rotates (yaw by default; **Allow tilt** on the Builder page unlocks the other rings for scenes
exported with a wrong up axis) and scales it (uniformly, 0.1 to 10, for scenes in the wrong
units). **Drop** (End) puts the map's lowest walkable-looking surface (the largest upward-facing
area within the bottom 10 % of its bounds) on the land. A map's gizmo works at any distance.

**Lock** (`builder.lock {id, locked: true}`):

1. Freezes the pose: the gizmo, carry and wheel gestures refuse the map (`object.locked`), as
   for locked RFC-0011 instances.
2. Builds the map's collision off-thread in the helper (a `check` job stage):
   - **`scene`:** the opaque and masked triangles as they are, when there are at most
     500,000 after removing degenerate and blended triangles (world format 0.11 collision
     budget, below);
   - **`simplified`:** otherwise, those triangles simplified with meshoptimizer to 500,000
     (borders locked, error target 5 cm), with the measured maximum error as a warning item.
3. Makes the collision live: the player can walk on the map, and every placement rule sees it.

While the collision builds, the map shows a progress ring and the player can't walk on it.
**Unlock** removes the map's collision and marks every later checklist item unchecked; spawn,
screens and areas keep their poses and are rechecked after the next lock. The lock is part of
the project file, not an RFC-0011 overlay lock.

## Workspace screens

### The `mount` trait for workspaces

**Amendment (object format 0.11, IPC 0.27; core 0.9.0).** Workspace screens shipped ahead of the
builder, as ordinary user placements in any world: see
[RFC-0011's amendment](/rfcs/0011-objects/#amendment-workspace-screens-in-object-format-011-and-ipc-027).
A `mounted-workspace` anchor may be 16:9 or 21:9 (2.33 to 2.39), at least 0.9 m high, and a
screen binds to a chosen workspace or the next free one rather than to a slot. The rules below
for editor mode and Make world still apply when those phases land.

RFC-0011 reserves `mount` for props that hold windows. This RFC enables it in object format
**0.11** for one role, `mounted-workspace`, and only for objects placed in editor mode or
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
| `anchors` | 1 to 4 anchors in asset space. At most one has the role `mounted-workspace`; the others are `tool-mount` (P4 in ordinary worlds; in editor mode they become the home's tool anchors). |
| `role` | `mounted-workspace` or `tool-mount`. `data-object` stays with RFC-0004's `dataObjects`. |
| `mountType` | An RFC-0004 0.3 mount type (`facade-wall`, `hanging-wall`, `kiosk-pillar`, …). |
| `pose`, `size` | Asset space, front +Z, metres. A `mounted-workspace` anchor MUST be 16:9 within 0.5 % and at least 1.6 × 0.9 m at scale 1; scaling keeps the aspect. |
| `screenType`, `frameNode`, `limits` | As RFC-0004 anchors; `frameNode` is a glTF node name in the asset. |

`mount` combines with `decorative`, `collidable` and `movable`. The anchor's rectangle MUST lie
inside the bounds grown by 0.1 m and MUST NOT intersect the asset's collision proxy.

### The builder kit

The builder kit is an official library shipped with Hyprune (`com.hyprune.builder-kit`, CC0):
empty screen frames, all 16:9, the spawn and area markers, and the sky presets. Its objects are
copied into a world folder when placed, like any other.

| Asset | Support | Anchor size at scale 1 | Notes |
| --- | --- | --- | --- |
| `workspace-screen-wall` | wall | 4.8 × 2.7 m | A slim bezel that hangs on a wall. |
| `workspace-screen-stand` | floor | 3.2 × 1.8 m, centre at 1.9 m | A frame on two legs for open ground. |
| `workspace-screen-tool` | wall | 1.6 × 0.9 m | A `tool-mount` frame; joins the nearest home (below). |

In editor mode an empty frame shows RFC-0005's placeholder (navy with the lockup) and the
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

### From screen to home (Make world)

Each workspace screen becomes:

| World field | From the screen |
| --- | --- |
| `objects[]` | An authored instance of the copied screen asset (`objects/<asset>/`, world 0.9 `dir` source), `locked: true`. |
| `anchors[]` | `screen-<slot>`: pose = instance pose × anchor pose, size = anchor size × scale, `screenType`, `mount: {type, role: "mounted-workspace", interaction: "focus-in", frameObject: "<instance id>"}`. |
| `areas[]` | `{id, workspaceSlot: slot, primaryAnchor: "screen-<slot>", toolAnchors, spawnId: "home-<slot>", freePlacementZones}`, using the area marker's id and name when the screen lies in one, else `screen-<slot>`. |
| `spawns[]` | `home-<slot>`: the screen's standback point (below) on the floor, facing the screen. |
| `placementZones[]` | One box in front of the screen beyond the standback, for windows pulled from the home (RFC-0005), when the floor there is walkable; `windowSizes` 1.6 × 0.9 and 3.2 × 1.8, clearance 0.15. |

Homes then work exactly as authored ones: RFC-0005's default homes put slot `01` on workspace
21 (with the default base), the wall shows that workspace, and selecting the workspace travels
there. The room workspace (20) has no wall; its windows float in the world.

## Spawn and area markers

- **Spawn.** **Set spawn here** puts it at the player's feet facing the view; or **Place spawn**
  pockets the `spawn-marker` for tool 5. One spawn per world, which becomes `defaultSpawn`.
  The marker is a 0.3 m × 1.8 m capsule outline with a facing arrow; it is never written as an
  object.
- **Areas.** **Add area** places an `area-marker`, a box drawn as translucent edges with its name
  on top. Tool 4 moves it and scales it **per axis** (markers are the only editor objects with
  non-uniform scale); the Builder page renames it (1 to 64 characters; the id is a slug of the
  name, unique). At most 32 areas. Areas are optional: they name places (HUD zone names, the map,
  markers) and group screens. An area becomes a `zones[]` entry `{id, name, bounds}`, and the
  `areas[]` entry of the screen inside it. Two workspace screens in one area box are allowed:
  each still gets its own home, named "<area> 1", "<area> 2".
- Markers follow the placement rules of `any` objects (they may float) but never collide and
  never block windows, screens or spawns.

## Checklist

The checklist turns the Make world checks into steps. It is builder state, published in the
`builder` state key, and the shell draws it with the RFC-0012 quest tracker component in the HUD
and in full on the Builder page. It is **not** an RFC-0012 quest: quest objectives never go
back, and a checklist item does (moving a screen into a wall unchecks it). Each item can show
where its problem is: the shell asks core for a marker (RFC-0012 marker kind `builder`) and
optionally a waypoint.

| Item | Done when | Blocks Make world | Show me |
| --- | --- | --- | --- |
| `map.placed` · "Place a map" | At least one map instance | yes | Opens the catalog filtered to maps |
| `map.locked` · "Lock the map" | Every map is locked and its collision built | yes | Marks the unlocked map |
| `spawn.set` · "Set a spawn" | The spawn exists | yes | — |
| `spawn.floor` · "Spawn on the floor" | Floor (upward normal y ≥ 0.65) within 0.35 m under the spawn; the 0.3 × 1.8 m capsule clear; inside the playable union | yes | Marks the spawn |
| `screens.count` · "Place at least 2 screens" | Two or more workspace screens | yes | — |
| `screen.approach` · "Screen approaches clear" | For each screen, the approach checks below hold | yes, per screen | Marks the screen and its blocked approach |
| `walk.area` · "Check the walkable area" | A `check` job ran on the current project digest; the spawn is on the main navmesh island; every screen's standback is on it | yes (Make world runs the check itself when it is stale) | Turns on the navmesh overlay |
| `budgets` · "Fits this machine" | The world fits `graphics.world_budget_mib` | yes (the one physical limit) | Offers Simplify and Raise the budget |
| `sizes` · "Recommended sizes" | Every measure within its recommendation | no | Lists the measures over, with Simplify |
| `rights` · "Record licences" | Every map, object and the sky have licence, author and source recorded (any value) | no | Lists the entries still unknown |
| `areas.named` · "Name your areas" | Every screen lies in a named area | no | Marks unnamed screens |
| `sky.set` · "Choose a sky" | A panorama or preset other than the default is chosen | no | Opens Sky |
| `make` · "Make world" | The last Make world succeeded on the current project digest | — | Opens the result |
| `save` · "Save" | No pending changes | no | Opens Save |

Warnings (non-blocking) appear under the item they belong to: simplified collision with its
error, a navmesh island larger than 25 m² that the spawn can't reach, visibility derivation
skipped, parts with an unknown licence, author or source (listed in the world's provenance).

### Approach checks (normative)

For a workspace screen of width *w* and height *h* (metres, after scale), with front normal *n*:

1. **Upright.** The screen's up axis is within 10° of +Y.
2. **Standback.** The standback point lies at distance *d* = max(2.5 m, 0.87 *w*) along *n*
   from the screen's centre, dropped to the first upward floor within 4 m below the screen's
   bottom edge. At *d*, a screen *w* wide fills about 60° of view. There must be floor there,
   the standing capsule must be clear, and the point must be inside the playable union. This is
   the decided default for made worlds; authored worlds keep their own, larger standbacks.
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

**Make world** (`builder.make`) starts a `make-world` job on the folder's current project file
(its digest); edits during the job don't affect it. Every stage runs in the import helper's
sandbox with the world folder mounted read-only and a staging directory as output; the daemon
moves the outputs into the folder at the end. The outputs are **pending changes**: Make world
never saves.

| # | Stage | Output |
| --- | --- | --- |
| 1 | **Freeze** | The project snapshot and its digest; refuse when a blocking checklist item other than `walk.area` is open (the result lists them). `walk.area` is decided by stages 3, 4 and 12. |
| 2 | **Compose scene** | `scene.glb` (split into `scene-<n>.glb` files of at most 64 MiB): one root per map with its locked pose as the node transform (vertices are not rewritten), meshes chunked as at import, materials and textures deduplicated across maps. Screens and other placed objects are not merged: they become authored objects. |
| 3 | **Collision** | The locked maps' collision (the lock's mode) plus the land if it is not hidden, as one node outside the scene's node list; `collision: [{node, shape: "mesh", layer: "static"}]`. |
| 4 | **Navigation** | A Recast navmesh over the collision with the RFC-0004 capsule: radius 0.3 m, height 1.8 m, climb 0.35 m, slope normal y ≥ 0.65, cell 0.1 m (0.2 m for maps wider than 500 m), height 0.05 m. Islands are labelled; the spawn's island is the main island. Written as `navigation {kind: "mesh", node, agentRadius: 0.3, agentHeight: 1.8}`. |
| 5 | **Playable** | `playable.volumes`: up to 8 boxes covering the main island's polygons, merged greedily, grown 3 m sideways, from 2 m below the lowest floor to 20 m above the highest; `maxFlyHeight` = highest floor + 20 m. Islands the spawn can't reach stay outside unless an area box covers them. |
| 6 | **Homes** | Anchors, areas, home spawns and placement zones from the screens (above); `zones[]` from area markers; `defaultSpawn` from the spawn. |
| 7 | **Objects** | `objectAssets[]` (`dir` sources, all inside the folder) and `objects[]` for screens and placed objects; all `locked: true` unless the user ticks **Let me rearrange objects in this world**. |
| 8 | **Visibility** | Derived visibility over the navmesh: 4 m cells over walkable floor, forward rays to each chunk's surface samples, 26-neighbour margin, merged camera regions (the worlds tooling's derived-visibility method). Capped at 15 minutes; over the cap the world ships without `visibility` (everything drawn) and a warning. |
| 9 | **Sky and lighting** | `atmosphere.panorama` from the project sky, environment lighting derived from it, the project sun as `atmosphere.sky.sun`, exposure 1, ACES tone mapping, mild bloom, no fog; the gradient sky colours estimated from the panorama's horizon and zenith rows as the fallback. |
| 10 | **Map** | `com.hyprune.map` and `com.hyprune.blueprint` levels drawn from collision, the navmesh, areas and screens (the worlds tooling's blueprint method). SHOULD; skipped with a warning when it fails. |
| 11 | **Provenance** | `license` (the SPDX `AND` of every distinct licence, `LicenseRef-unknown` included), `attribution[]` per copied path from each part's attribution, `ATTRIBUTION.md`, `LICENSE` texts, and the `com.hyprune.builder` extension pointing at `builder/project.json`. |
| 12 | **Validate** | The shared validator and the `hyprune-world-check` rules core can run: schema, references, path safety, glTF, extension rules, budgets, spawns against collision, placement rules for authored collidable objects, every approach check again on the final data. |
| 13 | **Write** | The daemon replaces `world.json` and the derived files in the folder atomically (staging directory, then a rename per file, `world.json` last), and records `lastMake` in the project file. |

A stage that fails stops the job with `failed`, the stage, a code and checklist-style items
(the same item ids, plus `make.<stage>` for stage-only failures). The folder is untouched.

### The made world

- **Id and version.** The id is `local.<slug>` from creation. The `local.` prefix is reserved
  for worlds made on this machine; official and published packages MUST NOT use it. Before the
  first release with a remote, Release asks for a published id (for a GitHub remote,
  `io.github.<owner>.<slug>` as RFC-0015 requires) and writes it as a pending change to save
  first. The version is set only by Release.
- **Format.** The lowest world format that holds the result: 0.11 for builder output (mount-backed
  screens, panorama sky, the larger collision budget), with `extensionsRequired` for the glTF
  extensions it uses.
- **Play and edit.** The result offers **Play** (load the folder in play mode) and **Back to
  editing**. Play loads `world.json` as written, saved or not.
- **Export.** Writes a `.tar.zst` of the package with RFC-0015's archive rules (`hyprune world
  pack --release` output) and the provenance as recorded. **Check for official publishing**
  reports whether every file meets the official bar (see
  [Licence and provenance](#licence-and-provenance-normative)).
- **Remove.** Director → Worlds → My worlds → **Remove** moves the whole folder to the desktop
  trash (XDG trash) after confirming. A remote, if any, is untouched.

### Make world result

```json
{
  "id": "job-61", "kind": "make-world", "state": "succeeded",
  "world": {"id": "local.harbour-plaza", "version": "0.1.0", "formatVersion": "0.11",
            "folder": "$XDG_DATA_HOME/hyprune/projects/harbour-plaza/",
            "projectDigest": "sha256:41aa…", "elapsedMs": 412880,
            "license": "CC-BY-4.0 AND CC0-1.0 AND LicenseRef-unknown",
            "provenance": {"entries": 6, "unknown": [{"path": "objects/old-crate/",
                           "fields": ["license", "source"]}], "officialEligible": false}},
  "stats": {"triangles": 1302566, "gpuBytes": 338689024, "collisionTriangles": 212870,
            "navmesh": {"polygons": 18342, "islands": 3, "mainIslandArea": 21840.5},
            "visibility": {"cells": 1366, "regions": 211}, "homes": 2, "objects": 4},
  "homes": [
    {"slot": "01", "areaId": "quay", "anchorId": "screen-01", "workspace": 21,
     "standback": [12.4, 0.0, -25.84]},
    {"slot": "02", "areaId": "market", "anchorId": "screen-02", "workspace": 22,
     "standback": [-16.08, 0.0, 8.42]}
  ],
  "pending": {"added": 9, "modified": 3, "deleted": 0},
  "items": [
    {"id": "walk.area", "level": "warning",
     "message": "A walkable island of 64 m² can't be reached from the spawn (roof terrace)",
     "show": {"position": [31.5, 9.8, -12.2]}}
  ]
}
```

## Saves, versions and releases

Every world folder is a git repository from creation, with or without a remote. Git is required
for building worlds.

### Model (normative)

- **Pending.** Every change in the folder (editor edits, copies, imports into the world, Make
  world outputs, Simplify results) is a pending change in the working tree until the user
  saves. The HUD and the Builder page show an **unsaved changes** indicator with the count;
  leaving editor mode or closing the world keeps pending changes and says so.
- **Save** asks for an **optional message** and makes exactly one commit of all pending changes
  (`git add -A` within the folder, honouring `.gitignore`). An empty message becomes a default:
  "Save" plus the local time and a summary of the change from the project file
  ("Save 2026-10-12 15:40 · moved 2 screens, added map harbour-plaza, made world"). **There
  are no automatic commits**: Hyprune commits only on Save, on creation (the first save), on
  Release (the version commit below) and on Revert (a save).
- **Discard** reverts pending changes to the last save, for everything or per file; the
  discarded files go to a backup first (see [Repair](#repair)), so a discard can be undone.
- **Release** (shown as **Ready**) makes a version from the **saved** state:
  1. With pending changes it refuses and offers **Save first**. If the last Make world is not
     on the saved project digest, it offers **Make world and save**. A world without a
     successful Make world can't be released.
  2. It suggests the next version (SemVer: a patch bump of the latest version tag, `0.1.0` for
     the first); the user may pick any higher version. Lower or existing versions are refused.
  3. It writes `version` into `world.json` and commits only that change ("Release v0.2.0"),
     then makes an annotated tag `v<version>` (RFC-0015's one-package convention) with the
     optional release notes as its message.
  4. **No remote:** that is all. Versions are local, listed in History, usable for rollback.
  5. **With a remote:** the project helper builds the package from the **tag** (a temporary
     checkout of `v<version>`, not the working tree) with `hyprune world pack --release`,
     giving the archive, its `.sha256` file and the release record; pushes the current branch
     and the tag; and, for a GitHub remote, creates the GitHub release for the tag with those
     assets (`gh release create --verify-tag`). Other remotes get the push only, and the
     result says how to attach the assets by hand.
- **History** lists saves and versions, newest first: message, time, version tag if any, and
  the change summary. **Open** plays a saved state or version read-only from a temporary
  checkout, without touching the folder. **Revert to this** makes the folder's files equal to
  that state and saves it as a new commit ("Revert to v0.1.0"); it refuses while there are
  pending changes (offering Save or Discard first). History is never rewritten.

### The project helper (normative)

All git and GitHub work runs in **`hyprune-project`**, a short-lived child of the daemon.
The compositor plugin never runs git or touches the network, the daemon never runs git in its
own process, and nothing waits on the helper in the render path or the tick.

- **Tools.** The user's own `git` (2.30 or newer, required) and, for GitHub releases, the
  user's `gh` (optional). The helper runs them with fixed argument vectors, never through a
  shell; the only user-supplied values are the message, the version, the release notes (passed
  through files or stdin) and the remote URL (validated: `https://`, `ssh://` or
  `user@host:path`).
- **Credentials.** Pushes and releases use the user's existing git credential helpers, SSH
  agent and `gh` login. Hyprune never asks for, stores or logs a token or password.
  `GIT_TERMINAL_PROMPT=0` and `GH_PROMPT_DISABLED=1`: a missing credential fails the step with
  **Set up access to this remote** and the command to run in a terminal.
- **Hardening.** Every git call passes `-c core.hooksPath=/dev/null` and
  `-c core.fsmonitor=false` (a world folder never runs hooks), works only inside the folder
  (`-C <folder>`, `GIT_CEILING_DIRECTORIES` set to its parent) and never changes the user's
  global configuration. If no commit identity is configured, the first Save asks for a name
  and email and stores them in the folder's own `.git/config`.
- **Never.** No `--force`, `reset --hard`, rebase, amend, pull, fetch-and-merge, branch deletion
  or tag deletion. A push the remote rejects (it has commits the folder lacks) stops the
  release with **The remote has changes Hyprune won't merge**; the local tag stays and Release
  can be retried after the user resolves it with git.
- **Limits.** Local operations time out after 60 s, pushes and releases after 30 minutes.
  The helper reports progress by step (`build`, `push`, `release`). Saves warn about any file
  over 95 MiB, which common git hosts refuse; files Hyprune writes stay under 64 MiB.
- **Repository template.** If the folder also contains RFC-0015's release workflow, the user can
  set **Let the repository's workflow build releases** (`releaseUpload: false` in the project
  file): Release then pushes the tag only.
- **Without the network.** Save, Discard, History, Open, Revert and remote-less Release work
  offline. Only Release with a remote touches the network, and only when the user presses it.

### Remote

Builder page → **Version control → Remote**: set or clear one remote URL (`origin`). Hyprune
creates no repositories on any host; the user creates an empty repository and pastes its URL.
The page shows the remote, the latest pushed version, and how many saves are not yet pushed.

```json
"vcs": {
  "branch": "main", "head": "4f1c2ab", "pending": {"added": 2, "modified": 5, "deleted": 0},
  "lastSave": {"commit": "4f1c2ab", "message": "Save 2026-10-12 15:40 · moved 2 screens",
               "at": "2026-10-12T13:40:02Z"},
  "lastVersion": {"version": "0.2.0", "tag": "v0.2.0", "commit": "9b77e01", "pushed": true,
                  "release": "https://github.com/ada/harbour-plaza/releases/tag/v0.2.0"},
  "remote": {"name": "origin", "url": "git@github.com:ada/harbour-plaza.git", "kind": "github",
             "ahead": 3},
  "busy": null
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
| Collision budget | 500,000 static collision triangles (0.10 and earlier: 20,000). Core MUST hold static collision in a bounding volume hierarchy so player, pick and placement queries stay logarithmic; above 20,000 triangles it builds the hierarchy off-thread before activation. |
| Extensions | `com.hyprune.builder` 0.1 `{path}`: the project file of a world made with the builder. Optional; cores ignore it when they don't support it. Starters carry `com.hyprune.starter` 0.1. |

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
| `objects.manage` | Import and simplify jobs (reading a user-chosen file), editing, deleting, rechecking and repairing user-folder objects; overlay repair | Reference shell, CLI. Never a world; extensions only with explicit approval. |
| `builder.control` | Creating and editing world folders, locks, markers, sky, checks, Make world, save, discard, release, revert, remote, removing world folders | Reference shell, CLI. Never a world or extension. |

Settings repair needs the existing `runtime.control`; reads need `state.read`.

| Method | Params → result | Grant | Phase |
| --- | --- | --- | --- |
| `objects.import` | `{source: {path} \| {ref}, options?, target?: "user" \| "world"}` → `{jobId}` | objects.manage | P1 |
| `objects.import.revise` | `{jobId, options}` (job in `review`) → `{jobId}` | objects.manage | P1 |
| `objects.import.commit` | `{jobId, manifest: {id, name, category, tags?, surfaces?, license, author, source, class?}}` → `{revision, ref}` | objects.manage | P1 |
| `objects.simplify` | `{ref, parts?: ["render", "collision", "textures", "tiny"], targets?}` → `{jobId}` (ends in `review` with before/after) | objects.manage | P1 |
| `objects.simplify.commit` | `{jobId}` → `{revision, ref, backupId?}` | objects.manage | P1 |
| `jobs.get` | `{jobId}` → the full job record | state.read | P1 |
| `jobs.cancel` | `{jobId}` → `{revision}` (also discards a job in `review`) | the job's grant | P1 |
| `objects.edit` | `{ref, patch}` (`name`, `description`, `category`, `tags`, `traits.movable`, `traits.collidable: null`, `traits.decorative: null`, `license`, `author`, `source`) → `{revision}` | objects.manage | P1 |
| `objects.delete` | `{ref, deleteOriginal?}` → `{revision, backupId?}` | objects.manage | P1 |
| `objects.recheck` | `{ref}` → `{revision, state, errors}` | objects.manage | P1 |
| `objects.export` | `{ref, path}` (a directory the portal returned) → `{jobId}` | objects.manage | P1 |
| `publish.check` | `{ref}` or `{worldId}` → `{eligible, files: [{path, license, author, source, ok, missing}]}` (read-only; the official-org bar) | state.read | P1 (objects), P3 (worlds) |
| `repair.scan` | `{}` → `{issues: [{id, kind, target, problem, actions}]}` (at most 128) | state.read | P1 |
| `repair.apply` | `{issueId, action}` → `{revision, backupId}` | objects.manage, or runtime.control for settings, or builder.control for world folders | P1 |
| `repair.backups` / `repair.restore` | `{}` → `{backups}` / `{backupId}` → `{revision, backupId}` | state.read / as `repair.apply` | P1 |
| `builder.projects` | `{}` → `{projects: [{id, worldId, name, folder, updatedAt, pending, lastVersion, remote}]}` | state.read | P2 |
| `builder.create` | `{name, starter?}` → `{revision, projectId}` (creates the folder, `git init`, first save; then loads it in editor mode) | builder.control | P2 |
| `builder.open` | `{projectId, mode: "edit" \| "play"}` → `{revision}` | builder.control | P2 |
| `builder.close` | `{}` → `{revision}` (returns to the previous world; pending changes stay) | builder.control | P2 |
| `builder.project.update` | `{patch}`: `name`, `landHidden`, `allowTilt`, screen `slot` order, area names, `releaseUpload` → `{revision}` | builder.control | P2 |
| `builder.project.remove` | `{projectId}` → `{revision}` (moves the folder to the trash) | builder.control | P2 |
| `builder.lock` | `{id, locked}` (a map) → `{revision, jobId?}` | builder.control | P2 |
| `builder.spawn.set` | `{pose}` or `{here: true}` → `{revision}` | builder.control | P2 |
| `builder.area.set` / `builder.area.remove` | `{area: {id?, name, bounds}}` / `{id}` → `{revision, id}` | builder.control | P2 |
| `builder.sky.set` | `{source: {path}, license, author, source}` or `{preset}` or `{rotation?, sun?}` → `{revision, jobId?}` | builder.control | P2 |
| `builder.save` | `{message?}` → `{revision, commit, message}`; refused with nothing pending | builder.control | P2 |
| `builder.discard` | `{paths?}` (default all) → `{revision, backupId}` | builder.control | P2 |
| `builder.history` | `{limit?: 1..500, before?}` → `{entries: [{commit, message, at, version?, summary, pushed}]}` | state.read | P2 |
| `builder.revert` | `{commit}` or `{version}` → `{revision, commit}` (a new save); refused while changes are pending | builder.control | P2 |
| `builder.history.open` | `{commit}` or `{version}` → `{revision}` (plays that state read-only) | builder.control | P2 |
| `builder.remote.set` | `{url}` or `{url: null}` → `{revision}` | builder.control | P3 |
| `builder.check` | `{}` → `{jobId}` (collision, navmesh, approach checks; no package) | builder.control | P3 |
| `builder.walkable` | `{show}` → `{revision}` (core draws the last check's navmesh) | builder.control | P3 |
| `builder.make` | `{objectsMovable?}` → `{jobId}` | builder.control | P3 |
| `builder.release` | `{version?, notes?, id?}` → `{jobId}`; refused (`-32005`, rule `release.unsaved`) with pending changes, and with rule `release.unmade` when the saved state has no current Make world | builder.control | P3 |
| `worlds.export` | `{worldId, path}` → `{jobId}` | builder.control | P3 |

`objects.place` places map entries only in editor mode; elsewhere it returns `-32005` with rule
`map.editor-only`. Screens, markers and objects in editor mode use the existing objects methods.
Mutations while the project helper holds the folder (a save, revert or release in progress)
return `-32005` with rule `builder.busy` and `retryable: true`.

**State.**

| Key | Shape |
| --- | --- |
| `jobs` | `{list: [{id, kind, state, stage, stages, progress, source?, class?, startedAtMs, elapsedMs, error?}]}`, at most 16 (running, queued and the last finished per kind). `kind`: `import`, `simplify`, `check`, `make-world`, `release`. `state`: `queued`, `running`, `review`, `succeeded`, `failed`, `cancelled`. Full records (measurements, before/after, proposed manifest, warnings, items) through `jobs.get`. |
| `builder` | `null` unless a world folder is loaded; else `{projectId, worldId, name, folder, mode: "edit" \| "play" \| "history", digest, maps: [{id, dir, locked, collision, state}], screens: [{id, slot, workspace, areaId, approach: "ok" \| "blocked" \| "unchecked"}], spawn, areas, sky, landHidden, checklist: [{id, label, state: "done" \| "open" \| "warning", blocking, message?, show?}], lastCheck, lastMake, vcs}` with `vcs` as in [Remote](#remote): `{branch, head, pending: {added, modified, deleted}, lastSave, lastVersion, remote, busy: null \| "save" \| "discard" \| "revert" \| "release"}`. |
| `objects` | Catalog entries gain `class` (`object` or `map`), `source: "world"` for world-folder entries, `warnings` (measures over their recommendation), `provenance` (`{license, author, source}`, `"unknown"` where unrecorded) and `imported` (`{at, sourceName}` or null). |

`vcs` is refreshed after every helper call and, for edits made outside Hyprune, from a watch on
the folder (debounced 1 s); history is fetched with `builder.history`, never published in state.

**Events.** `job.progress {jobId, kind, state, stage, progress, message?}`, at most 4 per second
per job, plus one on every state change. Notices: `import.started`, `import.review`,
`import.failed`, `import.unsupported`, `import.sandbox`, `import.limit`, `simplify.review`,
`object.edited`, `object.deleted`, `repair.applied`, `repair.restored`, `builder.locked`,
`builder.check`, `builder.made`, `builder.make.failed`, `builder.saved`, `builder.discarded`,
`builder.reverted`, `builder.released`, `builder.release.failed`, `builder.git.missing`,
`builder.remote.auth`, `builder.remote.rejected`.

**Errors.** `-32004` unknown job, ref, project, commit, version or issue; `-32005` refused
(locked, map outside editor mode, read-only source, `release.unsaved`, `release.unmade`,
`release.version`, `revert.unsaved`, `git.missing`, `builder.busy`); `-32007` a validation or placement rule
(`error.data {rule, errors}`); `-32008` a limit (queue full, a job limit, the world budget).

**Paths from clients.** `objects.import`, `builder.sky.set`, `objects.export` and
`worlds.export` take an absolute local path, like `libraries.install`. The daemon resolves it
once, opens it without following a final symlink, and copies (or writes) only that file or
directory. The reference shell passes only paths the portal returned. Core never lists a
directory it was not given.

### Shell

| Piece | Where | Notes |
| --- | --- | --- |
| Import… | Objects tab toolbar | Portal FileChooser with filters for the formats above ([File dialogs](#file-dialogs)); then the job row with progress and Cancel. |
| Review form | Objects tab, modal | Thumbnail, class badge and measured numbers against the recommendations, warnings with **Simplify**, options (units, up axis, lighting, Treat as map), target (My objects / This world), provenance (licence list, author, source, the detected licence text), steps, Add / Change options / Discard. |
| Simplify review | Objects tab, modal | Before/after thumbnails and numbers, errors, Options, Use simplified / Keep original. |
| Entry actions | Objects tab, per entry | Rename, Re-tag, Re-trait, Simplify, Provenance, Re-check, Repair, Delete, Export, Check for official publishing, Build a world from this / Add to this world (maps). A licence chip on every entry ("unknown" when unrecorded); a warning chip when a measure is over its recommendation. |
| Repair | Settings → Repair, and Objects tab | `repair.scan` issues with their actions; backups with Restore. |
| Worlds | Director → Worlds | **I want to build a world**; **My worlds** (world folders) with Edit, Play, History, Remove. |
| Builder page | Director, in editor mode | Maps, screens (slot order), areas, spawn, sky and sun, Hide the land, Allow tilt; Check; Make world and its result with the provenance summary; **Save** (with the unsaved-changes count and an optional message), Discard; **Release** (suggested version, notes, the remote's state); **History**; Version control → Remote; Check for official publishing. |
| Unsaved indicator | HUD, beside the checklist | A dot and count while changes are pending; Save on click. |
| Checklist | HUD, the RFC-0012 tracker component | Items with state and Show me; collapses to "3 of 9" in calm mode. |

### Schema, SDK and tooling

- **Schema:** `import.schema.json`; object format 0.11 (`mount` enabled as above);
  world format 0.11 (`panorama`, `frameObject`, the collision budget);
  `extensions/builder.schema.json`, `extensions/starter.schema.json`;
  `builder/project.schema.json`; `backup.schema.json`; the IPC versions above with the
  inheritance test and the shared version helper.
- **SDK:** types and mock-core support for jobs, builder state, `vcs` and repair;
  `hyprune object import PATH [--license --author --source --map --simplify --to world]`,
  `hyprune object simplify|edit|delete|export`, `hyprune repair [scan|apply|restore]`,
  `hyprune builder create NAME [--starter ID]`, `hyprune builder open|check|make`,
  `hyprune builder save [-m MESSAGE]`, `hyprune builder discard`,
  `hyprune builder release [VERSION] [--notes FILE]`, `hyprune builder history`,
  `hyprune builder revert COMMIT|VERSION`, `hyprune builder remote [URL|--clear]`,
  `hyprune world export`, `hyprune publish check PATH|ID`.
- **Import helper:** `hyprune-import` in the meta repository's packages, with its sandbox
  launcher, the glTF wrap path, the Assimp backend, meshoptimizer, the convex decomposition
  library, the KTX2 encoders, the CPU thumbnail renderer, and the collision, Recast navmesh,
  derived-visibility and blueprint stages shared with the worlds tooling (one implementation,
  two callers).
- **Project helper:** `hyprune-project`, wrapping `git`, `gh` and `hyprune world pack --release`
  as above.
- **Worlds:** the Flat land starter and the builder kit library (screens, markers, sky
  presets) and their releases; checks that each screen asset's anchor is 16:9 and clear of its
  proxy.
- **Core:** editor mode, project-file overlay, map gating, lock collision swap, the collision
  hierarchy for the 0.11 budget, navmesh overlay drawing (world pass, GL state saved and
  restored), panorama sky, frame-object anchors, transient dialogs, the `CHANGELOG.md` entry
  per IPC version.

### Compatibility

- RFC-0011 behaviour is unchanged outside editor mode, except that map-class entries are listed
  and not placeable, with a reason.
- Objects imported here are ordinary 0.9 object directories plus `import.json`. A core or SDK
  whose validator predates `import.json` may list them as invalid; the validator change ships
  with P1, before any importer writes the file.
- Made worlds need a core that supports world format 0.11. Older cores reject them before
  activation (exact versions).
- World folders are git repositories any git tool can open; changes made outside Hyprune show up
  as pending changes. Released packages follow RFC-0015 and install like any other.
- World folders, project files and backups are new; nothing existing is migrated.

## Phasing

| Phase | Delivers | Needs | Proven when |
| --- | --- | --- | --- |
| **P1** | Import (glTF wrap, `.zip`, FBX, OBJ, the rest of the Assimp formats), the sandboxed helper and its safety limits, size classes with warnings instead of refusals, **Simplify** (render, collision, textures) with before/after review, the review, provenance fields (recorded, never enforced), the official-publishing check, `import.json`, kept originals, entry management, object export, repair with backups, file dialogs in the world with the desktop fallback. Maps are importable and listed, but nothing can place them yet. | RFC-0011 P1 (IPC 0.22). | A user imports a `.glb`, an `.fbx` and a zipped glTF scene from the Director without a terminal and places the first two. A 3-million-triangle scene imports with warnings, and one Simplify brings it within the map recommendation with the numbers shown. A crafted archive with traversal, a 3 GiB zip bomb, a parser crash and a 10-minute hang each fail only their job, with the right code and no files left. An import with licence, author and source all unknown is added, placed and exported, and its export carries them as unknown. Repair brings back an object with a broken manifest and a world overlay with dangling records, and Restore undoes both. The dialog opens in the world in a nested session and on the desktop with `ui.file_dialog = "desktop"`. |
| **P2** | I want to build a world: starters, world folders, `git init` and the first save, editor mode; copying into the folder; map placement, alignment and lock with collision up to the 0.11 budget; workspace screens on the `mount` trait and the builder kit; spawn and area markers; panorama skies; the checklist items that need no navmesh; Save, Discard, History, Open and Revert; object format 0.11. | P1; world format 0.9 (object directories in packages). | In a nested session, a user creates a world, places a downloaded CC-licensed level scene, aligns, locks and walks on it, sets a spawn and places two screens; moving a screen into a wall unchecks its item and shows why. The folder shows pending changes until Save, Save makes one commit with the default message, Discard restores the last save, and Revert to the first save makes a new commit without rewriting history. |
| **P3** | `builder.check` with the navmesh overlay; Make world with every stage; Play; Release with and without a remote (local tag; push, tag and GitHub release with RFC-0015 assets); remote settings; world export; world format 0.11 with the collision hierarchy. | P2; RFC-0015 P1 (`pack --release`). | The made world loads in a nested session with both homes on workspaces 21 and 22, selecting each workspace travels to its screen, a window opened there shows on that wall, nothing is reachable outside the playable volumes, derived visibility culls without visible popping across the any-angle sweep, and `hyprune-world-check` passes the package. Release without a remote makes the tag only; with a test remote it pushes, creates the release with the archive, `.sha256` and record built from the tag, and the release installs through RFC-0015. A rejected push and a missing credential each stop with the right item and leave the local tag. |
| **P4** | Composability: placing a made world's map, collision, navmesh and homes as an **area** inside another world (an area package with an attachment pose and connectors), and several world folders merged into one world. | P3; a world-format design for nested collision, navigation and visibility. | — |

Contract changes follow the usual path: RFC amendment, schema version and tests, SDK types and
the core changelog.

## Open questions

1. **Paths or file descriptors.** `objects.import` takes a path from the portal, like
   `libraries.install`. Should the shell instead pass an open file descriptor over the socket,
   so the daemon never resolves a client-supplied path? That needs descriptor passing in every
   shell transport.
2. **Official bar versions.** The official-publishing check accepts CC0-1.0 and CC-BY-4.0.
   Should it also accept CC-BY-3.0? RFC-0015 sets the org policy; the check follows it.
3. **More formats.** USD/USDZ and Alembic are common for scenes; are they worth a backend in
   P1 or later?
4. **Light baking.** Imports are unlit-baked or lit by the sun and probes. Should Make world
   offer an optional lightmap bake through a user-installed Blender, run out of process in the
   same sandbox, and in which phase?
5. **One or more maps.** Up to 4 maps per world (proposed) lets users stitch pieces; is one map
   per world simpler and enough until P4?
6. **Large files in git.** World folders keep files under 64 MiB and don't use large-file
   storage. Should Hyprune offer Git LFS for folders that grow past a size (with RFC-0015's
   warning about LFS quotas), or leave that to the user?
7. **The first save.** Creating a world makes the first commit so Discard and Revert always have a
   base. Is that acceptable as an exception to "commits only on Save", or should creation leave
   everything pending?
8. **Building on installed worlds.** Should **Build a world from this** be offered on installed
   worlds (copying a package and its licence record into a new folder), or only on imports?
9. **Release notes and changelog.** Should Release keep a `CHANGELOG.md` in the folder from the
   notes, as well as the tag message?
10. **Starters.** Flat land first; which others (shallow sea, desert, an enclosed hall) are worth
    shipping, and may third parties publish starters through RFC-0015?

## Amendment: import in the Objects tab (object format 0.11 and IPC 0.27)

**Status: shipped in core 0.9.0.** The first slice of P1: **Director → Objects → Import…** turns a model file into
an object in **My objects** without Blender, and it appears in the catalog at once. It follows
this RFC's flow (choose, review, add) and its rules on sizes and provenance, with a simpler
process model.

**Where it runs.** The import is the SDK CLI's `hyprune object import`, which the shell runs as
its own child process, as the Library tab runs the CLI (RFC-0015 phase 1): `--inspect --json`
first, then the import with JSON lines (`{event: stage | done | error}`). There are no daemon
jobs and no import IPC methods (`objects.import`, `jobs.*`, `…revise`, `…commit` stay this RFC's
design); the compositor never parses a model. Core sees only the finished directory, through
the user folder's watch, and validates it like any other.

| This RFC | As built |
| --- | --- |
| Portal file chooser | The Director's own file browser (the one the Data source editor uses; the Director holds exclusive input), filtered to the importable extensions. |
| Convert, then review, then Add | Measure (`--inspect`), review the options and provenance, then convert and add in one step. The review shows the file's numbers, the units guess and the resulting size: pressing Import confirms them. |
| Sandboxed helper (namespaces, seccomp) | An unprivileged child of the shell. glTF is parsed by glTF-Transform (JavaScript), every other format by Assimp compiled to WebAssembly, so a parser fault stays inside the WebAssembly memory. Remote resources are refused, sources are capped at 2 GiB, Assimp reads at most 256 files and 512 MiB beside the model. The namespace sandbox stays open (P1 follow-up). |
| Formats | glTF and GLB; OBJ, FBX, DAE, 3DS, PLY and STL through Assimp. Not yet: `.zip`, Draco-compressed glTF (refused with `import.draco`), USD. |
| Size classes, maps | Every import is an object. Object format 0.11 turns the per-asset budgets into recommendations (below); maps wait for editor mode. |
| Simplify as a job with before/after review | Decimation, texture shrinking and KTX2 run during the import, to targets set in the review; the result shows the numbers before and after. Simplify on existing entries, repair, editing, export and the publishing check are not in this slice. |
| Convex decomposition | One convex hull (points merged on a grid, at most 1,000 triangles), else the bounding box, or no proxy. |
| Kept originals, `history`, `original` | Not kept; `import.json` records the source's name, format, size and SHA-256. |

**What an import does** (in order): read (glTF-Transform, or Assimp to GLB); drop animations,
skins, cameras, lights, morph targets, points and lines (each listed as a warning); bake node
transforms into the meshes; apply the units (**Auto** guesses from the size in the file: up to 50
units across means metres, up to 5,000 centimetres, more millimetres; or metres, centimetres,
millimetres, inches, feet), the up axis (**Z up** turns +Z to +Y), a turn of 0, 90, 180 or 270
degrees and the pivot (base centre on a floor, back centre on a wall, top centre on a ceiling,
centre when it floats); join primitives by material and weld; decimate with meshoptimizer to the
triangle target (default 50,000; error at most 1 % of the size, then 2 % and 5 %, and a warning
if it stays above); shrink textures to the chosen size (1,024, 2,048 or 4,096 px); build the
collision proxy outside the scene; render a 256 × 256 thumbnail on the CPU (flat shading,
base-colour textures sampled, no GPU); encode textures of 1,024 px and more to KTX2 with Basis
Universal in WebAssembly (colour ETC1S with an sRGB transfer function, data UASTC with Zstandard,
mips; 60 s budget, left-over textures stay PNG or JPEG with a warning); compress the geometry
(meshopt, 16-bit quantisation, as world format 0.7); write `object.json` (format 0.11, `movable`
on the chosen surface with scale 0.25-4, `collidable` when there is a proxy, `lighting unlit` for
**Baked into textures**) and `import.json`; check the staged directory with the shared validator
and rename it into the user folder (a taken id gets `-2`, `-3`). A failed or cancelled import
writes nothing.

**Sizes (object format 0.11).** For ordinary objects (not characters or items) the RFC-0011
per-asset budgets are recommendations: over one is a catalog warning ("(recommended; it still
loads)"), never a refusal. Only hard caps refuse a directory: 2,000,000 triangles, 8,192 px
textures, 1 GiB of GPU memory, 100,000 proxy triangles, 256 files, 512 MiB per directory and
64 MiB per file. Formats 0.9 and 0.10, characters and items keep their budgets as errors. The
per-world user totals (core, every protocol) become 2,000,000 triangles, a 512 MiB GPU pool and
100,000 proxy triangles; they still refuse a placement, as the physical limit.

**Provenance.** As [Licence and provenance](#licence-and-provenance-normative): the review offers
I don't know (default), CC0 1.0, CC BY 4.0, CC BY 3.0, CC BY-SA 4.0, CC BY-NC 4.0 or any SPDX
expression, an author and a source (a link or free text). None is required. `object.json` gets
the licence (`LicenseRef-unknown` when unknown) and an attribution for `"."` with the author
(`unknown`) and, when it is an `https://` link, the source; `import.json` keeps all three as
typed (`unknown` when empty).

**`import.json`** (importVersion 0.1, [schema](/reference/schema/) `v0.11/import.schema.json`):
`{importVersion, source: {name, format, bytes, sha256}, converter: {name, version, backend:
gltf | assimp}, options: {units, scale, up, yaw, surface, maxTriangles, maxTexture, collision,
ktx2, lighting}, measured: {before, after} ({triangles, maxTexture, gpuBytes,
collisionTriangles, extent}), steps (at most 32), license: {spdx, author, source},
importedAt}`. The shared validator checks it beside `object.json` (`validate('import')`); core
checks it in the catalog.

**IPC 0.27 additions.** Catalog entries carry required `warnings` (at most 8: sizes over their
recommendation and other validation notes), `provenance` (null for world package assets, else
`{license, author, source}` from `import.json`, else from the `"."` attribution, `"unknown"` where
unrecorded) and `imported` (null, or `{at, sourceName}` from `import.json`). Older peers see none
of them.


## Amendment: the builder world (world format 0.11, builder/project.json and IPC 0.27)

**Status: shipped in core 0.9.0.** The first slice of P2 and P3: **Director → Builder → Build** makes a world
folder from a name, opens it in editor mode, and the user places imports, workspace screens
and library objects on it, saves (git commits) and releases (git tags). It follows this RFC's
model (a folder that is a git repository, Save as one commit, Release as a tag in RFC-0015's
convention) with a simpler process model and a smaller project file.

**Where it runs.** All folder and git work is the SDK CLI's `hyprune builder` (the project
helper), which the shell runs as its own child process, as for imports: `create`, `list`,
`status`, `make`, `save`, `release`, `sky` and `remote`, each with `--json` JSON lines
(`{event: stage | done | error}`). Core loads folders and writes placements; it never runs git
or touches the network. There are no `builder.*` IPC methods and no jobs yet: the shell opens a
folder with `world.load` of `local.<slug>`.

| This RFC | As built |
| --- | --- |
| The daemon creates the folder | `hyprune builder create NAME` creates `$HYPRUNE_PROJECTS_DIR/<slug>/` (default `$XDG_DATA_HOME/hyprune/projects/<slug>/`; `-2`, `-3` for a taken slug), writes the starter, makes the world and the first commit ("Create <name> from the Flat land starter"). Git 2.30 or newer and a commit identity are required; with none, `--git-name` and `--git-email` store one in the folder's `.git/config` (the page asks for them). |
| Starters as packages | **Flat land** (`flat-land@0.1`) is generated by the CLI, without Blender, CC0: `starter/land.glb` (2,000 × 2,000 m at y = 0, two triangles, a 10 m grid texture with 1 m lines, also the collision), one spawn at the origin facing −Z, a playable box (±1,000 m, −50 to 500 m), and a procedural sky with clouds and a sun, `sky/panorama.jpg` (2,048 × 1,024). |
| `builder/project.json` holds maps, screens, spawn, areas, objects and sky | projectVersion 0.1 holds `{id (local.<slug>), name, starter, base, sky {image, license, author, source}, placements [{id, ref (world/<id>), pose, scale, workspace?, locked?}] (≤ 128), releaseUpload?}`. The rest of the world is `builder/base.json`: the starter's manifest without placements, which core loads in editor mode. Maps, spawn and area markers wait for P2's map work. |
| Make world (13 stages) | **Save makes the world first**: `world.json` = `builder/base.json` + `objectAssets` (`{id, dir: "objects/<id>"}`) and locked `objects` for the placements; each workspace screen bound to workspace 20 + n becomes the home of slot n (anchor `screen-<nn>` at the instance pose × the mount anchor, size × scale, `screenType` `com.hyprune.window`, `mount {type, role: mounted-workspace, interaction: focus-in}`; area `screen-<nn>` with the object's name as `theme`; spawn `home-<nn>` max(2.5 m, 0.87 × width) in front of it on the land, facing it). A screen on workspace 20 or below, or a second one on a workspace, stays a prop with a warning. Provenance: `license` is the SPDX `AND` of every part's, `attribution` has one entry per file (core resolves each path to a file), `ATTRIBUTION.md` one row per part, `LICENSE` lists the licences. Collision, navmesh, playable volumes, visibility and map stages are not run: the land stays the floor. |
| Editor mode: no windows | Not in this slice: screens are homes in editor mode as everywhere (the IPC 0.27 screens), and windows behave as in any world. |
| Editor mode: edits go to the folder | As specified: `objects.place`, `.transform`, `.remove` and `.configure` in a folder write `builder/project.json` (sorted keys, poses rounded to 0.1 mm and 1e-6), never `editor.json`. Leaving the folder writes it and drops its placements from memory. |
| Placing copies | As specified: placing a user or library object in a folder copies its directory into `objects/<id>/` first (once per content; `-2`, `-3` for a taken id), and the placement refers to `world/<id>`. The copy shares the original's decoded asset. |
| Save: one commit | `hyprune builder save [-m MESSAGE]`: make, check the package (tracked and new files minus `.gitignore`, `.gitattributes` and `.github/`, copied aside and validated), `git add -A`, one commit. An empty message becomes "Save <date> <time> · placed 2 objects, moved 1, removed 1, changed the sky"; nothing pending refuses with `save.nothing`. Files over 95 MiB are warned about. Discard, History, Open and Revert are not in this slice. |
| Release | `hyprune builder release [VERSION] [--notes]`: refused with pending changes (`release.unsaved`); the version is the next patch of the latest `v*` tag (`0.1.0` first) or any higher one (`release.version`); the version (and with a remote the published id) is written into `builder/base.json` and `world.json` in a "Release v<version>" commit when it changed, then an annotated tag `v<version>` with the notes. **No remote: that is all.** With a remote: the RFC-0015 assets are built from the tag (`git archive`, so ignored and `export-ignore` files stay out) into the folder's ignored `releases/v<version>/`, the branch and tag are pushed **atomically** (`git push --atomic`: a rejected branch leaves the tag local too), and on GitHub `gh release create --verify-tag` attaches them (else the result says to attach them by hand). `releaseUpload: false` skips the GitHub release. The **published id** for GitHub is `io.github.<owner>.<repo>` with a `hyprune-world-` prefix dropped; other remotes need `--id`. "Make world and save" and the unmade check (`release.unmade`) are moot: Save always makes. |
| The project helper | As specified: git runs with fixed argument vectors, `-c core.hooksPath=/dev/null -c core.fsmonitor=false` (and no commit or tag signing), `GIT_TERMINAL_PROMPT=0`, `GH_PROMPT_DISABLED=1`, `GIT_CEILING_DIRECTORIES` at the folder's parent; never `--force`, reset, rebase, amend, pull or deletions. Errors carry codes: `git.missing`, `git.identity`, `save.nothing`, `make.invalid`, `release.unsaved`, `release.version`, `release.id`, `remote.invalid`, `remote.auth`, `remote.rejected`, `sky.invalid`, `builder.busy` (one save, release or sky change per folder). |
| Sky → Choose image | `hyprune builder sky PROJECT IMAGE --license --author --source`: an equirectangular PNG or JPEG, 2:1, 1,024 to 8,192 px wide (wider is scaled down), stored as `sky/panorama.jpg`; the sun moves to the centroid of the brightest 0.1 % above the horizon when the image has one. All three provenance fields are required. Cube faces, HDR inputs, presets and sun editing wait. The page reloads the world to show it. |
| Remote | `hyprune builder remote PROJECT [URL \| --clear]`, URLs as specified (`https://`, `ssh://`, `user@host:path`). |

**The shell.** A **Builder** tab after Library: **Build a world** (a name, and a commit identity
when git has none) and **My worlds** (each folder with its unsaved changes and latest version,
**Edit**); in a folder, the unsaved changes in words ("Unsaved: placed 3 objects (12 files)"),
**Save** with an optional message, **Release** with a version and notes, **Sky** (the Director's
file browser, then licence, author and source) and **Remote**. Objects are placed from the
Objects tab.

**World format 0.11** ([schema](/reference/schema/world/0.11/)) follows **0.9**:
there is no world format 0.10 (object format 0.10 exists; world formats never needed one). Every
0.9 document is valid as 0.11. It adds `atmosphere.panorama` `{image, projection: "equirect",
encoding?, intensity?, rotation?, maxResolution? (256-2,048, default 1,024), environment?}` (cube
faces wait) and allows directory assets of object format 0.11 (with the `mount` trait;
`frameObject` anchors wait, so made worlds author the screen's anchor themselves). The
equirectangular image's centre looks along −Z and u grows towards +X (to the right when facing
−Z); v = 0 is straight up; `rotation` turns it about +Y. Core resamples it to an sRGB cube with mips
on the loader (supersampled when the image is denser than the faces), uploads it in the prepare
jobs (never in the render pass), draws it as the sky at every sky setting but **off** (the low
preset's gradient included), and without `atmosphere.environment` uses 128 px copies of the faces
as the environment that lights the world. The cube counts against the GPU budget (about 32 MiB at
1,024). `atmosphere.get`, `atmosphere.set` and `state.presentation` never carry the panorama (a
package asset, like environment pixels). The collision budget, `com.hyprune.builder` and
`com.hyprune.starter` extensions are not in this slice.

**`builder/project.json`** ([schema](/reference/schema/) `v0.11/project.schema.json`,
`validate('project')`): placement ids unique (`u-` and 6 hex digits), quaternions normalised, at
most one screen per workspace, the sky licence an SPDX expression. Core validates it on load and
on every write; a file it can't read is never overwritten (the error shows on the page).

**IPC 0.27 additions.** State key `builder`: null unless a world folder is loaded, else
`{projectId (the folder's slug), worldId, name, folder, mode: "edit", revision (core's writes to
the project file: each is a pending change), placements, sky (the image path or null), error}`.
Object refs gain `world/<id>` (a folder's copy) and catalog entries the source `world`. Older peers
see no `builder` key, no `world/` instances and no `world` catalog entries. No new method, event
or grant.

**Packaging.** The package is the folder at the tag minus `.git/`, `.gitignore`, `.gitattributes`,
`.github/`, `builder/cache/` and `releases/`; `builder/project.json` and `builder/base.json` stay in
it, so a released world can be built on again. A released world's id stays its published id in
`builder/base.json`; the folder keeps opening as `local.<slug>`.

## Amendment: the world wizard (builder project 0.2)

**Status: accepted · proposed 2026-10-15; released in core 0.11.0 (builder project 0.2); no IPC or world format change.** **Director → Builder →
New world…** replaces the name-only Build with a four-step wizard, and the first starter is
named **Open Plain**. It implements this RFC's [I want to build a world](#i-want-to-build-a-world),
[Starters](#starters) and the presets of [Sky: panorama](#sky-panorama), within the process
model of [the builder world amendment](#amendment-the-builder-world-world-format-011-builderprojectjson-and-ipc-027):
every step is the SDK CLI's `hyprune builder`, and core only loads the folder.

**The steps.**

1. **Name and starter.** The name, and Open Plain (the only starter for now; the list is
   `hyprune builder starters`). A commit identity is asked here when git has none.
2. **Sky.** Four built-in skies with thumbnails, generated by the CLI (original, CC0): **Clear
   day**, **Sunset**, **Overcast** and **Starry night**, each with a matching atmosphere (sky
   colours, sun or moon, fog, exposure). Or **Use my image…**: an equirectangular PNG, JPEG,
   OpenEXR or Radiance HDR, 2:1 and 1,024 to 8,192 px wide, with its licence, author and source.
   HDR images are tone mapped to sRGB (exposure from the log-average luminance, then the ACES
   fit) after the sun is found in the linear data; the sky colours and the fog are estimated from
   the image's rows. The stored sky is `sky/panorama.jpg`, as before.
3. **Floor.** Five built-in floors with thumbnails (original, CC0, tileable): **Grid** (the Flat
   land texture, every 10 m), **Grass** (4 m), **Sand** (6 m), **Stone paving** (4 m) and
   **Concrete** (8 m). Or the user's tileable PNG or JPEG with its provenance. The **tile** is how
   many metres one copy covers (0.25 to 100). The floor is baked into `starter/land.glb`; a
   user's image is also kept as `floor/texture.jpg` (at most 2,048 px) so the tile can change
   later, and the land is then credited to that image's author and licence.
4. **Where you start.** At the centre of the plain, facing the sun, away from it (the default),
   or with it on the left or right. The CLI also takes any position and yaw.

**Create and go there** runs `hyprune builder create NAME --starter open-plain [--sky ID |
--sky-image FILE …] [--floor ID | --floor-image FILE …] [--tile M] [--facing F | --spawn X,Y,Z
--yaw DEG]`, makes the first save ("Create <name> from the Open Plain starter") and warps into
the folder in editor mode. In a folder, the Builder page shows the same skies and floors as
tiles (one press applies and reloads the world), **Choose image…** for either, and the floor's
tile size: `hyprune builder sky PROJECT --preset ID`, `hyprune builder floor PROJECT (--preset
ID | IMAGE … | --tile M)` and `hyprune builder spawn PROJECT [--at X,Y,Z] [--yaw DEG | --facing
F]`.

**For assistants and scripts** ([RFC-0016](/rfcs/0016-ai-creation/) operation rules): every
command takes `--dry-run` (checks everything, writes nothing, answers what it would do);
`create --if-exists error` fails with `project.exists` and the existing folder's id instead of
making `<slug>-2`; errors carry a stable `code`, a one-sentence `message` and, where there is
one, a `hint` ("Floors: grid, grass, sand, paving, concrete"). Yaw is a heading in degrees, as
core's camera: 0 faces −Z, 90 faces +X. New codes: `project.exists`, `starter.unknown`,
`floor.invalid`, `spawn.invalid`.

**Builder project 0.2** (draft, `v0.11/project.schema.json`): `projectVersion` `0.1` keeps its
exact shape; `0.2` adds the `open-plain@0.2` starter (`flat-land@0.1` stays valid for older
folders), `sky.preset` (a built-in sky's id or null), an optional `floor` `{preset, image, tile,
license, author, source}` (exactly one of preset and image) and up to 512 placements. New folders
write 0.2; a 0.1 folder becomes 0.2 the first time it gets a preset sky or a floor, and keeps
its starter. Core reads both.

**Decisions.** The skies and floors are generated, not shipped, like Flat land (no binary
assets to host, and every folder is reproducible); cube-face skies and editing the sun by hand
still wait; the spawn is the folder's default spawn in `builder/base.json`, not a marker (spawn
markers stay with [Spawn and area markers](#spawn-and-area-markers)).

## Amendment: primitives and materials (IPC 0.31)

**Status: accepted · proposed 2026-10-15; released in core 0.11.0 (IPC 0.31).** Director → Objects → **Shapes** makes simple shapes at
exact sizes, in a colour or a material, and places them like any object; a library of
**materials** holds colours, textures, glow, roughness and metalness. They work in a world folder
(saved in it, so it stays self-contained) and in any other world (saved in the user's own
folders). Modelling stays out of scope: shapes are boxes, not meshes to edit.

**Shapes.** Cube, box, cylinder, sphere, plane (a thin slab), ramp (rising towards −Z) and
stairs (solid steps rising towards −Z, about 18 cm each unless a count is given), each with a
width, height and depth in metres (0.01 to 100) and standing on y = 0. A shape is generated by
the SDK CLI as an ordinary object format 0.11 directory, not drawn by core:

- `object.glb` at the exact size, with UVs in metres on every face (box-mapped), divided by the
  material's tile, so a texture keeps its scale on any size;
- a collision proxy that matches it (a box, a convex hull, or one box per step, so stairs are
  walked up), and `movable` on floors or anywhere, upright or not, scale 0.25 to 4;
- a CPU thumbnail, and `primitive.json` (`v0.11/primitive.schema.json`, primitiveVersion 0.1:
  shape, size, steps, the material's key, name, colour, glow and content digest, the generator).

Its id is the shape and a digest of shape, size, steps and the material's content
(`box-1a2b3c4d5e`): making the same shape twice gives the same directory, and another size or
material gives another one. `hyprune builder primitive PROJECT --shape S --size X,Y,Z [--steps
N] (--material KEY | --colour #rrggbb [--emissive #rrggbb --emissive-strength N])` writes it into
`objects/`; `hyprune object primitive …` into the user's object folder.

**Materials.** `materials/<key>/` in a world folder, or `$XDG_DATA_HOME/hyprune/materials/<key>/`:
`material.json` (`v0.11/material.schema.json`, materialVersion 0.1: name, colour, an optional
texture with its tile in metres, glow colour and strength, roughness, metalness, and the
texture's licence, author and source), the texture, and a 128 px swatch for pickers. A texture is
the user's PNG or JPEG, fitted to a power of two of at most 1,024 px and stored as KTX2 (Basis
ETC1S with mips), or one of the built-in floor textures (grid, grass, sand, stone paving,
concrete), which also work as material keys and are copied into the library on first use.
`hyprune builder material PROJECT KEY [--name] [--colour] [--texture FILE --license --author
--source | --texture-preset ID | --no-texture] [--tile] [--emissive --emissive-strength |
--no-emissive] [--roughness] [--metallic]` sets each given field to the given value. A shape
bakes its material in, so a world package never needs the library at run time; Make world
credits each material's texture in `attribution`.

**Changing a placed shape.** A new size or material makes another directory, and the placement
swaps to it with `objects.configure {patch: {ref}}`, keeping its id, key and pose. Saving a
material answers which shapes it made stale; `hyprune builder rebuild PROJECT [--material KEY]`
makes them again and answers `{swaps: [{from, to}]}`, which the shell applies to every placement
of `from`. Save removes generated shapes that no placement uses (any request makes them again).

**IPC 0.31** (draft; no new method, event or grant), the operation rules of
[RFC-0016](/rfcs/0016-ai-creation/#operation-rules-normative) for placements:

- `objects.place {key?, ifExists?, dryRun?}`: a **key** is a caller-chosen slug (1 to 48
  characters) unique among the world's placements, kept in `builder/project.json` or
  `editor.json`. A taken key is refused with `-32005`, rule `key.taken`, the placement's `id` and
  a hint; with `ifExists: "update"` that placement moves to the pose and scale given (and swaps
  to the ref given) instead, answering `updated: true`.
- `objects.transform`, `objects.configure` and `objects.remove` take `{key}` for `{id}`; removing
  a key that names nothing succeeds with `removed: false`.
- `dryRun: true` on `objects.place`, `.transform` and `.configure` runs every check (the ref,
  budgets, placement rules) and changes nothing; results say `dryRun: true`.
- `objects.configure` patch `ref` (another catalog entry where a user placement stands, with
  placement rules applied to the new asset; a workspace binding stays only on a screen) and
  `key` (null removes it).
- Instances carry `key`; catalog entries carry `primitive` (`{shape, size, material {key, name,
  colour, textured, glow}}`, else null), so a shell can change a shape and keep its material. A `world/<id>` entry generated after a folder loaded is found on
  its first use.
- A world folder holds up to 512 placements of up to 256 distinct assets (other worlds keep 128
  and 32); the per-world triangle, GPU and collision totals still apply. Older peers see no keys
  and at most 128 folder placements.

**The shell.** Objects → **Shapes**: the shapes, size fields (steps for stairs), a colour with
swatches and an optional glow, or a material (the library and the built-in textures), and **Make
and place**, which pockets the shape for tool 5. Beside it the material library with **New
material…** and **Edit**: saving rebuilds the shapes made with it and updates where they stand.
Objects → **Placed**: every user placement's **name** (its key), and for a shape its size and
material with **Change size and material**.

**Decisions.** Shapes are generated folders rather than parametric objects drawn by core: they
use the object pipeline, both renderers, collision, validation and packaging as they are, at the
cost of one small folder per size and material. Non-uniform stretching with the gizmo is not
added (numbers set exact sizes; the gizmo keeps uniform scale). The plane has a thickness (0.02 m
by default) so it is solid from both sides. Data-driven behaviours on any placed object are the
next amendment.

## Amendment: data-driven behaviours (IPC 0.31)

**Status: accepted · proposed 2026-10-16; released in core 0.11.0 (IPC 0.31).** Any object a user places (a shape, an import, a
library object) can follow live data: a textured cube whose height is the CPU load, a bar that
grows with a queue from a JSON API, a lamp that glows when a build fails. This is the subset of
[RFC-0013](/rfcs/0013-live-objects/)'s phase 2 that needs no authored machine: the user binds a
value to a property of the whole object, instead of an asset author binding inputs to slots.

**A behaviour** reads one value and drives one property between **A** (`from`) and **B** (`to`):

| `property` | A and B | Notes |
| --- | --- | --- |
| `scale` | per-axis factors (0.01 to 100) | About an `anchor` face: `bottom` (default), `top`, `left`, `right`, `front` (+Z), `back`, `centre`. A bar grows upward from its base. |
| `move` | metres along the object's own axes | |
| `rotate` | degrees about the object's own axes (applied Y, then X, then Z) | About the `anchor` (default `centre` in the shell). |
| `colour` | `#rrggbb` | Replaces the base colour; a texture stays and is tinted. |
| `glow` | strength 0 to 16, in a `colour` | The object takes the glow colour unless a `colour` behaviour sets one. |
| `visible` | `above` and/or `below` | Shown while `above ≤ value < below`. |
| `texture` | texture repeats (u, v) | `mode: "offset"` slides the texture; `"scroll"` takes speeds in repeats per second. |

- **Input.** `input {source?, key?, min?, max?}`: by default key `value` of
  `com.hyprune.sources.<placement id>`, the source the bundled source helper publishes for a
  `sources.json` entry with that id (as a gauge reads), mapped from 0..100. A command source
  printing JSON or an HTTP source with a `map` ([RFC-0013 phase 2](/rfcs/0013-live-objects/#amendment-data-sources-phase-2-helper-and-shell))
  feeds it; any `data.publish` source works.
- **Shaping.** t = (value − min) / (max − min), clamped to 0..1, then `easing` (`linear`,
  `ease-in`, `ease-out`, `ease-in-out`, `step`), then `smoothing` (seconds to follow a change,
  default 0.3; the first value shows at once). Reduced motion snaps and stops scrolling. Stale,
  missing or unreadable data holds the last value (A before any).
- **Several per object**, at most 8, each with a `key` unique in the placement. Moves, turns and
  scales compose in list order (moves, then turns, then scales).
- **Display only.** Collision, picking, placement rules and the saved pose keep the rest pose;
  a behaviour never moves the object for the walker or for windows. Core draws the result in
  both renderers (the offload worker receives the display transform, paint and texture offset
  with each object's draw state) and culls with the displayed bounds.

**Where they live.** In the placement record: `editor.json` for a placement in an ordinary
world, `builder/project.json` (project 0.2 placements' `behaviours`) in a world folder, so a made
world carries them in its folder. World packages don't author them yet (a later world format).

**IPC 0.31 (draft; no new method, event or grant).** `objects.configure` patch `behaviours` sets
the whole list (`[]` removes it; user placements only; allowed while locked, since only the look
changes), with `dryRun` and the usual `key` selector; an invalid list is refused with `-32602`
and the first problem. Instances carry `behaviours`: `null`, or per behaviour `{key, property,
condition (fresh, stale, missing, error), value (the value read), t (0..1 before smoothing),
behaviour (as set)}`, published when values or conditions change, never per frame.

**The shell.** Objects → Placed → **Behaviours** on every user placement: the list with what each
reads and its live value; **Add** (Grow, Move, Turn, Colour, Glow, Show / hide, Texture); the
editor with A and B typed or **captured** from the gizmo (the editor remembers the rest pose; move,
turn or scale the object with tool 4, Capture A, then B; Save puts it back), the anchor, the glow
colour, slide or scroll, the value it reads, easing and smoothing. **Data source…** opens Objects →
Data sources on the entry for this object's id (a new command entry when there is none), with
Test, Run now and the helper's restart.

**Decisions.** Behaviours act on the whole object, not on authored parts (machines keep slots);
display only, so they never break the walkable world; glow paints the object in its glow colour
(per-instance emission takes the paint colour, as machine palettes do); world packages can't
author them yet.

## Amendment: the checklist, Release checks and editing imports (Phase D)

**Status: draft · proposed 2026-10-16; no IPC, world format or project file change.** The
parts of P1 to P3 that a world folder needs most, within the process model of
[the builder world amendment](#amendment-the-builder-world-world-format-011-builderprojectjson-and-ipc-027):
every step is the SDK CLI, core only loads the folder.

**The checklist** (`hyprune builder check PROJECT [--fresh] [--json]`) runs the
[Checklist](#checklist) items that apply to a folder on the Open Plain and caches the result in
the ignored `builder/cache/check.json` by a digest of the project, the base and every placed
object's files. Each item is `{id, label, done, blocks, level (done, open, warning), message,
hint?, target? (a placement id), key?, show? {position}}`; the result adds `ready` (no blocking
item open), `homes` (each home screen's anchor, standback and heading, and whether it is
reachable), the walk statistics, the totals and the publishing parts.

| Item | Blocks Release | As built |
| --- | --- | --- |
| `spawn.floor` | yes | A walkable floor within 0.35 m under the spawn, the capsule clear, inside the playable volumes. |
| `screens.count` | no | Two or more workspace screens with a home (a recommendation in a folder: a world without homes still works). |
| `screen.approach` (per screen) | yes | The [approach checks](#approach-checks-normative): upright within 10°; a floor under the standback (the highest within 4 m below the bottom edge), clear and playable; the clear box against every other object's collision proxy; rays from the eye at the standback to the centre, the corners inset 5 % and the edge midpoints against every other object's rendered triangles; the screen rectangle grown by 5 cm against rendered triangles, and the screen's centre inside another object's solid; the bottom edge 0.2 to 3 m above the floor; reachable from the spawn; two screens' clear boxes may not overlap. The message names the objects in the way by name and key. |
| `walk.area` | yes | Every home's standback is on the spawn's walkable island; walkable islands over 25 m² that the spawn can't reach are a warning. |
| `budgets` | yes | The per-world totals core enforces (placements, assets, triangles, GPU pool, collision triangles). |
| `sizes` | no | Objects over the recommended 50,000 triangles or 2,048 px, with Simplify as the hint. |
| `rights` | no | Parts (the sky and floor images, textured materials, imported objects) with an unknown licence, author or source. |
| `publish.official` | no | The official-publishing check: every part CC0-1.0 or CC-BY-4.0 with an author and a source. |
| `save` | no | No pending changes. |

**Walkability** is a layered height grid instead of a Recast navmesh: 0.15 m cells (larger when
the area would exceed 3 million cells) over the bounds of every placement, the spawn and the
standbacks plus 4 m; every collision triangle (the land and each placement's proxy, posed)
crossed by each cell's vertical line; walkable floors are upward faces with normal y ≥ 0.65,
standable where the 1.8 m above is free in the cell (the first face above is not one leaving a
solid) and above the climb height in the cells within 0.3 m; neighbours join when their floors
differ by at most 0.35 m; the grid's edge joins the open plain around it. No overlay is drawn
yet (core exposes no draw channel for it).

**Make world** uses the checklist's standbacks: a home spawn stands on the floor in front of
its screen (a platform's top, not only the land), and a reachable home gets a placement zone
`zone-<slot>` beyond the standback (0.5 to 2.5 m further, the screen's width, 0.5 to 2.5 m above
the floor, window sizes 1.6 × 0.9 and 3.2 × 1.8, clearance 0.15) listed in its area's
`freePlacementZones`. Collision stays the objects' own proxies over the land; navigation,
playable volumes beyond the starter's box, derived visibility and the map stages are not run on
a folder (an open plain with objects draws everything; they come with maps).

**Release** runs the checklist first (stage `check`) and refuses with `release.check` (`data.items`:
the open blocking items) while a blocking item is open; `--skip-check` releases anyway with a
warning. The result carries `publishing {officialEligible, notOfficial[]}`. Licences never block
([Licence and provenance](#licence-and-provenance-normative)).

**Imports from a `.zip`.** `object import` and `--inspect` take a `.zip` holding a model and its
files. The central directory is checked before anything is unpacked: stored or deflated entries
only, at most 4,096 entries and 2 GiB unpacked (1 GiB per entry, a ratio of at most 1,000), no
absolute names, `..`, drive letters, control characters, encryption, symbolic links, ZIP64 or
duplicate names; sizes are enforced again while inflating. The model is the only one in the
archive, else the glTF/GLB, else `--entry PATH` (refused with `import.entry` and the list of
models, which the Director shows as a chooser). Licence and readme files in the archive are
shown in the review as suggestions. `import.json` records the archive (`name` is
`<archive>!/<entry>`, `bytes` and `sha256` the archive's) and a first step "unpacked …". Error
rule `import.archive`.

**Editing an import after the fact.** Imports keep no original, so these start from the
converted `object.glb`; each keeps a backup in `$XDG_STATE_HOME/hyprune/backups/` (`backup.json`
`{kind, target, ref, reason, createdAt, files}`; the newest 32, none older than 30 days), swaps
the directory atomically, takes `--dry-run`, and works on `user/<id>` or a folder's copy
`world/<id>` (`--project`):

- `object fit REF`: how it is fitted now (`import.json` options) and whether the next two apply.
- `object adjust REF [--units U | --scale X] [--up y|z] [--yaw 0|90|180|270] [--surface S]`:
  absolute values as at import; the change from the recorded fit is applied, the pivot set again
  for the surface, the proxy rebuilt, the bounds and `import.json` options updated, a step
  appended. The thumbnail is kept unless the turn changes.
- `object simplify REF [--max-triangles N] [--max-texture PX] [--collision C]`: decimates again
  (meshoptimizer), shrinks PNG and JPEG textures (KTX2 textures keep their size), rebuilds the
  proxy; the result has the numbers before and after.
- `object repair REF`: when the validator refuses the entry, recompute the bounds, drop traits
  naming missing nodes and traits the object format doesn't know, drop a missing thumbnail,
  then validate; `repair.nothing` for a valid entry, `repair.failed` with Delete or Restore as
  the hint. `object restore BACKUP-ID` puts a backup back (backing up what it replaces).

Only objects whose traits are `collidable` and `movable` (imports) can be re-fitted:
re-fitting merges meshes, which would break traits that name parts (`object.unsupported`).
Generated shapes change through the shape tools instead. A folder's copy shows after the
folder reloads (core reads folder entries when it loads them).

**The shell.** The Builder page lists the checklist (re-run 1.5 s after each change and after
each job) with **Show me** (a waypoint at the item's place); Release names the open blocking
items, and a refused Release offers **Release anyway**; a finished release shows the
official-publishing line. Objects → Import accepts `.zip` (with the model chooser and the licence
suggestions); Objects → Placed shows **Model** for imports (the fit, Adjust, Simplify); an invalid
entry's card offers **Repair**.

**Decisions.** Blocking items stop Release, not Save (Save always makes, and a folder is always
saveable work in progress); the checklist runs in the SDK so the Director, the CLI and the MCP
server (RFC-0016) share it, and `builder.check` with a navmesh stays this RFC's later design;
`screens.count` is a recommendation; folders skip navigation, visibility and the map stages.
