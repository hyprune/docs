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

## Amendment M1: material profile, format 0.2

Format `0.2` uses `hyprune/schema/v0.2/world.schema.json`. Its manifest fields are unchanged from `0.1`; the version identifies the stronger material rendering contract below. Core continues accepting `0.1` packages. IPC versions are independent. No runtime shader source, texture-generation service, or proprietary assets are implied by this profile.

* Honor each glTF texture's sampler: REPEAT, MIRRORED_REPEAT and CLAMP_TO_EDGE independently on S/T; all six minification filters and both magnification filters. If omitted, choose LINEAR_MIPMAP_LINEAR / LINEAR and REPEAT. Generate a full mip chain. Anisotropy is a runtime quality setting, capped at supported hardware limits; core M1 uses up to 8× with trilinear/linear samplers and preserves explicit nearest sampling.
* Support `KHR_texture_transform` on baseColorTexture, normalTexture, metallicRoughnessTexture, occlusionTexture and emissiveTexture. Apply `offset + rotation * (scale * uv)` using radians, including the extension's texCoord override. Core M1 accepts UV0 and UV1; reject a referenced missing/unsupported set rather than silently sampling UV0. Negative scale and mirrored repeats are legal. Required `KHR_texture_transform` is supported.
* UV0 may tile outside [0,1]. Trim sheets use ordinary glTF UVs and transforms: repeat along the strip, clamp across it, and pad strip borders for mip filtering. Do not clamp all material coordinates or repack a material atlas at runtime. Put unique baked irradiance islands on UV1 with sufficient gutters; trim repetition must not repeat lightmaps.
* Base color and emissive images are sRGB; factors are linear. Normal, metallic-roughness and occlusion images are linear data. Generate color mipmaps in linear light (sRGB texture storage), including when one image has both color and data uses. Normal XY uses `normalTexture.scale`; normals follow glTF +Y. Metallic is B, roughness is G, occlusion is R, with their glTF factors/strength. Authors should specify metallicFactor explicitly: glTF's default is 1, not dielectric. Supply roughness detail rather than putting lighting/highlights into base color.
* Use a tangent frame or a derivative cotangent frame. M1 derives the frame from world-space position and the normal slot's transformed UVs; this supports meshes without TANGENT and respects mirrored islands. Degenerate UV derivatives fall back to the geometric normal. Supplied TANGENT is not required by this implementation.
* Manifest lightmaps remain the separate UV1 irradiance contract. They are **not** occlusionTexture. They use clamp/linear sampling, the manifest encoding and intensity, and no material texture transform. Baked diffuse remains base × irradiance. Metallic surfaces suppress diffuse; roughness controls a cheap view-dependent key-light and analytic sky specular approximation. Multiply both specular components by baked irradiance visibility so unlit corners do not acquire bright reflections. Normal detail may modulate baked diffuse locally; do not add a second full direct diffuse light to a bake. Emission remains additive. Apply tone mapping and display encoding once; preserve live application color separately.

Core M1's fixed key direction is normalized (0.3,1,0.5), with a cool analytic sky. Roughness is clamped to 0.08 for stable low-cost highlights. This is a documented approximation, not a complete glTF reference PBR renderer: no environment cubemap, shadows, clearcoat, transmission, or material-extension promises. SSAO is deferred pending measured budget; occlusionTexture is supported. The original procedural material laboratory in core exercises tiling, trim strips, transforms, normal maps, channel swizzles and roughness/metalness variations.

Normative glTF behavior: [glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) and [KHR_texture_transform](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_transform). The irradiance/specular approximation and supported UV-set limit above are Hyprune profile choices.

M1 bounds exported zone metadata to 128 entries and 64 KiB serialized JSON so the revisioned IPC snapshot remains within its private bridge budget. Oversized metadata rejects loading before GPU activation. Material GPU accounting includes both color/data views and every mip level within the existing 512 MiB world budget.

## First-session optional Map profile

World 0.1/0.2 remain unchanged. The optional extension `com.hyprune.map` version `0.1` contains `{version,path,projection:"xz",north:[0,0,-1],bounds:[minX,minZ,maxX,maxZ],worldToMap:[a,b,c,d,e,f]}`. The local safe SVG path and normalized affine map follow RFC-0008. No extension is required to load a world. The reference integration also recognizes the existing `com.hyprune.switchyard.map` 0.1 authoring proposal, translating its documented 900×1000 blueprint transform (u=(450+19*x)/900, v=(200-18*z)/1000) into the wire descriptor. This explicit compatibility adapter does not alter the package or infer an undocumented transform from bounds. Its route-node metadata supplies named navigable Map places; nodes are feet positions, converted to eye positions by core. It is static data and establishes no executable movement provider or pathfinding promise. Future packages should use the shared affine profile.

Window capture uses eligible `com.hyprune.window` anchors in manifest order for the developer default docking layout, with anchor pose/size authoritative. It preserves aspect ratio within the anchor. No anchor launches an application; the trusted developer harness supplies live apps. User-managed persistent bindings remain future work.

## Amendment M2: workspace homes and rendering, world format 0.3

World `0.3` uses `schema/v0.3/world.schema.json`; 0.1/0.2 remain accepted.
An **area is one workspace's home**. `areas` declares up to 32
`{id,workspaceSlot,primaryAnchor,toolAnchors,dataAnchors,theme,spawnId?,freePlacementZones?}`.
`workspaceSlot` is a two-to-four-digit authoring string (e.g. `"01"`), never a
compositor workspace ID. Primary and tool/data IDs have exactly one area owner.
The primary anchor has role `mounted-workspace`. Tools belong to this same home;
additional workspace homes repeat a thematic kit under new stable IDs. `spawnId`
selects a feet-position arrival; absent it, core derives a collision-checked
standback point facing the primary wall. Actual workspace IDs are user bindings,
not instructions in immutable world data.

