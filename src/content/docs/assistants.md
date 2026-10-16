---
title: "Build with an assistant (draft)"
description: "Connect an AI assistant to Hyprune through the hyprune MCP server, describe a world and watch it being built: what the assistant can and can't do, approving it, pausing it, and undoing its changes."
---

An AI assistant can build in Hyprune for you: "a cosy rooftop garden at sunset with three
screens and a CPU tower that glows" becomes a world you can walk, keep, change and release.
It works through **`hyprune mcp`**, a [Model Context Protocol](https://modelcontextprotocol.io)
server in the Hyprune SDK. Any MCP client can use it; Hyprune runs no model and sends nothing
anywhere itself. The design is [RFC-0016](/rfcs/0016-ai-creation/).

## Connecting a client

Add a local (stdio) MCP server to your assistant with the command `hyprune mcp`. The exact
place differs per client: a settings page for MCP servers, or a JSON entry like

```json
{"mcpServers": {"hyprune": {"command": "hyprune", "args": ["mcp"]}}}
```

The assistant should run inside your Hyprland session (so the server finds Hyprune's control
socket); `HYPRUNE_SOCKET` names it otherwise. Clients that load agent skills can also take the
**hyprune-world-builder** skill: `hyprune mcp --install-skill <your skills folder>`. Every client
also gets it as the MCP prompt `build_a_world`.

## Approving it

When the server starts, Hyprune asks: the HUD shows "**<name>** wants to build", and the
Director (hold Tab) shows the request on top of every page with **Allow once**, **Always
allow** and **Deny**. The name is what the assistant says it is. No answer in two minutes is a
denial. **Always allow** remembers the client by that name (never a token) in
`$XDG_STATE_HOME/hyprune/approvals.json`; Director → Builder → **Connected assistants** lists
remembered ones with **Revoke**.

## What it can and can't do

| It can | It can't |
| --- | --- |
| Make and open world folders, set the sky, the floor and the spawn | See or use your windows, workspaces, input, camera or focus |
| Place shapes, catalog objects and workspace screens; move, resize and remove them | Change your settings, keymap or Hyprune's own files |
| Make materials, import model files you name (with their licence) | Run commands (a command data source waits for your Allow) |
| Set HTTP data sources and data-driven behaviours | Read secrets (it can name one you set) |
| Look at what it built (rendered previews), read the checklist | Release, push or publish anything |
| Save (a local commit labelled "Assistant: ") and undo its own steps | Act after you disconnect it |

While it is connected, the HUD shows the **Assistant** chip: its name, how many changes it made
and its last action. Connected assistants has **Pause** (its changes are refused until you
resume) and **Disconnect** (it ends; the assistant has to be restarted to ask again).

## Undoing its work

Everything it changes in a world folder stays **unsaved** until it or you save, so Director →
Builder shows the unsaved changes and the checklist as it works. The assistant's `undo` reverses
its own steps, newest first; undoing everything since the last save leaves the folder exactly
as saved. Saves are ordinary commits: the Builder page's history shows which ones an assistant
made.

## Previews

`look` renders the world from a pose. With Hyprune running and the folder open, Hyprune draws it
in a separate process (`hyprune-preview`, never in the compositor's render pass and never by
moving your camera); screens show empty, never your windows. Without Hyprune, the SDK draws a
simple CPU preview of the folder.
