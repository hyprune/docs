---
title: "RFC-0004 — World packages"
description: "Data-only glTF worlds with explicit spatial metadata and asset provenance."
---


**Status: proposed v0 · 2026-10-07 · Implementation target, pending owner review.**

## Decision and package layout

A world is an immutable, data-only directory. Its entrypoint is `world.json`, validated by `schema/v0/world.schema.json`; geometry uses [glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), `.gltf` or `.glb`. No Lua, executable hooks or downloaded resources. User placement overrides live in core's separate per-user state, keyed by world ID, package version and anchor ID; an update never edits the installed package.

```text
com.hyprune.observatory/
  world.json
  scene.gltf                  # scene.glb is equally valid
  geometry/                   # external glTF buffers, when needed
  textures/                   # base color, normal and lightmap textures
  audio/                      # optional local ambience
  LICENSE                     # declared content license
  ATTRIBUTION.md              # creators, sources and modifications
  preview.png                 # optional original preview
```

Manifest fields: `formatVersion: "0.1"`, reverse-domain `id`, SemVer `version`, `name`, `license` (SPDX expression), `scene` (relative path), `defaultSpawn`, nonempty `spawns`, and `attribution` (nonempty array of `{path, author, license, source?}`). Optional `description`, `preview`, `zones`, `anchors`, `navigation`, `collision`, `audio`, `lightmaps`, `extensions` and `requiredExtensions`. Every shipped asset must be covered by attribution; `path: "."` covers all package contents as a baseline, more specific paths override it. Sources are provenance URLs, never fetch instructions.

Paths MUST be plain package-relative POSIX paths, no leading slash, empty segments, dot segments, backslash, URI schemes, percent escapes, query or fragment. `.` is allowed only as the attribution baseline. Resolve each path beneath the package root; reject symlinks and glTF external URIs escaping the root. Reject embedded scripts and remote/data URIs in v0. GLB BIN chunks and image bufferViews are allowed. Distribute directories or `.tar.zst` archives with one root package; extraction rejects links, devices, absolute paths and traversal. Installer caps: 1 GiB expanded, 10,000 files, 128 MiB single file. Archive installation is later SDK work, not implemented by the schema CLI.

## Coordinate and identity contract

Use glTF's right-handed coordinates: +Y up, meters, radians, quaternion `[x,y,z,w]`. Camera forward is -Z; surface front is +Z. `pose` contains `position: [x,y,z]` and normalized `rotation: [x,y,z,w]`. World scale is exactly one meter per unit. An anchor's `size: [width,height]` is meters. IDs inside a package are stable lowercase slugs and unique within their collection. Do not use node names as identifiers: manifest `node` is a zero-based index in the entry glTF's nodes array, resolved on each package load.

Spawn and anchor poses are **world space**; their optional node is an authoring association, never an additional transform. Geometry used for collision and navigation uses the referenced node's complete glTF world transform. Reject multiple-parent nodes, cycles and nonfinite transforms. Spawn orientation and anchor orientation must be normalized within 0.001. Re-exporting node indices requires a package version increment; author tools rewrite references.

## Spatial metadata (normative v0)

| Field | Data and behavior |
| --- | --- |
| `spawns` | `{id, pose, node?}`. `defaultSpawn` must exist. Validate a 0.3 m radius, 1.8 m standing capsule at each spawn; author must provide an unobstructed default. Runtime rechecks against loaded collision; invalid spawn rejects activation. |
| `zones` | `{id, name, bounds: {min: vec3, max: vec3}}`; world-space AABBs with min < max per axis. Overlap is allowed; all containing zones are active. Zone labels do not grant permissions. |
| `anchors` | `{id, pose, size: vec2, screenType, node?}`. Rectangular front-facing interactive area; binds a screen type ID, never a window address. User chooses actual application binding. |
| `navigation` | `{kind: "mesh", node, agentRadius, agentHeight}`. Triangular walkable navigation mesh; runtime checks it against collision. No automatic movement script. |
| `collision` | `{node, shape: "mesh" \| "convex", layer: "static"}` entries. v0 is static geometry only; dynamic objects require a later contract. Visual geometry is not automatically collision. |
| `audio` | `{id, path, position, radius, gain, loop}`. Local Ogg Vorbis or WAV, positional attenuation to silence at radius; gain 0..1, user volume/mute always wins. Missing optional audio disables that emitter with a notice. |
| `lightmaps` | `{material, texture, texCoord: 1, encoding: "linear" \| "srgb", intensity}`. Material and texture are glTF indices; details below. |