Anchors gain `mount:{type,role,interaction,frameNode?,limits?}`. Types are
`facade-wall`, `hanging-wall`, `wall-inset-console`, `banner`, `lectern`,
`operator-desk`, `field-rig`, `kiosk-pillar`, `globe`, `crate`,
`blast-door-screen`, `terminal-bench`, `radar-dish`. Roles are
`mounted-workspace|tool-mount|data-object`; interaction is respectively
`focus-in|in-place|none`. `frameNode` identifies the physical frame/bezel in the
scene, never an input plane transform. The anchor's exact quaternion and size
remain authoritative, including tilted lecterns. Optional `limits` contains
`minAspect,maxAspect,minSize,maxSize`: reject incompatible sources rather than
stretching pixels. World-space surface front remains local +Z.

Non-planar `dataObjects` declare `{id,areaId,pose,mount,node?}`. Their mount
role is `data-object`, interaction `none`; area `dataAnchors` owns each ID.
Core publishes identity and pose, plus a publisher source binding; the shell or
extension provides its presentation.

`placementZones` declares `{id,bounds:{min,max},windowSizes,clearance}`; area
`freePlacementZones` lists the string IDs of its reserved volumes. Bounds are metre AABBs;
clearance is 0.04–1 m. These are validated opportunities for placement, not a
permission to intersect collision. Lumen Reach reserves 4 m tool approaches,
16 m primary-wall standback, 1.6×0.9 and 3.2×1.8 m rectangles, and 0.15 m
clearance. World authoring must audit visible geometry as well as collision.

The explicit compatibility adapter for optional
`com.hyprune.lumen-reach.mounts` version 1 accepts `areas`, `mounts`, `objects`.
Areas retain the fields above; authoring `name` and approach annotations are
ignored. Mounts contain `{anchorId,areaId,workspaceSlot,mountType,role,frameNode?,limits?}`;
roles `tool` and `data` normalize to `tool-mount` and `data-object`. Objects
`{id,pose,mountType,areaId,workspaceSlot,node?}` remain separate from planar
windows. `com.hyprune.lumen-reach.placement` version 1 supplies `zones`.
Unknown optional namespaces retain the old ignore behavior. Base Lumen Reach
packages can stay format 0.2 with `com.hyprune.window` screen anchors; adapters
validate normalized 0.3 metadata, ownership, slot matching, poses and references.
Installed packages are never rewritten.

Optional `atmosphere` contains `fog:{color,density,heightFalloff,baseHeight,excludeUnlit}`,
`sky:{zenith,horizon,ground,sun:{direction,color,intensity,angularRadius}}`,
`exposure`, `toneMapping:aces|reinhard|linear`, and
`bloom:{strength,threshold,radius}`. Colors and radiance are linear RGB; exposure
is a positive linear multiplier; FOV is a runtime control in degrees. Fog is
camera-relative with integrated exponential height density along the view ray;
`excludeUnlit` protects authored unlit sky art. Sun direction is world-space,
angular radius in radians. Bloom extracts HDR world radiance above threshold,
downsamples and applies a normalized separable Gaussian kernel. Live app pixels
bypass world exposure, fog, tone mapping and bloom.

Optional `atmosphere.environment` contains six local PNG/JPEG square `faces`
in OpenGL +X,-X,+Y,-Y,+Z,-Z order, `encoding:srgb|linear`, linear `intensity`,
Y-axis `rotation` radians and `maxResolution` 16–512. Each face must be ≤2048²;
core resamples and GGX-prefilters a complete linear HDR mip pyramid on a CPU
worker, then uploads RGBA16F. A procedural gradient/sun cubemap is the default.
Reflection roughness selects a filtered mip; baked diffuse irradiance remains
separate. This is static environment IBL, with no SSR or geometry reflection
claims. Capture original environment faces near wet floors/practicals to retain
architecture and warm light details. Core's high tier currently uses 128² faces;
Intel uses 64² probes, 2× MSAA, at most 2× anisotropy, half-resolution bloom and no SSR. Texture/mip storage counts
against the world budget. Reflection probes may follow under a versioned contract.

Honor glTF OPAQUE, MASK (factor × texture alpha versus cutoff) and BLEND.
Opaque/masked geometry writes depth; blend geometry sorts back-to-front per
primitive and does not write depth. Interpenetrating transparent geometry may
need author splitting; exact order-independent transparency is not promised.
Honor doubleSided with reversed back-face lighting normals, and
[KHR_materials_emissive_strength](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_emissive_strength)
as an HDR multiplier before bloom and exposure. The M1 irradiance/color-space
contract remains unchanged. M2 fixtures make alpha sorting/masking, fog camera
translation, sky exclusion, roughness reflections, HDR bloom and app-color
preservation independently observable.

The optional `com.hyprune.lumen-reach.routes` version 1 adapter accepts at most
64 `nodes:{id,position}` and 256 `edges:{from,to,width}`. Node positions are
capsule feet in metres; runtime places and path points add the 1.7 m eye offset.
Edges are bidirectional, reference distinct declared nodes, and have width
0.6–100 m. Repeated undirected edges are invalid. Core does not infer stairs;
authored ramp vertices and landings must remain explicit in the graph.
A one-destination `route.set` pointing at a declared node expands through the
shortest graph path from the nearest node to the current camera. Multi-point
routes retain caller-specified paths. The connector to the first node and every
path segment still use the capsule solver: an obstruction stops autodrive.
Disconnected declared destinations are rejected. Arbitrary off-graph targets
retain explicit direct-route behavior. The legacy route namespace keeps its
existing place-only behavior.
