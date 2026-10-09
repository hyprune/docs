---
title: "Proposed amendment: world HUD styles"
description: "Optional declarative world package skins for shell-owned HUD concepts."
---

Status: **proposed**, implementation prototype in shell. Amends RFC-0004 and
RFC-0008; does not alter frozen world or IPC versions. Requested 2026-10-08.

## RFC-0004: optional package extension

A package may declare
`extensions["com.hyprune.hud-style"] = {"theme":"hud/theme.json"}`.
It must remain optional: an unaware shell renders its normal HUD.
The proposed canonical schemas are `extensions/hud-style-manifest.schema.json`
and `extensions/hud-style.schema.json` in the schema repository.

Theme `version: 1` contains optional `colors` (accent, foreground, muted, tile,
outline, scrim), `stroke` (width 1–3, outline/shadow), `corners`
(square/bevel/round), package `font` (TTF/OTF), `icons`
(navigate/window/path/position SVGs), and `warp` (default/ribbons/soft).
Every color is opaque `#RRGGBB`. Missing properties inherit user concept tokens.
Paths must start `hud/` with safe ASCII path components; neither URLs, traversal,
absolute paths nor symlinks are allowed. No executable extension language.

## RFC-0008: rendering and user control

The selected concept defines geometry and semantics; the active world may only
reskin shell-owned HUD decoration and the warp effect. It cannot alter labels,
input bindings, hit regions, Director menus, emergency controls or core overlays.
A saved Appearance setting, **Use world HUD styles**, defaults on and overrides
world preference. On world exit or missing/invalid style, restore concept tokens.
Color changes interpolate over 420 ms; reduced motion applies immediately.
Fonts and SVGs never change layout constraints or the HUD's passive input mask.

The launcher resolves assets from an explicitly authorised installed package,
matched to the authenticated active world ID. A future versioned core metadata
contract should expose the resolved package identity/root, or provide bounded
asset reads. Manifest-supplied roots are not authority. Until that contract lands,
only launcher-authorised package paths can provide styles.

## Validation boundary

Validate theme JSON before loading any asset. Limits: theme 32 KiB, font 1 MiB,
SVG 16 KiB and 128 nodes. SVG accepts static basic geometry, groups, gradients
and internal clipping. Reject scripts, event attributes, CSS, text, animation,
images, external refs, use, foreignObject, declarations and entities. Parse and
re-serialize accepted SVG into a private immutable content-addressed cache.
Only copied packaged fonts reach Qt's FontLoader; unsupported fonts fall back.

Text/secondary colors require WCAG relative-luminance contrast >=4.5:1 against
the opaque dark outline; accent >=3:1. Guard tile contrast and dark scrims;
replace failing colors with safe concept defaults. Package appearance never
suppresses the readable native text outline or the user's reduced-motion setting.

## Validation evidence

Shell tests exercise traversal/symlink rejection, active/external SVG rejection,
limits, contrast correction and cached assets. Schema tests reject executable
fields, URLs, traversal and invisible colors. The original Signal Amber sample
is installed only in a nested test copy of Lumen Reach for visual checks; it is
not part of any published package.

An earlier skin proposal was reconciled into this version 1 format.
Its optional `id` and `name` identify the applied skin; per-area accents,
package-defined text sizing and animation timing are deferred. Invalid optional
assets fall back per role with one diagnostic; malformed theme JSON uses defaults.
