---
title: "RFC-0001 — Umbrella architecture"
description: "Repository boundaries, ownership and licensing for the Hyprune ecosystem."
---

**Status: proposed v0 · 2026-10-07 · Implementation target, pending owner review.**


## Decision

Hyprune is an umbrella project under [github.com/hyprune](https://github.com/hyprune). It starts as an explorable desktop environment for Hyprland and grows through stable contracts into a framework for world-driven desktops. It is new code: Hypr3D supplies lessons, not inherited architecture, source layout or assets.

A repository boundary follows a release and ownership boundary. Keep the compositor dependency small. Worlds must not contain shell logic; shells must not own physics; extensions must not reach into Hyprland internals. Alternative shells are first-class clients of the same protocol.

## Repository map

| Repository | Owns | Excludes | License |
| --- | --- | --- | --- |
| **core** | Hyprland adapter/plugin, helper daemon, scene/runtime, rendering, capture, trusted input, authoritative state | QML UI, official world art, third-party native plugins | MIT |
| **shell** | Reference Quickshell UI, launcher, overlays, settings presentation, IPC client integration | Physics, compositor hooks, authority over permissions | MIT |
| **worlds** | Official original environments, source scenes, exports, provenance, reproducible asset recipes | Executable world behavior, ripped/derived game assets | CC-BY-4.0 content; MIT scripts |
| **sdk** | Client libraries, extension scaffolding, world tooling, packaging and conformance harnesses | Hyprland ABI bindings, schema ownership, a second daemon | MIT |
| **schema** | Versioned machine-readable contracts, fixtures and lightweight validation | Renderer or end-user UI | MIT |
| **docs** | Website, normative RFCs, concepts, guides, roadmap and decision record | Generated API source or executable runtime | MIT original prose/code/art |
| **.github** | Organization profile, community policy and default templates | Product configuration | MIT except attributed policy text |

Shared assets and standalone examples repositories are created only when independently maintained consumers need them. Until then, keep examples with their API/tool owner and assets with their world or shell. Do not create a central dumping ground.

MIT keeps code and original documentation easy to reuse in an emerging ecosystem. Apache-2.0 offers an explicit patent grant, but we choose a consistent MIT baseline now rather than mixed code obligations. Official world artwork uses attribution-preserving CC-BY-4.0, with CC0 dependencies permitted and attributed. Third-party license notices always survive; the worlds umbrella license does not relicense upstream files. Review any later license change explicitly; do not promise unilateral relicensing of outside contributions.

## Dependency and release rules

`schema` is the contract source. `sdk` consumes a pinned schema release. `core` and `shell` consume matching contract versions; neither requires the other's implementation sources. `worlds` declares an exact supported format. `docs` describes these contracts and mirrors released schemas at stable URLs. Runtime never fetches a schema from the website to decide whether data is safe.

Repositories release independently with SemVer tags. A compatibility table in each core release records exact Hyprland commit/build, protocol versions, world formats, extension API and tested shell release. No claim of stable Hyprland plugin ABI across versions: rebuild and test against the exact compositor target, refuse loading a mismatch. First interfaces are `0.1`; first packages are `0.1.0`, all experimental.

Cross-repository changes start as an RFC amendment plus schemas/fixtures. Publish their commit IDs in dependent PRs; land consumers only after agreement. A schema change must include negative fixtures, migration notes and a changelog. Docs links should identify released tags when claiming compatibility. No circular source dependencies, git submodules, or automatic tracking of main.

## Ownership and authority

The founding owner is interim project steward. Each repository can gain maintainers through reviewed contributions; protocol, security and licensing changes require steward review plus a relevant maintainer once one exists. Until there are two maintainers, document the single-reviewer exception openly. See [governance](/governance/).

Core owns user approvals and enforcement. Shell displays approved actions; it cannot approve its own grants. Content declares needs without granting them. Extension manifests are requests, never authority. Hyprland remains the compositor, seat and session-lock authority. If a helper or shell fails, the desktop remains reachable.

## Rejected direction and acceptance

A monorepo would make atomic changes convenient, but couples art, runtime ABI churn, shell releases and tooling unnecessarily. Repository count is intentionally small and growth must have an owner. M0 acceptance is a working round trip across independently built core/shell/schema, an original minimal world, a documented desktop escape, and no prototype asset dependency.
