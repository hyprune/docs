---
title: "Concepts"
description: "Eight small ideas that compose a world-driven desktop."
---


Hyprune separates the place you inhabit, the things you interact with, and the systems that keep them running. Imagine an observatory: the room is a world; your terminal appears on a surface; a window screen type defines how that surface behaves.

## World

A **world** is a data-only package: glTF scene, manifest, spawn points, zones, collision, navigation, audio and surface anchors. It provides space and atmosphere. It cannot execute commands or grant permissions. [World format](/rfcs/0004-world-format/).

## Surface

A **surface** is a live runtime instance presenting pixels in the world: an application window, workspace view, opted-in layer, web view or custom provider. Its lifetime and focus belong to core, not to the mesh on which it appears. A surface anchor is a location waiting for a binding. [Surfaces](/rfcs/0005-surfaces/).

## Screen type

A **screen type** is a reusable descriptor for a class of surfaces. It specifies the source kind, planar geometry, preferred size/resolution, input support and refresh ceiling. A terminal and an editor can share the same window screen type while remaining separate surface instances.

## Widget

A **widget** is a small presentation component: a clock, task list or status panel. The reference shell may render it as QML; portability to other shells requires an agreed widget host contract. A widget's display does not give it system permissions. v0 reserves contribution IDs; portable widget hosting is future work.

## Movement mode

A **movement mode** interprets navigation actions and proposes camera/player motion. Walking, free flight and point navigation can share one world. Core validates motion and collision and always retains the emergency exit. [Interaction](/rfcs/0006-interaction/).

## Integration

An **integration** connects a desktop or system service to approved actions and state: for example media status or a project launcher. It runs with explicit grants. A world cannot smuggle a command into an integration. Additional service capabilities need their own contracts before implementation.

## Shell

A **shell** is the controls and overlays around the experience: launcher, mode indicator, world picker, notices and settings presentation. Quickshell powers the reference shell. Another implementation can replace it using the same protocol and lease rules. [Shell contract](/rfcs/0008-shell/).

## Extension

An **extension** packages a supervised executable provider and its declared contributions. Its manifest requests capabilities, which the user approves through core. Worlds are content packages; they do not become executable extensions by containing metadata. [Extension model](/rfcs/0007-extensions/).

## How they fit together

A world places an anchor named `desk`. The user binds a terminal surface to it using `com.hyprune.window`. The shell shows whether keyboard input goes to the terminal or navigation. A movement mode changes how the user reaches the desk. A clock widget can join the shell without changing the world or compositor adapter.