All optional arrays default to empty. Missing navigation disables assisted walking; missing collision allows only explicit free-flight, never implied safe walking. v0 requires at least one spawn. Unknown screen types show a labeled placeholder and do not execute or install anything.

## Lighting contract

Keep tiled material UV0 and separately packed, non-overlapping lightmap UV1 (`TEXCOORD_1`). A lightmap entry binds to a glTF **texture index**, not the occlusion slot. Every primitive using that material must contain TEXCOORD_1. Each material may have at most one lightmap entry. This is manifest-side Hyprune metadata; do not invent a registered Khronos extension name. Material normals, roughness and albedo retain their glTF meanings.

v0 lightmaps store normalized RGB diffuse irradiance, excluding albedo and emission. Decode base color from sRGB exactly once. Decode lightmap according to explicit encoding (`linear` means raw linear samples; `srgb` means decode once). Compute `baseColorLinear × lightmapLinear × intensity + emissiveLinear` for the baked diffuse path; do not add the same direct diffuse light again. Dynamic/specular terms are separate. Tone map once, encode for the output once. Clamp UV1 sampling at atlas edges with authored gutters and mip-safe padding. v0 supports PNG lightmaps; HDR encodings need a future version. Missing declared lightmaps or UV1 is a validation failure, not an unexplained lighting fallback.

A single baked color atlas is permitted for deliberately unlit art, but is not the recommended world pipeline: it throws away independent texture detail and lighting control. Use standard `KHR_materials_unlit` for that case. Core advertises its supported glTF extensions and rejects unsupported `extensionsRequired`. Optional visual glTF extensions may fall back according to glTF rules.

## Extensions and versions

`extensions` maps reverse-domain names to JSON objects; `requiredExtensions` lists the keys a loader must understand. Unknown optional entries are ignored with a diagnostic; unknown required entries reject the world before activation. No extension may override path safety, execute code, or weaken provenance rules. The built-in metadata above is versioned directly by `formatVersion`, not repeated in `extensions`.

`formatVersion: "0.1"` is exact. A new structural or semantic contract gets a new identifier; core rejects unsupported versions. `version` is the author's SemVer package version. Content changes require a new version and package digest; installations are immutable. Experimental formats are not silently migrated. Tools must write migrations to a new directory and show a report.

## Validation and activation

1. Parse bounded JSON and validate the manifest against the offline schema.
2. Check IDs, references, paths, quaternion normalization, AABBs, and attribution coverage.
3. Validate the scene with the Khronos glTF validator, then check node/material/texture references, UV1, audio codecs, image dimensions and supported required extensions. Budget GPU resources before upload (initial ceiling 512 MiB world textures/buffers per world; reject over-budget assets or offer an explicit lower-detail package).
4. Build collision/navigation off-thread; check spawns and stage GPU uploads on the render owner thread within a bounded budget.
5. Activate scene, anchors, movement origin and audio atomically at a frame boundary; publish one state revision. Keep the old scene until readiness; on failure release staged resources and leave the old scene active.

The small schema CLI covers steps 1 and manifest-local parts of 2. It is **not** an asset, archive, glTF or rights audit. SDK's future `hyprune world check` will add the other stages and deterministic package digests. M0 can accept a minimal original room with spawn and no optional features; it must reject required features it cannot implement.

## Rights and examples

Official worlds must be original, CC0 or CC-BY-4.0 assets with traceable attribution. Prefer original content released as CC-BY-4.0; keep source assets and reproducible export instructions. Tools/scripts are MIT. Third-party files retain their original license and attribution. The schema accepts SPDX expressions for interoperability, but official-world review applies this narrower policy. No Destiny/Bungie assets, meshes, textures, derived scenes, thumbnails or branding may enter these repositories. Hypr3D is a lessons-only historical reference.
