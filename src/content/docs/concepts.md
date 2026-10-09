---
title: "Concepts"
description: "The small ideas that compose a world-driven desktop."
---

Hyprune separates the place you inhabit, the things you interact with, and the systems that keep them running. Take Lumen Reach: the settlement is a **world**, the Sun Court is an **area** that is home to workspace 21, your terminal is a **surface** on its main wall, and a window **screen type** defines how that surface behaves.

## World

A **world** is a data-only package: a glTF scene plus a `world.json` manifest with spawn points, areas, surface anchors and mounts, collision, navigation routes, climbable volumes, playable bounds, visibility regions, atmosphere and provenance. It provides space and atmosphere. It cannot execute commands or grant permissions. Packages declare a format version and are validated before activation; a world that fails validation never replaces the current one. See the [world format RFC](/rfcs/0004-world-format/) and the [world manifest reference](/reference/schema/world/).

## Area and workspace home

An **area** is a named part of a world, such as Sun Court or Rime Vault, with a workspace slot. The world itself runs on workspace **20**, and each area is the home of workspace **20 + slot**. Switching to workspace 22, from a Hyprland bind or from the Director, travels to Array Hall, and that workspace's windows appear on the area's main wall. Your own Hyprland config can override these defaults.

## Surface

A **surface** is a live runtime instance presenting pixels in the world: an application window, workspace view, opted-in layer or custom provider. Its lifetime and focus belong to core, not to the mesh it appears on. A surface anchor is a location waiting for a binding. You can carry a surface, resize and turn it, mount it on a wall, or pocket it and take it elsewhere. A capture lease keeps windows on hidden workspaces producing frames. See [Surfaces](/rfcs/0005-surfaces/).

## Screen type

A **screen type** is a reusable descriptor for a class of surfaces. It specifies the source kind, planar geometry, preferred size and resolution, input support and refresh ceiling. A terminal and an editor can share the same window screen type while remaining separate surface instances. See the [screen type reference](/reference/schema/screen-type/).

## Tool

A **tool** is a mode for your hands: Normal (click into apps), Window (tag, mount, lock), Path (draw routes), Position (move, rotate, scale objects) and Placement (place or mount pocketed windows). Every tool uses the same four slots, Primary, Secondary, Alternate and Cycle (by default LMB, RMB, MMB and the wheel). Super gestures such as carry and resize always override them. See the [keymap](/keymap/).

## Movement mode

A **movement mode** interprets navigation and proposes camera or player motion. Walking, sprinting, free flight, climbing (grab, look-to-climb or auto-traverse), waypoint travel and autodrive share one world. Core validates motion, collision and playable bounds, and always keeps the emergency exit. See [Interaction](/rfcs/0006-interaction/).

## Shell

A **shell** is the controls and overlays around the experience: the HUD, the Director (hold Tab: Map, Workspaces, Settings, Performance), warp transitions, notices and settings. Quickshell powers the reference shell, which offers three HUD concepts: Adventure, Instrument and Minimal. Another implementation can replace it using the same protocol and lease rules. See the [Shell contract](/rfcs/0008-shell/).

## Widget

A **widget** is a small presentation component, such as a clock, task list or status panel. The reference shell may render it as QML; portability to other shells needs an agreed widget host contract. Displaying a widget doesn't give it system permissions. v0 reserves contribution IDs; portable widget hosting is future work.

## Integration

An **integration** connects a desktop or system service to approved actions and state, for example media status or a project launcher. It runs with explicit grants, and a world cannot smuggle a command into one. Additional service capabilities need their own contracts before they are implemented.

## Extension

An **extension** packages a supervised executable provider and its declared contributions. Its manifest requests capabilities, which the user approves through core. Worlds are content packages; they do not become executable extensions by containing metadata. The manifest format is specified, and the SDK can scaffold extensions, but **core does not run an extension host yet**. See the [Extension model](/rfcs/0007-extensions/) and the [extension manifest reference](/reference/schema/extension/).

## How they fit together

Lumen Reach declares an area `array-hall` in slot 02 with a suspended wall anchor. You switch to workspace 22 and travel there; your terminal appears on that wall. The shell shows whether the keyboard goes to the terminal or to movement. Press Super+Tab and you have an ordinary cursor; press it again and you're back in the world. Carry the window, pocket it, walk to Rime Vault and mount it on a wall there. The world never ran a line of code.
