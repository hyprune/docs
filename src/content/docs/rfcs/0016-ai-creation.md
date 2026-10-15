---
title: "RFC-0016 — AI-assisted creation: an MCP server and a skill for building worlds"
description: "Let a user describe a world, a machine or a companion to an AI assistant and have it built in Hyprune through the same operations the Director uses: an MCP server shipped with the SDK, a paired and scoped connection, undo through the world folder, and a skill that plans, builds and checks."
---

**Status: draft · proposed 2026-10-15; open questions resolved 2026-10-15 ([below](#resolved-questions-lead-2026-10-15-the-owner-may-overrule)).** Nothing here is implemented. It builds on the builder
and world folders of [RFC-0014](/rfcs/0014-builder/), the objects and placements of
[RFC-0011](/rfcs/0011-objects/), the data sources and bindings of
[RFC-0013](/rfcs/0013-live-objects/), companions in [RFC-0010](/rfcs/0010-npcs/), personal
quests in [RFC-0012](/rfcs/0012-quests/), the registry of [RFC-0015](/rfcs/0015-registry/) and
the grant model of [RFC-0003](/rfcs/0003-ipc/) and [RFC-0007](/rfcs/0007-extensions/). It also
sets [rules](#operation-rules-normative) that the builder's next phases (the world wizard,
primitives and materials, data-driven behaviours) follow, so that an assistant can drive
them as well as a person can.

## Goal

A user tells an AI assistant "a cosy rooftop garden at sunset with three screens and a CPU tower
that glows", and the world appears in Hyprune, built step by step while they watch, ready to
walk, keep, change and release. The same works for smaller requests: "make the bar by the door
follow my CI queue", "give me a companion that walks slowly", "a quest to tidy my inbox".

- **Any assistant.** Hyprune ships an [MCP](https://modelcontextprotocol.io) server,
  `hyprune mcp`, over stdio. Any MCP client can use it; Hyprune hosts no model and sends nothing
  to one itself.
- **End-user operations only.** Every tool is something the user could do in the Director or
  with the `hyprune` CLI. The assistant gets no power the user's own UI lacks, and none of the
  desktop: no windows, no input, no workspaces, no camera, no configuration or code.
- **Reversible.** Every change lands in a world folder (pending until Save, then in git) or in
  the user layout with a backup. Publishing, running a command and entering a secret stay the
  user's actions inside Hyprune.
- **Seen and checked.** The assistant can look at what it built (rendered previews) and read
  the builder's checklist, so it can fix its own mistakes before handing over.
- **Private.** No window title, window content, application id or focus history reaches the
  assistant. Previews draw windows as placeholders.

Non-goals: generating 3D models or textures (the assistant uses primitives, the libraries, the
registry and files the user or the client downloads); editing Hyprune's code, configuration or
installed packages; remote MCP transports; any operation in the user's live desktop outside
Hyprune's own data.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Assistant | An AI agent in an MCP client (a chat app, a coding tool, an IDE) that the user runs. |
| MCP server | `hyprune mcp`, a local process the MCP client starts. Part of `@hyprune/sdk`. |
| Pairing | The user's approval that connects an MCP server to core with the `assistant` profile. |
| `assistant` profile | The fixed set of methods and the filtered state a paired connection gets. |
| Operation | One SDK function or IPC method that the Director, the CLI and the MCP server all call. |
| Key | A caller-chosen stable name for something in a world folder (`cpu-tower`). |
| Journal | The MCP server's list of the changes it made in this session, with their inverses. |
| Skill | Instructions and examples that turn a description into a plan and a build. |

## How it fits together

```text
 MCP client ──stdio──► hyprune mcp (SDK, local, same user)
 (any assistant)        ├─ world folders: SDK builder library (create, sky, materials, save, history)
                        ├─ core IPC, paired, assistant profile (place, edit, behaviours, companion, quests)
                        ├─ data sources: SDK sources library (sources.json + the helper's control channel)
                        ├─ registry: SDK registry client (search, install from the configured indexes)
                        └─ previews: core offscreen render, or the SDK's CPU renderer of the folder
```

The MCP server is a thin adapter: each tool validates its arguments, calls one operation and
returns the operation's result or error. It never writes a world folder, `sources.json` or the
user layout by code of its own. When Hyprune is not running, world-folder operations still work
(they need no core) and in-world operations return `assistant.offline`.

## Operation rules (normative)

These rules apply to every operation the MCP server exposes, and so to the builder's world
wizard, primitives, materials and behaviours ([RFC-0014](/rfcs/0014-builder/) amendments) as
they are built.

1. **One operation, three front ends.** The Director, the CLI (`--json`) and the MCP server call
   the same SDK function or IPC method. A change that only one front end can make is a bug.
2. **Stable handles.** Everything created in a world folder (placements, materials, behaviours,
   areas, data sources) has a generated id that is never reused, and may carry a **key**: a slug
   of 1 to 48 characters, unique per world folder and kind, stored in the project file.
   Operations accept `{id}` or `{key}`. The Director shows keys as names.
3. **Idempotent.** A create with a key that exists fails with `-32005` rule `key.taken` and the
   existing id, or updates it when called with `ifExists: "update"`. Edits are absolute (a pose,
   a size, a material), never relative. Removing a missing handle succeeds with
   `{removed: false}`. Retrying any call after a timeout never makes a second copy.
4. **Dry run.** Every mutating operation takes `dryRun: true`: it runs the full validation, the
   placement rules and the budget checks and returns what it would change, writing nothing.
5. **Clear errors.** Errors carry the JSON-RPC code and `error.data {rule, message, field?,
   hint?, retryable}`. `rule` is a stable documented id, `message` one plain sentence, `hint` how
   to fix it ("move it 0.4 m away from the screen's front"). The MCP server returns them as tool
   errors unchanged.
6. **Undo through the folder.** No operation saves by itself. The folder's pending changes, Discard
   (all or per file) and History with Revert are the undo; the journal adds `undo` of the
   assistant's own last steps within a session (at most 256), each as the inverse operation. A
   change outside a world folder (the user layout, `sources.json`, the companion choice) takes an
   RFC-0014 backup first.
7. **Readable state.** One read returns a bounded summary (at most 64 KiB) of the open world
   folder: placements with keys, refs, poses, sizes, materials and behaviours; areas, spawn and
   sky; sources without secrets; the checklist; pending changes. It never includes window data.
8. **Metres, degrees, world axes.** Tool arguments use metres, degrees (yaw, pitch, roll) and the
   world frame (+Y up; the starter's spawn faces −Z). A position may be given relative to a key
   (`{relativeTo: "desk", offset: [0, 0.75, 0]}`) or on a face of it (`{on: "desk", face:
   "top"}`), resolved from bounds before the call. Results always report absolute poses.

## Permissions (normative)

### Pairing

The MCP client starts `hyprune mcp`, so it has no launch token from Hyprune's supervisor
(RFC-0003). It connects to core's socket and asks to be paired:

1. `session.pair {client: {id: "com.hyprune.mcp", name}, agent, profile: "assistant"}`, allowed
   before `session.hello` on an unauthenticated connection, at most one pending request per
   connection and 3 per minute per user. `agent` is the MCP client's name and version as it
   reported them to the server (a label, not proof).
2. Core asks the user in the HUD and the Director: "**<agent>** wants to build in Hyprune: world
   folders, objects, behaviours, companions and quests. It can't see or use your windows." The
   prompt says that the name is declared by the client itself.
   **Allow once**, **Always allow**, **Deny**. No answer in 120 s is a denial.
3. On Allow, core answers with a one-use token for that connection; `session.hello` with it
   binds the `assistant` profile. On Deny, `-32002` rule `pair.denied`.
4. **Always allow** stores `{clientId, agent, profile, approvedAt}` in
   `$XDG_STATE_HOME/hyprune/approvals.json` (0600; never a token). A later pairing that matches it
   is approved at once, with a notice. Director → **Connected assistants** lists approvals and
   live connections, with Disconnect and Revoke.

Same-user processes are not isolated from each other (RFC-0003), so pairing is consent and
visibility, not a barrier against local malware. It stops an assistant from acting in
Hyprune without the user knowing, and limits what a well-behaved one can do.

### The `assistant` profile

| Allowed | Methods (when implemented) |
| --- | --- |
| Read, filtered | `state.snapshot`/`state.subscribe` limited to `builder`, `objects`, `live` (values, no raw strings over 64 characters), `quests`, `companion`, `jobs`, zone names and the player's position; `objects.catalog`, `paths.list`, `libraries.list`. Never `surfaces`, workspaces, focus, window titles or app ids. |
| Build | `objects.place`, `objects.transform`, `objects.configure`, `objects.remove`, `objects.hide`, `paths.set`/`paths.remove`, `world.load` of a world folder or an installed world, and the `builder.*` methods core gains. |
| Characters and quests | `companion.set`, `companion.mode`, `companion.clear`; `quests.create`, `.update`, `.delete`, `.track`. |
| Previews | `preview.render` (below). |

Everything else is refused with `-32002`, including `surface.*`, `workspace.*`, `input.*`,
`camera.*`, `movement.*`, `travel.*`, `shell.*`, `ui.*`, `runtime.*`, `settings.set`,
`recording.*`, `data.publish` and the pocket. The profile is a fixed method allowlist plus a
filtered state projection in core, not a new combination of the RFC-0003 grants.

### Outside core

- **Files.** The server writes only through operations: world folders under the projects
  directory, the user's object folder (imports), `sources.json` entries it created, and the
  library install directory. It reads a local file only to import it or use it as a sky or
  texture; the path must be a regular file of the user, not under a dot-directory, and the
  importer must accept its format.
- **Commands.** A command data source proposed by the assistant is written with
  `"confirm": "pending"`. The helper never runs a pending entry, and its `test` op refuses one.
  The Director shows "An assistant proposed a command for **<object>**" with the exact argument
  vector, Test, **Allow** and Remove. HTTP sources need no confirmation: they only fetch, under
  the helper's existing local-address rules.
- **Secrets.** A source may name a secret; the assistant can see whether a name resolves and
  where (env, file, keyring), never its value, and can't set one. The Director asks the user.
- **Publishing.** No release, remote, push, registry submission or export is exposed.
  `release_prepare` opens the Builder page's Release form filled in, for the user to press.
  Save is exposed: it makes a local commit that Revert undoes, with the message prefixed
  "Assistant: ".
- **Registry.** Search and install from the configured official and community indexes only;
  adding a source stays a user action. Installed packages are data only (RFC-0015).
- **Visibility.** While a paired connection is open the HUD shows an **Assistant** chip with the
  number of changes this session, **Pause** (operations return `assistant.paused`, retryable)
  and **Disconnect**. The Builder page lists the session's changes from the journal.
- **Limits.** At most 20 mutations per second and 5,000 per session; previews at most one per
  second. Over a limit: `-32008`, retryable.

## Tools

The server exposes few, well-described tools; each maps to operations as above. Names are
snake case; every mutating tool takes `dryRun`.

| Group | Tools |
| --- | --- |
| Worlds | `world_list`, `world_create` (name, starter, sky preset or image, floor material, spawn), `world_open` (edit or play), `world_describe`, `world_set_sky`, `world_set_floor`, `spawn_set`, `area_set`, `area_remove` |
| Building | `catalog_search`, `place` (a primitive, a library or user object, or a workspace screen; key, pose, size, material), `edit`, `remove`, `material_set`, `import` (a local model or image, with licence, author and source) |
| Machines | `source_list`, `source_set_http`, `source_propose_command`, `source_test`, `behaviour_set`, `behaviour_remove` |
| Checking | `look`, `checklist`, `make_world`, `save`, `discard`, `history`, `undo`, `release_prepare` |
| Characters | `companion_list`, `companion_choose`, `companion_mode`, `companion_name` (E2) |
| Quests | `quest_list`, `quest_create`, `quest_update`, `quest_delete` |
| Registry and assets | `registry_search`, `registry_install`, `asset_fetch` (E2, allowlisted hosts) |

**Resources:** `hyprune://world/current` (the summary of rule 7), `hyprune://catalog`,
`hyprune://guide/building` (the builder guide). **Prompts:** `build_a_world` (the skill, below).

**`look`.** `{from: "spawn" | "overview" | <key> | {position, yaw, pitch}, fov?, size?}` returns
a PNG (at most 1,024 px on the long side) as image content, plus the pose used. With Hyprune
running and the world loaded, core renders it offscreen (`preview.render`): never in the
render pass and never by moving the user's camera, windows drawn as RFC-0005 placeholders. Otherwise the SDK
renders the world folder on the CPU with the import helper's software rasteriser (flat shading,
base colours and textures, the sky), which is enough to judge layout. `overview` is a
three-quarter view framing the folder's bounds.

## The skill

Shipped twice from one source: as the MCP prompt `build_a_world` (any client) and as an agent
skill folder (`skills/hyprune-world-builder/`: `SKILL.md` and examples) in the SDK package,
which `hyprune mcp --install-skill <dir>` copies. It tells the assistant to:

1. **Ask only what changes the build:** mood and time of day, size, how many screens, what data
   the machines show. Everything else gets a default.
2. **Plan first and show the plan:** areas with sizes and what each is for, how they connect,
   one or two vistas, levels, the sky, a palette of materials, at least two screens with
   generous standing space in front, and the machines with their data. The user's answer to the
   plan is the go-ahead.
3. **Use what is there:** primitives and materials for blockout, library and registry objects
   for detail, the user's own files when given. External assets only under CC0 or CC-BY, with
   author and source recorded at import; no names, marks or likenesses of existing games, films
   or brands.
4. **Build in passes, looking after each:** blockout (floors, walls, ramps, levels), screens,
   props, materials, behaviours and sources, sky. After each pass, `look` from the spawn, the
   overview and two other angles, read the checklist, and fix what is wrong before going on.
5. **Hold the design rules:** windows and screens never inside walls; space in front of every
   screen; distinct places rather than a grid; paths and vistas; the world holds up from every
   reachable angle, not only the hero view.
6. **Hand over:** what was built, what is still open on the checklist, pending changes, and
   how to undo. Save when the user is happy; Release is theirs.

Examples cover the rooftop garden at sunset (the demo below), a CI room with a conveyor bar
fed by a JSON API, and a quiet study with a CPU tower whose height follows CPU load.

## Contract plan

| Repo | Change |
| --- | --- |
| core | `session.pair` and the approval prompt hook; the `assistant` profile (method allowlist and filtered state); `approvals.json`; `preview.render {pose, fov, size}` → `{path}` (a PNG in the runtime directory, deleted after 60 s; offscreen framebuffer prepared with `doLater`, GL state saved and restored, windows as placeholders); the Connections data in state for the shell. One IPC version. |
| schema | The IPC version: `session.pair`, `preview.render`, the profile name, the `connections` state key; `sources.json` `confirm`; project-file keys (with the builder phases). |
| sdk | `hyprune mcp` (stdio, the official MCP TypeScript SDK), the tool and resource adapters, the journal, the CPU `look` renderer, the skill files; operations shared with the Director as SDK functions (`hyprune sources …` beside `hyprune builder …`). |
| shell | The pairing prompt, the Assistant chip, Connected assistants, the pending-command confirmation on the Data sources page, the Builder page's session changes. |
| sources helper | Skip and refuse `confirm: "pending"` entries. |
| docs | This RFC, a "Build with an assistant" guide (connecting a client, what it can and can't do, undo). |

## Phasing

| Phase | Delivers | Proven when |
| --- | --- | --- |
| **E1** | Pairing and the profile in core; the server with the world, building, machine (HTTP sources), checking and `look` (both renderers) tools; the journal and `undo`; the skill and prompt; the shell's prompt, chip and Connections. | In a nested session, the rooftop prompt is built end to end from an MCP client with a clip in the gallery; refused methods (`surface.focus`, `input.set`, `camera.set`, `data.publish`) fail with `-32002`; Deny, Revoke and Disconnect work; a server killed mid-build and run again with the same plan finishes with no duplicate placements; undoing every step leaves the folder equal to its last save. |
| **E2** | Command proposals with the Director's confirmation; companions, quests and registry tools; `make_world` and the checklist tools as the builder's Make world lands; `release_prepare`. | A proposed command never runs before Allow; a companion chosen and set to walk by the assistant behaves as one chosen in the Director. |

## Decisions (defaults chosen for this draft)

1. stdio only; no HTTP transport and no listening socket of the server's own.
2. Pairing per connection, with optional remembered approval keyed by client id, agent label and
   profile; no stored tokens.
3. The assistant may Save (local commits, prefixed); it may not Release, set a remote or publish.
4. HTTP sources without confirmation; command sources only after the user's Allow in Hyprune.
5. Assets: the client may fetch files itself and the server imports them with provenance; the server's own `asset_fetch` (E2) is limited to allowlisted hosts.
6. Previews draw windows as placeholders, always, also when the user is in the world.
7. Offline (Hyprune not running): world-folder tools work, in-world tools return
   `assistant.offline`; `look` uses the CPU renderer.

## Resolved questions (lead, 2026-10-15; the owner may overrule)

1. **Save from an assistant** needs no extra prompt: it is a local commit that Revert undoes.
   Every assistant save is labelled as one in History and counted on the HUD's Assistant chip.
2. **Asset download:** in E2, an `asset_fetch` tool limited to an allowlist of CC0 and CC-BY
   hosts (to start, the well-known CC0 texture, model and HDRI libraries). It records the source
   URL, licence and author automatically, is size-capped, and refuses any other URL.
3. **Remembered approvals** are allowed, keyed to the client's declared name. They are listed
   under Director → **Connected assistants** with Revoke, and the pairing prompt says that the
   name is declared by the client itself.
4. **Companions:** E2 adds naming a companion and choosing among installed characters over IPC.
   Importing a new character stays a user action through Objects → Import.
5. **Placement cap:** 512 placements per world folder, with budget warnings from the checklist.

Also agreed: data-driven behaviours are visual only (collision stays at the rest pose), and the
starter is **Open Plain** (`open-plain@0.2`), with `flat-land@0.1` folders still loading.
