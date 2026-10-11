---
title: "RFC-0012 — Quests, markers and focus sessions"
description: "A TAB-tap marker reveal, a quest model grounded in real work, timed focus sessions and opt-in world progression."
---

**Status: draft · proposed 2026-10-11; P1 implemented in IPC 0.21 (see the
[amendment](#amendment-p1-in-ipc-021)).** P2 and P3 are not implemented. It builds on the
waypoint, route, location and data-channel contracts of [RFC-0003](/rfcs/0003-ipc/), the
input model of [RFC-0006](/rfcs/0006-interaction/), the Director and HUD of
[RFC-0008](/rfcs/0008-shell/), areas, zones and workspace homes from
[RFC-0004](/rfcs/0004-world-format/) and [RFC-0005](/rfcs/0005-surfaces/), and ambient
characters from [RFC-0010](/rfcs/0010-npcs/). Two drafts are being written alongside it:
[RFC-0011](/rfcs/0011-objects/) (world objects: libraries, traits, user placement, paths and NPC interactions) and
[RFC-0013](/rfcs/0013-live-objects/) (live objects: data bindings, machines and flows). This RFC does not define
objects, NPCs, machines or data sources; it says how quests refer to them.

## Goal

The world should help the user find their way and give their work a sense of progress,
without becoming a chore:

- A **short TAB tap** shows where things are: the next step of the tracked quest, area homes
  and workspaces, places worth visiting, characters with something to offer, and the current
  waypoint or route. The markers fade after a few seconds.
- **Quests** have a page in the Director. They come from the world, from the user (a personal
  to-do list turned into quests) and from extensions.
- A quest step can be a **focus session**: a timed work interval followed by a break, in
  cycles. Completing sessions advances quests.
- Progress is grounded in **real work** the user does at their computer: focus time, and
  signals from the tools they already use (a task marked done, a commit pushed), brought in
  through RFC-0013's data sources.
- A world can be **completed**: quests open vistas, dialogue and cosmetic changes.
  Everything stays usable without quests. Windows, workspaces, homes, travel and the map are
  never locked behind them.

Non-goals: scripting, currencies or scores, streaks that can be lost, reading window
contents, network services, and any specific integration (task tool, forge, calendar).

## Authority

| Part | Owner | Why |
| --- | --- | --- |
| Quest definitions, state machine, objective evaluation, persistence | core daemon (`hypruned`) | It owns persistence, grants and package data (RFC-0002). No quest logic runs in the compositor process. |
| Facts that objectives consume: zone and area entry, placements, keyboard focus, input activity | core plugin, over the private bridge | It is authoritative for pose, focus and surfaces. It reports facts; it does not evaluate quests. |
| Focus session timer and focus-time accounting | core daemon, fed by plugin focus and activity facts | Sessions run whether or not the world view is active: real work happens on the desktop too. |
| Marker set: selection, priority and budget | core daemon | One answer for every shell, and the same rules for the HUD and the Map. |
| World-locked marker drawing (in-view icons, labels, edge arrows) | core plugin, final present pass | Same reason as the waypoint and reticle (RFC-0005 world-locked overlays, RFC-0006 reticle): drawn with **that frame's** camera, at native resolution, with no IPC lag. |
| Screen UI: Quests page, Map markers, HUD tracker, focus timer, toasts, compass ticks | shell | RFC-0008: shell owns screen UI. |

**Rendering split.** Core resolves and projects every marker. World-anchored marks (icons
over targets, through-wall outlines, edge-of-screen arrows) need the frame camera, so core
draws them, as it already does for the waypoint since IPC 0.6. Screen-anchored pieces are
drawn by the shell. A shell that wants to draw world markers itself can turn core's drawing
off (`markers.core_draw`, below). It then reads the marker list and the existing
`spatial.projection` samples, which gain a `markerId` (see [contract plan](#contract-plan)).

## Markers

### Marker record

A marker is a resolved, bounded record published in state. Shells never create markers
directly. Markers come from core-derived sources (waypoint, route, areas, places,
workspaces), from quests, from world-authored points (P2) and from the focus session.

```json
{
  "id": "quest:com.hyprune.lumen-reach/lantern-path/light",
  "kind": "quest",
  "tier": 1,
  "label": "Light the north lantern",
  "icon": "quest",
  "target": {"objectId": "north-lantern"},
  "position": [12.4, 3.1, -40.2],
  "areaId": "harbour",
  "range": [2, 400],
  "labelRange": 120,
  "occlusion": "through",
  "tracked": true,
  "source": {"questId": "lantern-path", "stepId": "light"}
}
```

| Field | Rule |
| --- | --- |
| `id` | Stable within the session: `<kind>:<source-specific id>`, at most 160 bytes. The same quest step keeps its ID across revisions so shells can animate it. |
| `kind` | `quest`, `offer`, `waypoint`, `route`, `home`, `workspace`, `place`, `vista`, `discover`, `machine`, `focus`, `break`. |
| `tier` | 1–4, see the tier table. Lower is more important. |
| `label` | 0–48 characters of plain text. Personal quest labels are private information (gated by `state.read`, like window titles). |
| `icon` | An icon class (table below). It maps to the overlay icon atlas; unknown classes fall back to the kind's default. |
| `target` | Exactly one of `{position}`, `{zoneId}`, `{areaId}`, `{placeId}`, `{pointId}`, `{anchorId}`, `{surfaceId}`, `{workspaceId}`, `{objectId}`, `{npcId}`, `{machineId}`. `npcId` follows RFC-0010/0011 and `machineId` RFC-0013; cores without those features never publish them. |
| `position` | Resolved world-space point in metres (rules below), or null if the target is not in the loaded world (for example a workspace without a home here). Off-world markers appear only on the Quests page. |
| `areaId` | Owning area, or null. |
| `range` | `[min, max]` metres. Hidden when nearer than `min` (you've arrived) or farther than `max`. |
| `labelRange` | Beyond this distance only the icon and distance are drawn. |
| `occlusion` | `through`: drawn through geometry, dimmed with a dashed outline while occluded. `edge`: off-screen targets get an edge arrow. `visible`: only drawn with line of sight (keeps discovery honest for places). Off-screen handling applies to `through` too. |
| `tracked` | True for the tracked quest's current objectives. |
| `source` | `{questId, stepId?, objectiveId?}`, `{areaId}`, `{waypoint: true}` and so on; used by the shell for "open in Quests". |

Target resolution, every frame for moving targets and once per revision for static ones:

| Target | Point |
| --- | --- |
| `position`, `pointId` | As given (eye height is not added: points are where the icon goes). |
| `zoneId` | Bounds centre in X/Z, minimum Y + 1.7 m (the RFC-0003 zone destination rule). |
| `areaId`, `workspaceId` with a home | The top centre of the area's primary `mounted-workspace` wall plus 0.3 m. "That wall is workspace 21" is what the user is looking for. |
| `placeId` | The `spatial.world.places` eye position. |
| `anchorId`, `surfaceId` | Centre of the anchor or the live window rectangle. |
| `objectId`, `npcId`, `machineId` | Top of the current swept bounds plus 0.3 m. NPCs are followed as they walk. |

### Tiers, budget and clutter

| Tier | Kinds | In a reveal | Off-screen |
| --- | --- | --- | --- |
| 1 | tracked quest objectives, waypoint and route destination, the focus target, a break suggestion | always, labelled | edge arrow, labelled |
| 2 | other active quest objectives, `offer` (a character with a quest to give or take) | within 60 m | edge arrow, icon only |
| 3 | area homes and workspaces (`home`, `workspace`) | homes in the current area, and others within 150 m | none |
| 4 | `place`, `vista`, `discover`, `machine` | within 80 m, icon only beyond 30 m | none |

Clutter rules (MUST for core's drawing; a shell drawing markers SHOULD follow them):

1. **Budget.** At most `markers.max_revealed` (default 12, range 4–16) in-view markers and 6
   edge arrows per output. When over budget, drop by tier, then by distance. State carries
   at most 64 marker records (the existing projection bound).
2. **Labels.** At most `markers.labels` (default 5, range 2–8) labels at once: tier 1 first,
   then nearest to the screen centre. Other markers are icon plus distance.
3. **Stacking.** Markers whose icons fall within 32 px of each other merge into one stack:
   the most important icon plus a count badge. A stack never hides a tier-1 label.
4. **Keep the aim clear.** Inside 120 logical px of the reticle, labels collapse to icons.
5. **Windows come first.** A marker never draws over the aimed or used window. Over any
   other window surface it draws at 50% opacity. Markers never take input.
6. **Arrival.** A marker hides inside its `range[0]`, and a tier-1 marker whose target is in
   view within 4 m hides its label.
7. **Levels.** A target more than 4 m above or below the eye gets a small up or down chevron
   (useful with blueprint levels).
8. **Modes.** Reveal and persistent markers draw in world mode, and persistent markers also
   in interactive (E) mode. All markers hide in focus (F), free cursor, menu and native
   fullscreen, like other world-locked presentation.

Icon classes (built-in symbols; the overlay atlas can supply its own):

`quest`, `quest-optional`, `offer`, `turn-in`, `waypoint`, `route`, `home`, `workspace`,
`place`, `vista`, `discover`, `door`, `stairs`, `lift`, `water`, `machine`, `focus`, `break`.

Drawing: icons are 24 output px (the existing atlas size). A label is one line of at most 32
visible characters; the distance ("48 m") sits under the icon. Edge arrows sit 48 logical px
inside an ellipse fitted to the output and point toward the target. Colours come from
`overlay.style` (`waypointColor`, `labelColor`) plus one new `questColor`. Shape differs per
tier (tier 1 has a ring), so no tier depends on colour alone.

### The TAB tap

TAB long hold already opens the Director on the Map (`menu`, `Tab[L]`, `longHoldMs`). A short
press becomes a new world action, **`markers.reveal`**, bound to `Tab` by default.

**Tap/hold pairs (amends RFC-0006 input v2).** Today a chord may carry only one action per
mode. This RFC allows one plain binding and one `[L]` binding of the **same chord in the same
mode** if they belong to different actions: a *tap/hold pair*. Core MUST then:

- start the hold timer on press and fire nothing;
- fire the hold action when the timer reaches `longHoldMs`, after which the release fires
  nothing;
- fire the plain action (press and release together) on release before `longHoldMs`;
- fire nothing if the mode changes, the world deactivates or input is cleared while the key
  is held.

Plain bindings that are not part of a pair keep firing on press. Movement keys held at the
same time are unaffected. Super+Tab (the `exit` action) is a different chord and keeps its
meaning. Any other duplicate is still an internal conflict that rejects the save. The input
file stays version 2; a migration adds `markers.reveal: ["Tab"]` to world mode, as was done
for `record.toggle`. A file that already binds plain `Tab` elsewhere in world mode keeps
that binding, and `markers.reveal` starts unbound.

**Hold ring.** `keymap.holds` already reports the pending hold when TAB goes down. To avoid
flashing the ring on every tap, the shell SHOULD delay showing the ring by a local
`holdRingDelayMs` (default 180 ms) and then fill the remaining time. No wire change.

**Reveal timing.**

| Phase | Default | Reduced motion |
| --- | --- | --- |
| Fade in | 120 ms, in tier order (tier 1 first, 30 ms apart) | instant, all together |
| Hold | `markers.reveal_ms`, default 4000, range 1000–15000 | same |
| Fade out | 600 ms | instant |

- Tapping again while markers are shown or fading restarts the hold.
- `markers.reveal_mode: "toggle"` (accessibility) makes a tap show the markers until the
  next tap, with no timer.
- Opening the Director, entering focus or use mode, or a world change ends a reveal at once.
- The reveal is a core action: no shell round trip, and it works without a shell. The
  `markers.reveal` method lets the Director, a HUD button or an accessibility tool trigger
  the same thing.
- State publishes `markers.reveal = {startedAtMs, holdMs, fadeMs, reason}` once per reveal
  (monotonic clock, as for `keymap.holds`), so a shell can sync a compass or minimap without
  per-frame deltas.

### Persistent markers

`markers.persistent` controls what shows without a tap:

| Value | Behaviour |
| --- | --- |
| `off` | Only the waypoint and route draw, as today (RFC-0005). |
| `edge` (default) | Also the tracked quest's current objective: a small unlabelled diamond in view when farther than 25 m, and a small edge arrow when off-screen. |
| `always` | Like `edge`, with its label in view. |

The existing `show_area_markers` option (always-on area and place labels) keeps its
meaning. The reveal is the transient alternative to it.

## Quests

### Quest model

```json
{
  "id": "lantern-path",
  "title": "The lantern path",
  "summary": "Relight the three harbour lanterns.",
  "category": "main",
  "giver": {"npcId": "harbour-keeper"},
  "prerequisites": {"quests": ["first-steps"], "discovered": ["harbour"]},
  "sequential": true,
  "steps": [
    {"id": "reach", "title": "Walk to the north lantern",
     "objectives": [{"id": "go", "type": "reach", "target": {"pointId": "north-lantern-base"}}]},
    {"id": "work", "title": "Two focus sessions",
     "objectives": [{"id": "sessions", "type": "focus", "sessions": 2}]},
    {"id": "light", "title": "Light the north lantern",
     "objectives": [{"id": "use", "type": "interact", "target": {"objectId": "north-lantern"}}]}
  ],
  "rewards": [{"unlock": "north-lookout"}],
  "repeat": "none"
}
```

| Field | Rule |
| --- | --- |
| `id` | Slug, unique within its source. The full ID is `<source>/<id>`: a world ID, `personal`, or an extension provider ID. |
| `title`, `summary` | 1–64 and 0–1000 characters, plain text. |
| `category` | `main`, `side`, `discovery`, `personal`, `work`. Used for grouping and icons only. |
| `giver` | Optional `{npcId}` (RFC-0011 interaction) or `{pointId}`. Shown on the Quests page and used for `offer` markers. |
| `prerequisites` | Optional: `quests` (completed quest IDs from the same source), `discovered` (area, place or point IDs), `unlocks`. All must hold before the quest becomes available. |
| `sequential` | Default true: one step is current at a time. False: all steps are open at once. |
| `steps` | 1–16. A step has `id`, `title`, 1–8 `objectives`, optional `optional: true` and `any: true` (one objective is enough). |
| `rewards` | Optional unlock references (see [Completing the world](#completing-the-world)). No currency, points or items. |
| `repeat` | `none`, `daily` or `weekly`: on the next local-time reset a completed quest becomes available again. |
| `expires` | Optional local date and time. Allowed only for personal and extension quests. |

### States

| State | Meaning | Enters when |
| --- | --- | --- |
| `available` | Can be accepted | Prerequisites hold. Quests whose prerequisites don't hold are not listed, unless the author sets `listed: true` (shown as a locked teaser with its prerequisites). |
| `active` | Accepted; objectives count | The user accepts it (Quests page, NPC interaction or CLI), or creates a personal quest. |
| `completed` | All required steps done | The last required objective completes. Rewards apply once. |
| `failed` | Past its `expires`, or cancelled by its provider | Only personal and extension quests can fail. World quests MUST NOT fail in extension version 0.1. |
| `abandoned` | Set aside by the user | Always allowed. Progress is kept. |

`failed` and `abandoned` quests can be resumed at any time, with their progress. Nothing is
taken away, no quest auto-activates, and no inactivity ever changes a state.

**Tracking.** At most one quest is *tracked*. Its current objectives get tier-1 markers and
the HUD tracker. Accepting a quest while nothing is tracked tracks it. Completing the
tracked quest tracks nothing, and the HUD offers the next active quest.

### Where definitions live

| Source | Location | Who writes it |
| --- | --- | --- |
| World-authored | World package extension `com.hyprune.quests` (P2) | World author; read-only once installed |
| Personal | `$XDG_STATE_HOME/hyprune/quests/personal.json` | The user, through the Quests page, the CLI or `quests.create` |
| Extension-provided | Sent at runtime by `quests.provide` (P3) | An approved extension, for its own namespace only |

**World quests are a package extension, not a new world-format section.**

- **Optional by nature.** A world without quests, or a core without the quest engine, loads
  and plays identically. An older core ignores the extension, the same pattern as
  `com.hyprune.map` and `com.hyprune.blueprint`.
- **Not geometry.** Quests are read by the daemon, never the renderer. Nothing in the
  extension changes collision, visibility or GPU budgets, so the format's validation and
  activation path stays untouched.
- **Its own cadence.** The quest vocabulary will change faster than the world format. The
  extension versions independently (`0.1`, `0.2`, …) without bumping `formatVersion` for every
  objective type.
- **Promotion later.** Content that quests *unlock* does need the world format, because core
  must know which objects and collision are conditional (P3, below). That small hook goes in
  the format; the quest data stays in the extension.

```json
"extensions": {
  "com.hyprune.quests": {"version": "0.1", "path": "quests/quests.json"}
}
```

`quests/quests.json` is at most 256 KiB and contains:

| Key | Content | Limit |
| --- | --- | --- |
| `points` | Authored points of interest: `{id, name, position, icon, radius?, kind: "place"\|"vista"\|"break", visible?}` | 64 |
| `quests` | Quest definitions (model above) | 64, 16 steps each, 8 objectives per step |
| `unlocks` | Unlock declarations (P3) | 64 |

References (zones, areas, places, anchors, objects, NPCs, machines, points) MUST resolve at
load. A reference to a feature this core doesn't support (an NPC on a core without RFC-0010)
marks that quest `unsupported`: it is listed greyed out and the world still loads. A
malformed extension disables quests for that world with a `runtime.notice`
(`quests.invalid`). It never rejects the world, because the extension is optional.

**Personal quests** turn a to-do into quests. The minimum is a title. Each step defaults to
a `manual` objective (a checkbox), and the user can add any of:

- a focus target ("two sessions on this");
- a place or workspace ("do this at the workshop", which gives it a marker);
- a linked signal ("done when the task closes in my task tool").

Personal quests are global, not per world. Their markers resolve in any world where the
target exists, and workspace targets resolve wherever that workspace has a home.

**Extension quests** use the same model with the provider ID as source. An extension can
target only things that exist everywhere: workspaces, apps by class, and its own data keys
and events. It cannot target world places, objects or NPCs. Quests stay listed while the
provider is offline (marked "source offline") with their progress kept.

### Persistence

Local only, per user, never synced or sent anywhere. Files are private (0600), written
atomically by the daemon, debounced to at most once per 5 s and flushed on exit.

| File | Content |
| --- | --- |
| `$XDG_STATE_HOME/hyprune/quests/worlds/<worldId>.json` | Per-world quest states, step and objective counts, signal links, discovered areas, places and points, applied unlocks |
| `$XDG_STATE_HOME/hyprune/quests/personal.json` | Personal quest definitions and progress |
| `$XDG_STATE_HOME/hyprune/quests/providers/<providerId>.json` | Extension quest progress (not definitions) |
| `$XDG_STATE_HOME/hyprune/focus/history.jsonl` | One line per finished interval (see [privacy](#privacy)) |

Progress is keyed by world ID and quest, step and objective IDs, not by package version. A
package update keeps the progress of every ID that still exists. A removed quest keeps its
record and shows under Completed if it was completed. Authors keep IDs stable, the same rule
as for anchors. Settings offers **Reset progress for this world** and **Export** (a JSON
copy written next to the files).

### Quests page

A Director tab after Map. It has concrete anchored geometry like the other pages
(RFC-0008), and keyboard navigation throughout.

- **List** (left), grouped as Active (tracked first), Available, Completed (collapsed),
  and Failed or abandoned (collapsed). Filters by source: this world, personal, each
  extension. Off-world and unsupported quests are marked.
- **Details** (right): title, giver, summary, steps with objective progress ("1 / 2
  sessions"), and per-objective actions:
  - **Track / Untrack**;
  - **Set waypoint**, through the existing `waypoint.set` to the objective's target;
  - **Show on map**, which switches to Map centred on the marker;
  - **Start focus session**, for focus objectives;
  - **Link source**, for signal objectives;
  - **Mark done**, for manual objectives;
  - **Accept**, **Abandon** and **Resume**.
- **New personal quest**: title, steps (one per line), optional workspace, area or place,
  optional focus sessions per step. The same form edits an existing personal quest.
- **Header** (P3): world progress and the **Explore freely** switch.
- Keys: arrows to move, Enter to open, T to track, Space for mark done, F to start a focus
  session, N for a new quest, Escape leaves the menu (unchanged).

The Map page draws the same marker list (positions through `worldToMap`), filtered to the
current blueprint level.

### Notifications

Quest notifications are a dedicated event (`quest.progress`), not `runtime.notice`, so
shells that don't know quests are unaffected.

| Event | Shell presentation | Duration |
| --- | --- | --- |
| Objective progress (2 of 3) | HUD tracker updates in place; no toast | |
| Step completed | Small toast under the tracker: quest title, "✓ step", next step | 3 s |
| Quest completed | Top-centre banner: title and unlocks | 5 s |
| Quest available or offered | Small toast with the Track hint, only for quests from the current world or a giver nearby | 3 s |
| Focus phase change | Timer chip pulse plus a small toast (break suggestion) | 4 s |

Toasts use the HUD theme tokens (and world HUD styles where enabled), queue at most three,
and merge repeats. Reduced motion replaces slides and pulses with instant changes.
`quests.notifications` = `all` (default), `important` (completions and focus phases only)
or `off`. Calm mode defers everything except focus-phase toasts to the next break. Sound
hooks are reserved: no sounds in P1, and a chime later only when enabled.

## Objective types

Objectives are declarative records from a closed set. There is no scripting, no expressions
and no counters other than `count`. Every type takes optional `count` (default 1, at most
100) and `label` (overrides the generated text).

| Type | Fields | Completes when |
| --- | --- | --- |
| `reach` | `target` (zone, area, place, point, anchor, object, NPC or machine), `radius` (default: zone or area bounds, else 4 m) | The camera eye enters the target's bounds or comes within `radius` of its point, in world mode, by any movement (walking, flight, travel). |
| `interact` | `target` (NPC, object or machine), optional `interaction` ID | The RFC-0011 interaction with that target fires with a matching quest reference, or (for machines) its RFC-0013 use action. |
| `place` | `what`: `{window: {appClass?}}` or `{object: {asset}}`; `where`: area, anchor, zone or `{mountType}` | A window or user-placed object ends a placement (carry release, tool 2 or tool 5 mount or place, `surface.place`) satisfying both. Pocketing and recall don't count. |
| `focus` | `sessions` (1–12), optional `minutes` (minimum credited minutes per session, default the configured work length × 0.8), optional `target` (`quest`, meaning sessions started from this quest, or `any`) | A focus work interval completes with enough credited time (see [Focus sessions](#focus-sessions)). |
| `signal` | Real work, see below | The linked data condition or event is observed. |
| `discover` | `areas`: `"all"` or a list; or `places` / `points`: a list | Every listed target has been discovered (visited by the `reach` rule). Discoveries made before the quest was accepted count. |
| `manual` | None | The user marks it done. **Personal quests only.** |

Counting rules:

- Except for `discover`, objectives count only events that happen while the quest is
  active and the step is current (or open, for non-sequential quests). Nothing is credited
  retroactively.
- One event advances at most one objective per quest, and a `reach` objective with `count > 1`
  needs the eye to leave the radius between counts.
- Objective progress is monotonic. It never goes down.

### Real work: `signal` objectives

RFC-0013 defines how external data reaches the world: a bundled source-helper extension
turns HTTP polls, commands and scripts, and timers into data-channel sources, and extensions
publish their own keys and events through the existing `data.publish` path. **Signal
objectives subscribe to those same keys and events. This RFC adds no ingestion path.** It
defines only the quest side: conditions on a key or event, and who may satisfy them. Key and
event addressing (`source`, `key`, `event`) follows RFC-0013. If that draft settles different
names, this RFC adopts them.

```json
{"id": "tests", "type": "signal", "source": "com.hyprune.sources.ci", "key": "main.status",
 "when": {"op": "becomes", "value": "passing"}}

{"id": "tasks", "type": "signal", "source": "org.example.tasks", "event": "task.completed",
 "match": {"project": "release"}, "count": 3}

{"id": "lamp", "type": "signal", "machine": "build-beacon", "when": {"op": "becomes", "value": "ok"}}
```

| Field | Rule |
| --- | --- |
| `source` + `key` | A value in a data source. `when.op`: `becomes` (the value changes to `value`), `atLeast` (a number crosses up to `value`), `increases` (a number rises by at least `by`, default 1, since the step became current; each further rise of `by` counts once toward `count`). |
| `source` + `event` | An RFC-0013 event. Optional `match`: equality on up to 8 scalar fields. Each distinct event counts once. |
| `machine` | A machine (RFC-0013) as the target: the condition applies to the key the machine is bound to, and the objective's marker points at the machine. |
| `slot` | **World quests only**, instead of `source`: an abstract slot such as `{"slot": "task-done", "label": "Finish a task from your list"}`. See trust rules. |

Events are the recommended form for countable work ("three tasks done"). Values suit state
("the build is green").

**Trust and attestation.**

1. **Attestation is core's, not the payload's.** Core credits only publications from sources
   the daemon authenticated: the publisher holds an approved `data.publish` grant and the
   source ID is in its namespace (RFC-0003). With each credit core records the publisher's
   client ID, package digest and grant approval. A payload's claims about its own origin are
   ignored. Signed payloads are not required in this version. If RFC-0007's later
   signatures arrive, a signal can additionally require them (`attested: "signed"`).
2. **World quests never name a source.** A world is untrusted data from any author and must
   not decide which service on the user's machine counts as work. World quests use
   `slot`s. When accepting such a quest, or later from its details, the user links each
   slot to a key or event of a source they already run, or picks **Mark done myself**
   (honour system). Until it is linked, a slot objective is shown as "needs a source".
3. **Linking is a user decision made through the shell.** `quests.link` requires
   `quest.control`, which only the trusted shell and CLI hold. An extension can never link
   its own source into a world or personal quest.
4. **Extension quests may use only their own sources.** A provider's signal objectives must
   name sources in its own namespace. Others are rejected at `quests.provide`.
5. **Confirm option.** Each link is `auto` (default for extension sources) or `confirm`
   (default for the source helper's command and HTTP sources, whose data is only as
   trustworthy as the user's script). With `confirm`, core credits after the user accepts a
   toast ("Count this? ✓").
6. **No replays.** Credits are de-duplicated by source, connection epoch and sequence (and
   event ID where RFC-0013 provides one). After a publisher reconnects, `increases`
   re-baselines on the first new value rather than crediting the jump.
7. **Bounded.** At most one credit per source per objective every 10 s, and the
   world-progress daily cap applies (see [Completing the world](#completing-the-world)).
8. **Nothing is copied.** The quest engine stores counts and timestamps only, never the
   published values (which may contain task titles). Labels are shown live and not stored.

## Focus sessions

A focus session is a timer of **work intervals and breaks in cycles**, owned by core and tied
to the window, workspace or task the user works in. A completed work interval is a fact
that `focus` objectives consume. Starting a session from a quest step links it to that
step.

### Settings

| Key | Default | Range | Meaning |
| --- | --- | --- | --- |
| `focus.work_min` | 25 | 5–120 | Work interval, minutes |
| `focus.short_break_min` | 5 | 1–30 | Break after each work interval |
| `focus.long_break_min` | 15 | 5–60 | Break after every `long_break_every` intervals |
| `focus.long_break_every` | 4 | 2–12 | |
| `focus.cycles` | 4 | 1–12 | Work intervals per session; the session ends after the last one |
| `focus.auto_start_breaks` | true | | A break starts when a work interval ends |
| `focus.auto_start_work` | false | | The next work interval starts when a break ends. Off: the HUD shows "Ready", and the next interval starts on request. |
| `focus.count_mode` | `focus` | `focus`, `wall` | How work time is credited (below) |
| `focus.idle_s` | 180 | 60–900 | No keyboard or pointer input for this long stops crediting |
| `focus.grace_s` | 30 | 0–120 | Short excursions to other windows still credit |
| `focus.calm` | true | | Calm mode during work intervals |
| `focus.calm_npc_distance` | 6 | 2–20 | Metres ambient characters keep away during calm mode |
| `focus.desktop_chip` | false | | Show the timer chip on the desktop when the world is not active |
| `focus.history_days` | 90 | 0–365 | 0 keeps no history |

A session can also be started with one-off values (`focus.start`), for example a single
50-minute interval.

### What counts

The user picks a **target** when starting: a workspace, a window (stored as its app class
plus workspace), an app class, a quest step (any target), or `any`. Core credits work time,
the time that counts toward objectives:

- **`focus` mode (default).** A second is credited when keyboard focus is on a window
  matching the target, in native desktop use, in E use or in F focus, and there was input
  within `focus.idle_s`. Focus moving to a non-matching window for up to `focus.grace_s`
  (looking something up) still credits. Walking around the world doesn't credit, and
  neither does looking at a window without focusing it.
- **`wall` mode.** Every second of the interval credits. This suits reading on paper,
  calls and thinking away from the keyboard.

The interval clock always runs on wall time. Credit is separate: an interval completes when
its time is up, and it counts toward `focus` objectives when the credited minutes reach the
objective's `minutes` (default 80% of the configured work length). The HUD shows credit
quietly (a filled arc inside the timer ring). It never says "you were away".

Sessions run whether or not the world view is active, as long as core is loaded. Work
happens on the desktop too. Lock, suspend and core exit pause the session. It resumes paused,
never automatically.

### Never punish, never nag

- **Pause** and **resume** are always available. **Skip** ends the current work interval
  or break and moves on. A skipped work interval simply doesn't count. **Stop** ends the
  session. None of these produces a warning, a lost streak or a "failed" message.
- Breaks are suggestions. Ignoring a break just continues: the next work interval waits for
  the user if `auto_start_work` is off.
- There are no reminders to start a session, no daily goals unless the user writes one as
  a personal quest, and no sounds by default.

### What the world does

| During | World behaviour |
| --- | --- |
| Work interval, calm mode on | The TAB reveal shows only tier 1 (tracked objective, waypoint, focus target). Quest toasts are deferred to the break (merged, at most 3). Ambient characters keep `calm_npc_distance` from the player, don't fidget or glance, and don't offer quests (RFC-0010 runtime rules; offers wait for the break). `runtime.notice` warnings and errors still show. Music and ambience hooks are reserved: `focus.phase` events and a future world `ambience` field. |
| Work interval | The HUD timer chip: a ring, mm:ss remaining, the phase label, cycle dots, and the target's icon. Shown in world and interactive modes. In native focus or on the desktop only phase changes show (a toast), unless `focus.desktop_chip` is on. |
| Break | The chip turns to the break colour. A **break suggestion** toast offers a short walk: "Break · 5 min. Stretch, or walk to the north lookout." Core picks a `break` point (world-authored `points` with `kind: "break"`, else a vista or place 30–150 m away and reachable on the route graph) and shows it as a tier-1 `break` marker for the break. Walking there is optional; it is not an objective unless a quest makes it one. |
| Session end | A summary toast: intervals done and credited minutes. The focus objective progress shows on the tracker. |

### Privacy

- Core never reads window contents, titles in history, keystrokes or pixels for focus
  accounting. It uses only focus changes (which window or workspace had keyboard focus) and
  an input-activity timestamp, both of which the plugin already has.
- History lines hold only: start and end (local wall time), phase, planned and credited
  minutes, target kind, app class or workspace ID (no title), linked quest ID, and outcome
  (`completed`, `skipped` or `stopped`). `focus.history_days: 0` keeps nothing beyond the
  running session.
- Everything is local (0600 files under `$XDG_STATE_HOME/hyprune/`), never sent anywhere, and
  available to clients only through `state.read`, which is already a privacy grant.

## Completing the world

A world can declare **unlocks**: things that open as the user completes its quests. World
progress is the share of the world's quests completed and areas discovered, shown on the
Quests page header. It is not a score.

| Unlock kind | Effect | Phase |
| --- | --- | --- |
| `vista` | A lookout or viewpoint becomes reachable: a conditional object (a bridge, a lift, an opened gate) appears with its collision proxy | P3, needs the world-format hook |
| `area` | An optional, home-less region opens the same way | P3, same hook |
| `dialogue` | An NPC gains interaction lines (RFC-0011) | P3, with RFC-0011 |
| `cosmetic` | Objects appear or change variant, an `accent` colour changes, an atmosphere profile is offered in Settings, a world HUD style variant | P3 |
| `machine` | A machine (RFC-0013) becomes active or shows a new state | P3, with RFC-0013 |

```json
"unlocks": [
  {"id": "north-lookout", "kind": "vista", "name": "North lookout", "objects": ["lookout-bridge"]},
  {"id": "keeper-stories", "kind": "dialogue", "npcId": "harbour-keeper", "interaction": "stories"}
]
```

**World-format hook (P3).** Objects (format 0.8 and RFC-0011) gain an optional `unlock` ID:
such an object, and its collision proxy, exist only once the unlock is applied, or the
opposite with `"unlockHides": true` (a gate that opens). This needs a format version,
because an older core must reject such a package rather than show every gated object. The
same version will likely carry RFC-0010 and RFC-0011 fields, and the number is assigned
when those land.

**Rules (MUST):**

1. **The desktop is never gated.** An unlock must not gate an area that has a workspace home, a
   spawn, a mounted-workspace or tool anchor, a placement zone, or the only route to any of
   these. Core and `hyprune-world-check` verify reachability of all of them with every gated
   object in its locked state. A world that fails this does not load its unlocks (the world
   itself still loads, with every unlock applied).
2. **Quests are opt-in.** No quest auto-activates, and declining or ignoring every quest
   costs nothing except unlocks.
3. **Explore freely.** `quests.open_world: true` applies every unlock in the current world at
   once. Progress is still recorded (the header shows "exploring freely"), and turning it
   off restores the earned state.
4. **Grounded, not grinding.** World authors SHOULD put the unlocks that matter behind
   `focus` and `signal` steps, and keep `reach` and `interact` steps for guiding the user
   around. Core enforces the rest:
   - No idle credit: `focus` mode needs input, and `wall` mode must be chosen explicitly.
   - No repetition farming: `count` re-entry rules and de-duplicated signals.
   - **A daily cap on work credit toward world progress**: at most `quests.daily_focus_cap`
     (default 6) work intervals and `quests.daily_signal_cap` (default 12) signal credits per
     local day advance world quests. Personal and extension quests are not capped. The
     world never rewards overwork.
5. **Nothing expires.** Unlocks are permanent for that world and user unless reset in
   Settings.

## Contract plan

### IPC

All of the following arrive in the **first IPC version after 0.20 that ships this RFC**
(0.21 at the time of writing; RFC-0011 and RFC-0013 may land first, and the number is
assigned at merge). It inherits every earlier method, event and grant. Older peers get exact
older projections. Discovery through `hello.methods` and `hello.events` gates everything.

**State keys** (whole replacement, revisioned, published on change only, never per frame):

| Key | Shape |
| --- | --- |
| `markers` | `{reveal: null \| {startedAtMs, holdMs, fadeMs, reason: "tap"\|"request"}, persistent, calm, list: Marker[≤64]}` |
| `quests` | `{enabled, tracked: questRef \| null, active: [{id, source, title, step, progress: [done, of]}] (≤16), counts: {available, active, completed}, world: {progress: 0..1, openWorld} \| null}` |
| `focus` | `{state: "idle"\|"work"\|"break"\|"ready"\|"paused", sessionId, phaseStartedAtMs, phaseEndsAtMs, remainingMs, creditedMs, cycle, cycles, target: {kind, label, workspaceId?, appClass?, questRef?} \| null, calm}` |

Full quest details are fetched on demand (`quests.get`) to keep snapshots within the frame
budget.

**Methods:**

| Method | Grant | Params | Result |
| --- | --- | --- | --- |
| `markers.reveal` | `shell.control` | `{durationMs?: 1000..15000}` | `{revision}` |
| `guidance.get` | `state.read` | `{}` | settings snapshot `{config, defaults, overrides, ranges, options, path, error}` (the `player.get` pattern) |
| `guidance.set` | `quest.control` | `{patch}` | settings snapshot |
| `quests.list` | `state.read` | `{states?, sources?}` | `{quests: QuestSummary[≤256]}` |
| `quests.get` | `state.read` | `{questRef}` | `{quest: QuestDetail}`: definition, state, per-objective progress, links |
| `quests.track` | `quest.control` | `{questRef \| null}` | `{revision}` |
| `quests.accept` / `quests.abandon` / `quests.resume` | `quest.control` | `{questRef}` | `{revision}` |
| `quests.create` | `quest.control` | `{quest}` (personal quest model) | `{revision, questRef}` |
| `quests.update` / `quests.delete` | `quest.control` | `{questRef, quest?}` (personal only) | `{revision}` |
| `quests.mark` | `quest.control` | `{questRef, stepId, objectiveId}` (`manual` objectives and **Mark done myself** slots) | `{revision}` |
| `quests.link` | `quest.control` | `{questRef, objectiveId, link: {source, key?, event?, match?, when?, confirm} \| {manual: true} \| null}` | `{revision}` |
| `quests.confirm` | `quest.control` | `{creditId, accept}` | `{revision}` |
| `quests.provide` / `quests.withdraw` | `quest.provide` | `{quests: Quest[≤64]}` / `{}` | `{revision}` |
| `focus.start` | `quest.control` | `{target?, questRef?, objectiveId?, overrides?}` | `{revision, sessionId}` |
| `focus.pause` / `focus.resume` / `focus.skip` / `focus.stop` | `quest.control` | `{}` | `{revision}` |
| `focus.history` | `state.read` | `{days?: 1..365}` | `{intervals: [...]}` (bounded, newest first) |

`questRef` is `{source, id}`. Mutations follow RFC-0003: serialised, return only when
applied, -32003 for unknown quests, -32004 for an illegal transition (accepting a completed
quest), -32007 for editing a non-personal quest, -32008 over the limits.

**Events** (transient presentation hints carrying `sessionId` and `revision`; state stays
authoritative):

| Event | Params |
| --- | --- |
| `quest.progress` | `{questRef, kind: "objective"\|"step"\|"completed"\|"available"\|"offered"\|"failed"\|"confirm", stepId?, objectiveId?, progress?, unlocks?, creditId?}` |
| `focus.phase` | `{sessionId, phase: "work"\|"break"\|"ready"\|"paused"\|"ended", cycle, cycles, creditedMs, suggestion?: {markerId, label}}` |

**Projection.** `spatial.projection` entries gain an optional `markerId`, so a shell that
sets `markers.core_draw: false` can draw markers itself with the existing timestamp and
coordinate contract.

**Overlay style.** `overlay.style` gains `questColor` and an optional
`iconAtlas.markerIcons: {class: index}` map.

### Grants

| Grant | Allows | Typical holder |
| --- | --- | --- |
| `state.read` (existing) | Reading markers, quests and focus state; `quests.list`/`get`, `focus.history`, `guidance.get` | Shell, HUD, CLI |
| `shell.control` (existing) | `markers.reveal` | Shell |
| `quest.control` (new) | Every quest and focus mutation, linking, confirmations, guidance settings | Reference shell, CLI. Never a world. Extensions only with explicit approval, and even then not `quests.link` into quests they don't provide. |
| `quest.provide` (new) | Providing and withdrawing quests in the extension's own namespace | Approved extensions |
| `data.publish` (existing) | Publishing keys and events (RFC-0003, RFC-0013); unchanged | Source helper, extensions |

The extension manifest gains a `quests` contribution ID beneath the extension ID (RFC-0007
rules) so approval can show "provides quests".

### Input, schema and files

| Artefact | Change |
| --- | --- |
| Input file (v2) | Tap/hold pairs; new world action `markers.reveal` (default `Tab`), migrated in; the generated keymap gains the row and a note on taps. |
| `schema` IPC | New version with the state keys, methods and events above; inheritance test; shared version helper. |
| `schema` extensions | `extensions/quests.schema.json` (`com.hyprune.quests` 0.1, then 0.2 for unlocks). |
| `schema` files | `quests/personal.schema.json`, `guidance.schema.json` (the settings file `$XDG_CONFIG_HOME/hyprune/guidance.json`), focus history line schema. |
| World format (P3) | `objects[].unlock` / `unlockHides`; reachability validation in core and `hyprune-world-check`. |
| SDK | Types, mock core support, CLI: `hyprune quest add "Write the release notes" --step Draft --focus 2`, `hyprune quest list`, `hyprune focus start [--work 50 --break 10]`, `hyprune focus stop`. |
| core docs | `docs/CHANGELOG.md` entry per version. |

### Shell pieces

| Piece | Where | Notes |
| --- | --- | --- |
| Quests page | Director, after Map | List, details, new-quest form, links, confirmations |
| Map markers | Director Map | Same list, level-filtered |
| Quest tracker | HUD, under the existing status | Tracked quest, current step, progress. Collapses to one line in calm mode. |
| Focus timer chip | HUD | Ring, mm:ss, phase, cycle dots, credit arc; optional desktop chip |
| Toasts and banner | HUD layer | Theme tokens, reduced-motion variants, calm-mode queue |
| Compass ticks | HUD (concepts that have a compass) | Marker bearings from `markers.list` and `hud.pose` |
| Hold ring delay | HoldRing | `holdRingDelayMs`, local |
| Settings → Guidance | Director Settings | Marker, quest and focus settings through `guidance.set` |

## Phasing

| Phase | Scope | Depends on |
| --- | --- | --- |
| **P1** | Tap/hold pairs and `markers.reveal`; markers from the waypoint, route, areas and homes, workspaces and `spatial.world.places`; tiers, budget, edge arrows, persistent tracked marker; Quests page with **personal quests** (`manual`, `reach` to areas, places or workspaces, `focus` objectives); focus sessions with the HUD timer, calm mode (markers and toasts; the NPC part once RFC-0010 is accepted), break suggestions from places; persistence; IPC version as above, `quest.control`. | Nothing new |
| **P2** | `com.hyprune.quests` 0.1: world-authored `points` and quests, `offer` markers, NPC-given and NPC-advanced steps, `interact` and `place` objectives, `discover` objectives, discovery tracking. | RFC-0011 P2 for NPC interactions; RFC-0010 for characters |
| **P3** | `signal` objectives on RFC-0013 keys and events, slots, links, confirmation; `quests.provide` and `quest.provide`; machines as targets; unlocks, the world-format hook, world progress, Explore freely, daily caps. | RFC-0013 data keys and events; a world-format version |

P1 acceptance:

- Input tests for releases at 50, 999 and 1001 ms with `longHoldMs = 1000`, mode change while
  held, and Shift held.
- A nested-session check that a tap never shows the hold ring with the default delay.
- Marker budget, stacking and reticle exclusion verified on captures.
- Focus credit tests: focus switches inside and beyond the grace period, idle, lock, the
  world inactive.
- Persistence round trip and world-update ID matching.
- Reduced-motion variants.
- A review confirming the focus path reads no window contents or titles into history.
- Every marker draw saves and restores GL state and runs nothing that makes the compositor
  render. No cursor transitions are added, so the supervised live checklist is unchanged.

## Open questions

1. **Reveal length and repeat tap.** 4 s by default. Should a second tap restart the timer
   (proposed) or pin the markers until the next tap?
2. **Persistent tracker default.** `edge` (proposed) or `off`?
3. **Focus credit default.** `focus` mode with 30 s grace and 180 s idle (proposed), or wall
   time by default?
4. **Failure.** World quests can never fail (proposed). Should personal quests with a due
   date fail, or just show "overdue"?
5. **Physical gates.** Are collision-changing unlocks (a bridge appears, a gate opens)
   acceptable, or only cosmetic, vista and dialogue unlocks plus Explore freely?
6. **Daily caps.** 6 intervals and 12 signals per day toward world progress (proposed), or no
   cap?
7. **Personal quest scope.** Global with markers in any world (proposed), or per world?
8. **Quests tab position.** Directly after Map (proposed)?

## Amendment: P1 in IPC 0.21

P1 shipped as IPC **0.21** ([schema](/reference/schema/ipc/0.21/), core
`docs/CHANGELOG.md`). It follows this RFC except where noted here.

**Authority.** hypruned owns personal quests, focus sessions, the guidance settings and
their files, as proposed. The marker *list* is resolved in the plugin, because every
target resolves against the loaded world (area walls, zones, places, workspace homes)
that only the plugin holds; hypruned sends it the quest, focus-target and break markers
to resolve, the reach objectives to watch and the marker settings, over the private
bridge. The plugin sends back facts only: the keyboard-focused window as app class and
workspace (never a title), a last-input timestamp rounded to the second, the session
lock and which reach targets hold the eye. Budget, stacking and labels are per frame and
per output, so they run in the plugin's draw path with that frame's camera; the list in
state is the single answer every shell reads.

**State.**
- `markers` also carries `coreDraw`. In toggle mode `reveal.holdMs` is 0.
- `focus` also carries `pausedState`, `phaseMs` (planned length of the current or paused
  phase), `crediting`, `breakKind` and `countMode`. `creditedMs` and `crediting` are
  sampled at most every 10 s and at phase changes, so the state is not republished every
  second; shells count down from `phaseEndsAtMs`.
- `quests.active[].step` is `{id, title, progress: [done, of]}`; `progress` counts
  required steps.

**Targets.** 0.21 resolves `position` (optionally with `worldId`, so a personal position
target shows only in that world), `zoneId`, `areaId`, `placeId` and `workspaceId`. The
other target kinds arrive with the features they need. A workspace target resolves to its
home's wall in the loaded world, and as a reach target it means "in that home's area".

**Personal quests.** Objectives are `manual`, `reach` and `focus`. A step may carry a
`target` (the "do this at the workshop" marker); a reach objective without its own target
uses the step's. The focus objective's session filter is named `focusTarget`
(`quest` or `any`), not `target`, so `target` always means a place. Personal quests are
created active and global; an active quest past its `expires` becomes `failed`; resuming
a failed quest drops its date. At most 64 personal quests.

**Events.** `focus.phase` names the focus session `focusSessionId`; `sessionId` stays the
IPC session every event carries. `quest.progress` also carries `title`, and for steps
`stepTitle` and `nextStepTitle`, so a shell can toast without a `quests.get`.

**Focus sessions.** The running session is also kept in
`$XDG_STATE_HOME/hyprune/focus/session.json`, so a restarted core resumes it paused. A
skipped work interval moves on to its break; a waiting break can be skipped into the next
work interval; `focus.resume` starts the next interval from `ready`. Break suggestions
pick a place 30-150 m away, else an area home; route-graph reachability is not checked
yet. `focus.calm_npc_distance` is stored but has no effect until RFC-0010 characters
honour it. For tests, `HYPRUNE_FOCUS_TIME_SCALE` divides every focus duration.

**Input.** A tap/hold pair on an unmodified chord also works with Shift or Ctrl held, so
sprinting doesn't block the reveal. A release at or after `longHoldMs` that arrives before
the hold fired is the hold (releases at 999 and 1001 ms with `longHoldMs = 1000` are a tap
and a hold).

**Drawing.** The waypoint keeps its own world-locked marker (RFC-0005) and gets only the
edge arrow from this system. Edge arrows toward the same direction stack like icons. Icons
are 24 px at 1080p and scale with the output up to 2x. Labels use the overlay font, which
is ASCII.

**Not in 0.21.** `quests.link`, `quests.confirm`, `quests.provide`/`withdraw` and the
`quest.provide` grant; `signal`, `discover`, `interact` and `place` objectives; world
quests (`com.hyprune.quests`), unlocks, world progress and daily caps (P2/P3); compass
ticks; `iconAtlas.markerIcons`.
