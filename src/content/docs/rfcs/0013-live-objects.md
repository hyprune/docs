---
title: "RFC-0013 — Live objects: data bindings, machines and flows"
description: "Objects that show the state of real systems: declarative bindings from published data to authored visual states, ready-made machines, items on tracks and a no-code source helper."
---

**Status: draft · proposed 2026-10-11.** Nothing here is implemented. It builds on world
format 0.8 placed objects ([RFC-0004](/rfcs/0004-world-format/#amendment-world-08-placed-world-objects)),
the extension data channel ([RFC-0003](/rfcs/0003-ipc/#publishing-authority-and-bootstrap),
[RFC-0007](/rfcs/0007-extensions/)) and two drafts written alongside it: [RFC-0011](/rfcs/0011-objects/) (world
objects: the object manifest, traits, slots, user placement, paths, tracks and pooled items)
and [RFC-0012](/rfcs/0012-quests/) (quests, markers and focus sessions). It fills what those drafts reserve for it,
the `machine` trait, the meaning of `slots`, what creates items and the keys and events that
`signal` objectives consume, and does not redefine anything else. [Depends on](#depends-on)
lists exactly what it uses.

## Goal

A world can show more than flat windows. A CI pipeline is a conveyor whose items are jobs; a
queue is a stack of crates; servers are racks whose lights show health; a deploy is a lift; a
build monitor turns while a build runs, goes red when it fails and celebrates when it
passes; a mailbox shows how many messages wait. The world becomes a **visualisation of real
results and tasks**, and the same signals move quests forward.

Three properties are required:

1. **No code is needed.** A user places a ready-made machine and points each of its inputs
   at their data with a form: a URL and a field picker with a live preview, a command, or a
   timer. Power users script sources or publish data from their own extensions.
2. **No code runs in core.** Core receives published scalars through the existing data
   channel and maps them to authored visual states with a small declarative language. It
   never makes a network request, runs a command, opens a path a source names, or reads
   window content or titles for a binding.
3. **It costs nothing when nobody looks.** Bound changes produce frames only while the object
   is visible, through the 0.8 render-on-demand rule, with per-object coalescing and fixed
   caps on items and effects.

## Depends on

From **RFC-0011**, used as defined there:

| Part | Used for |
| --- | --- |
| `object.json` (`formatVersion`, `traits` as an object keyed by trait name, `category: "machines"`) | A machine is an object with the `machine` trait, which RFC-0011 reserves for this RFC. |
| `slots`: `states` (materials or nodes plus a palette of `{id, colour, emission}`), `labels` (pose, size, `maxChars`), `spawns` (pose), `effects` (pose); at most 8 of each kind | The authored parts that bindings drive. RFC-0011 validates their shape in 0.9 and leaves their meaning to this RFC. |
| `decorative` animations (0.8 spin, orbit, bob) | Animation speed targets. |
| Instance IDs: authored `objects[].id`, user placements (`u-…`) | What a binding attaches to; RFC-0012's `machineId`. |
| The configure panel with per-trait sections, and `objects.configure {id, patch}` under `objects.control` | Where bindings are edited and stored. RFC-0011 leaves a section for data bindings. |
| Paths with `use: "track"`, track `items` pools, and the item runtime: `mover` assets with `item: true`, `spacing`, `overflow`, a state index into the item's `states` palette and a label, the caps (256 live items per track, 1,024 per world, 60 spawns per second per track) | Items on tracks. RFC-0011 says what creates items is this RFC's job. |
| The `objects` state key | Instance identity and state; this RFC adds a separate `live` key. |

From **RFC-0012**: `signal` objectives addressed by `source` + `key`, `source` + `event`
(with `match`) or `machine`; marker targets `{machineId}`; linking through `quests.link`;
its trust rules (attestation by the daemon, confirm, no replays, bounded credits). This RFC
supplies the keys, events and machine inputs those objectives read ([Quests](#6-quests)).

## How it fits together

```text
 source (outside core)            core: daemon                              core: plugin (tick)
 ─────────────────────            ───────────────────────────────           ──────────────────────
 HTTP poll   ┐                    integrations state (RFC-0003)             per-instance visual
 command     │  data.publish      │                                         state, applied in the
 file watch  ├──────────────────► │ binding: source/key ──► typed input ──► tick, drawn from the
 webhook     │  values, events,   │ drives: input ──► slot targets          frame snapshot; frames
 timer       │  items             │ (declarative maps, no code)             only while visible
 extension   ┘                    └─► live state (Explain, detail card), quest signals
```

There are two mapping steps, and they are what keeps setup simple:

| Step | Authored by | Maps | Example |
| --- | --- | --- | --- |
| **Binding** | The user, in the configure panel's Data section, or a world | a source's key or event → a machine's typed input | `ci-main/status` `"failed"` → `status: fail` |
| **Drive** | The machine's author (`object.json`) | a typed input → slot targets | `status: fail` → lamp `fail`, belt speed 0, alarm beacon shown |

A user never edits drives; they answer "where does `status` come from?". A machine author
never sees the user's data; they decide how `fail` looks.

## Data: keys, events and items

Data reaches core only through `data.publish` (RFC-0003): a source ID owned by one
authenticated connection and beneath its client ID, an increasing sequence, and at most 32
scalar values that replace the previous publication. In JSON a value is addressed as
`{"source": "<sourceId>", "key": "<name>"}`, as RFC-0012 does; prose writes it
`<source>/<key>`. Key names starting with `_` are reserved for source metadata
([Errors](#errors-and-source-metadata)).

Bindings read four kinds of data. All of them are **state**, not transient messages: they
survive the 30-per-second delta coalescing, reconnects and core restarts, and none needs the
replay log core does not keep.

| Kind | Wire form | Meaning |
| --- | --- | --- |
| **Value** | a scalar in `values` | The current value: a state, a level, a label. |
| **Counter** | a non-negative integer value that only grows | Each increase by *n* fires *n* times (spawn *n* items). The first value core sees and any decrease (a reset) fire nothing, so a restart never fires twice. Coalesced publications lose nothing: the difference still arrives. |
| **Events** (P2) | an optional `events` array: the source's **recent events**, at most 16 `{id, name, fields}` | Each event fires once, the first time core sees its `id`. `id` is a safe integer that increases per source; `name` a dotted slug (≤ 64), `fields` at most 8 scalars (strings ≤ 64). The window is resent with each publication, so a dropped or coalesced publication loses nothing unless more than 16 events happen inside one. |
| **Item set** (P3) | an optional `items` array: at most 64 `{id, label, state, stage}` | The current members of a flow ([Flows](#4-flows)). |

Events can also be derived from values: a binding can fire when a value **becomes** a state
(`status` becomes `ok`). So "the deploy finished" is a transition, "a job started" is a
counter, and "a task in project *release* was completed" is an event with fields. Event
de-duplication is by source and event `id`; when a publisher reconnects, the first
publication re-baselines (events with an `id` at or below the last one seen are ignored, and
a lower numbering after a restart fires nothing until it passes the old one or the source is
removed). RFC-0012's no-replay rule rests on this.

Core publishes one built-in source with no helper, `com.hyprune.core.clock` (`hour`,
`minute`, `second`, `weekday`, `dayFraction`, local time). It reads no host data and lets
worlds ship clocks and day-cycle machines that work without setup.

## 1. Binding model

### Targets

A drive, or a direct binding on a plain object, writes to these targets. Every target names
something the asset authored; nothing sets an arbitrary colour, mesh, path or texture.

| Target | Value | Effect | Phase |
| --- | --- | --- | --- |
| `animation:<node>` | number 0–10 | Speed multiplier for that node's `decorative` animation; 0 stops it. On/off is 0/1. | P1 |
| `state:<slot>` | a palette `id` | Selects an entry of that `states` slot's palette. | P1 |
| `emission:<slot>` | number 0–16 | Multiplies the current palette entry's `emission` for that `states` slot. | P1 |
| `label:<slot>` | text or number | Text on that `labels` slot, formatted by the drive. | P1 |
| `visible:<toggle>` | boolean | Shows or hides the nodes of a `toggles` slot. | P2 |
| `count:<stack>` | integer ≥ 0 | Shows that many copies of the `stacks` slot's node, laid out by the slot, up to its cap; overflow shows the cap and a `+n` label. | P2 |
| `spawn:<slot>` | counter or event | Creates items at a `spawns` slot onto its track. | P2 |
| `effect:<slot>` | event | Plays the `effects` slot's one-shot effect. | P2 |
| `position:<node>` | number 0–1 | Sets a value-driven animation's pose ([below](#value-driven-animations)). | P2 |

**Palette semantics.** A `states` slot applies its current entry to its materials (or to every
material of its nodes' meshes) per instance: `colour` (linear RGB) replaces the base colour
factor's RGB, so a base colour texture is tinted, not lost; `emission` sets the emissive
colour to `colour` × `emission` (strength, as `KHR_materials_emissive_strength`). The first
palette entry is the rest state. An entry with `id: "stale"` is used for stale data
([Staleness](#staleness-and-ttl)). Core draws instances of one asset in different states in
one instanced draw with a per-instance state index.

**Phase-continuous speed.** The 0.8 angle is 2π·(*t*·`speed`/`period` + phases), which jumps
when `speed` changes. A bound animation instead integrates its own phase,
θ += Δ*t*·*s*(*t*)/`period`, where *s* eases to its new value over 300 ms (a machine spins up
and winds down). The 0.8 formula still holds for unbound animations.

### Mapping language

A mapping turns an input value into an output value. The same small language is used by
bindings (data → input) and drives (input → target). It has no variables, loops, string
operations or arithmetic beyond a linear scale.

| Form | Example | Result |
| --- | --- | --- |
| Direct | `{}` | The value, if it fits the target's type. A number never becomes a state name or the reverse: a mismatch is the `error` condition. |
| Cases | `{"cases": [{"equals": "success", "to": "ok"}, {"in": ["queued", "running"], "to": "running"}], "else": "idle"}` | The first matching case's `to`, else `else`. |
| Thresholds | `{"thresholds": [{"below": 10, "to": "ok"}, {"below": 100, "to": "warn"}], "else": "fail"}` | The first threshold the value is strictly below (`atLeast` is the mirror form). |
| Scale | `{"scale": {"from": [0, 500], "to": [0, 1]}, "clamp": true, "round": "ceil"}` | Linear map; `clamp` (default true) limits to `to`; optional `round`: `floor`, `ceil`, `nearest`. |
| Becomes | `{"becomes": "ok", "from": "running"}` | An event: fires once when the mapped value changes into `ok` (optionally only from `running`). |
| Counter | `{"counter": true}` | An event: fires once per increase. |
| Format | `{"format": {"decimals": 0, "compact": true, "unit": "jobs"}}` | For labels: `1234` → `1.2k jobs`. Strings pass through, cut to the slot's `maxChars`. |

At most 16 cases or thresholds per mapping. Comparisons are numeric for numbers, exact and
case-sensitive for strings; booleans compare with `true`/`false`. A missing value takes the
input's `default`. Validation rejects a mapping whose outputs fall outside the target's
domain (a palette `id` the slot does not have, a speed above 10).

### Where bindings live

| Bound instance | Stored in | Edited with |
| --- | --- | --- |
| A **user placement** | Its record in the per-world overlay (RFC-0011), section `data`. | The configure panel's Data section → `objects.configure {id, patch: {data}}`. |
| An **authored instance** | The same overlay, keyed by world ID and object ID. The world package can declare an instance's default mappings (`objects[].data.defaults`), never a source other than `com.hyprune.core.clock`: a world cannot name a user's data. | The same panel; the patch is allowed on authored instances for the `data` section only. |

**Plain objects (P1).** An object without the `machine` trait still has **implicit inputs**,
so P1 needs no new object format: one `number` 0–10 per `decorative` animation (shown as
on/off plus speed), one `enum` per `states` slot (its palette ids) and one `text` per
`labels` slot. A machine replaces these with its declared inputs.

## 2. Data sources

All data is produced outside core and arrives through `data.publish` under the grants of
RFC-0003 and RFC-0007. There are two kinds of producer.

### The source helper (`com.hyprune.sources`)

A bundled, supervised extension that the user configures without code. Each **source** is one
fetch that publishes one source ID, `com.hyprune.sources.<slug>`, with up to 32 picked
fields.

| Kind | Configured with | Publishes | Phase |
| --- | --- | --- | --- |
| **HTTP(S) poll** | URL; `GET`, or `POST` with a fixed JSON body; headers whose values may reference secrets; interval; timeout; **fields**: [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) selections, each typed. | The fields, plus `_status`, `_error`, `_httpStatus`. | P1 |
| **Command** | An argument vector (no shell unless the user picks `sh -c` explicitly), working directory, interval, timeout; output `json` (then fields as above), `number`, `text` (first line) or `lines` (line count). | As above, plus `_exitCode`. | P1 |
| **Timer** | `pulse` (a counter that grows every *N* seconds), `countdown` (seconds left to a time or for a duration), `schedule` (a value from a weekly table, for example `open`/`closed`). | The timer's value. | P1 |
| **File watch** | A file the user picks with the shell's file chooser; output as for commands; re-read on change, debounced 250 ms. | As for commands. | P2 |
| **Webhook in** | A loopback-only endpoint `http://127.0.0.1:<port>/h/<token>`; fields from the posted JSON body. | Each post becomes an event (`name` from a chosen field or `webhook`, up to 8 picked fields), and `received`, a counter. | P3, optional |

Fields can also use three fixed aggregates, so common APIs need no script: `length` (array
length at a pointer), `countWhere` (elements whose sub-pointer equals a value) and `first`
(the first element passing that test, then a sub-pointer). A field typed `counter` must be a
growing number in the response (a build number, a total). A field typed `events` (P2) points
at an array and names the pointers for the event `id`, `name` and fields; the helper keeps the
last 16.

### Third-party publishers

Any extension with the `data.publish` grant publishes sources beneath its extension ID, as
today. To appear in the Data section with names and types, it declares them in its manifest
([manifest 0.2](#extension-manifest-02)). An undeclared source still works; the panel shows
its values untyped.

### Limits

The `data.publish` limits stay: 32 values per source, strings ≤ 256 characters, 16 KiB per
publication, 32 live sources and 64 KiB in total per publisher, 10 publications per second
per source. `events` and `items` count toward the 16 KiB. The helper adds floors so a world
full of machines cannot hammer a server:

| Limit | Value |
| --- | --- |
| Sources | 32 (the per-publisher limit) |
| HTTP interval | ≥ 10 s (≥ 2 s for a loopback URL), default 60 s, ±10% jitter |
| HTTP timeout and body | 1–30 s, default 10 s; 1 MiB (a larger body is an error, not truncated) |
| HTTP behaviour | Honours `429` and `Retry-After`; exponential backoff on errors up to 10 min; no cookies; redirects only within the origin unless the user approves the new origin |
| Command interval and timeout | ≥ 5 s, default 60 s; 1–60 s, default 10 s; the process group is killed on timeout |
| Command output | stdout ≤ 64 KiB (more is an error); the last 4 KiB of stderr kept for the error view |
| Concurrency | 4 fetches at once; a source never overlaps itself |
| File watch | ≤ 1 MiB, ≤ 2 reads per second |
| Webhook | body ≤ 64 KiB, ≤ 10 posts per second per hook, loopback only |
| Preview (`live.sources.test`) | the first 16 KiB of the response, as a JSON tree |

### Staleness and TTL

IPC 0.2 caps `ttlMs` at 60 s, too short for a source polled every five minutes. The first live
objects IPC version raises the cap and adds a stale threshold to `data.publish`:

- `ttlMs` 100 ms–24 h. After it the source is removed, as today, and inputs bound to it are
  **missing**.
- `staleMs` (optional, ≤ `ttlMs`): after it, inputs are **stale**. The helper sets it to
  2.5 × the interval and `ttlMs` to 10 × the interval (at least 1 h), so one late poll does
  not flicker a machine and a dead helper empties it in bounded time.

| Condition | What the machine shows |
| --- | --- |
| **Fresh** | Its mapped state. |
| **Stale** | The last state, dimmed: each `states` slot shows its `stale` entry if it has one, else core's grey-out (saturation × 0.3, emission × 0.25); bound animations ease to 0; labels keep their text with a clock mark. No spawns or effects fire. |
| **Missing** | Each input's `default` (typically the rest state); labels show `—`. |
| **Error** (`_status: "error"`, or a type mismatch) | As stale, plus an error badge on the Explain overlay and the detail card. |

A target driven by several inputs shows the worst condition among them; other targets follow
their own input. Stale and missing data never complete a quest objective
([Quests](#6-quests)).

### Errors and source metadata

The helper publishes every source with reserved keys: `_status` (`ok` or `error`), `_error`
(≤ 256 characters, with query strings, header values and secrets removed), and `_httpStatus`
or `_exitCode`. On an error it **keeps the last good values** in the publication, so a machine
dims rather than resets. The Sources page shows the last error, the last success and the next
attempt.

### Security (normative)

- **Core never makes a network request, runs a command, opens a path a source names, or reads
  window content or titles for a binding.** Its inputs are published data only.
- **The helper is split by privilege.** `sources-net` runs HTTP sources in the RFC-0007
  sandbox with one exception, outbound network: no home directory, no Wayland, no host
  runtime directory, only its IPC connection. `sources-local` runs command and file sources
  **as the user, outside the sandbox**, because useful commands (`gh`, `kubectl`, a project
  script) need the user's own credentials and files. It is trusted local code, like an
  autostart entry, and starts only once the user creates a command or file source.
- **Commands come only from the user.** A command or file source is created only in the
  shell's Data section or Sources page, after a confirmation that shows the exact argument
  vector; changing it asks again. World packages, libraries, object manifests, recipes and
  extensions can never contain or create one. A recipe may *suggest* a command, which the
  user sees in full and confirms.
- **HTTP origins are explicit.** The user approves each URL's origin when creating a source.
  HTTPS is required except for loopback and private-range addresses the user marks as local.
  A public host name that resolves to a loopback or private address is refused unless the
  source is marked local (no DNS rebinding into the local network).
- **Secrets live outside packages and state.** Tokens are stored by name with
  `live.secret.set`, in the Secret Service when available, else in a 0600 file in the
  daemon's state directory. A header references `{"secret": "ci-token"}`. No IPC method
  returns a secret; snapshots, logs, errors, previews and the integrations state never contain
  one. Exported setups carry secret names only.
- **Published values are visible to `state.read` peers** through the `integrations` state, as
  all published data is today. The field picker says so before the user picks a field that
  looks personal (an address, a title).
- The webhook listener binds 127.0.0.1 only, with a 128-bit random path per hook.

## 3. Machines

A **machine** is an object (RFC-0011) with the `machine` trait: its **typed inputs**, the
**drives** from inputs to slot targets, an optional **primary** input and source **recipes**.
It combines with `decorative`, `collidable` and `movable` (a user-placeable machine is
`movable`). A machine is placed, moved, pocketed and removed like any other object.

**Use.** The `machine` trait makes an instance a use target (E/use) for its detail card
([Using a machine](#using-a-machine)). This is narrower than RFC-0011's reserved
`interactive` trait; when that lands, a machine may add its actions.

### Typed inputs

| Type | Declared as | Data section control |
| --- | --- | --- |
| `enum` | `{"type": "enum", "values": ["idle", "running", "ok", "fail"]}` | A key plus a case table, pre-filled from common words. |
| `int` | `{"type": "int", "min": 0, "max": 500}` | A key; optional thresholds. |
| `number` | `{"type": "number", "min": 0, "max": 1}` | A key; a scale from the source's range. |
| `bool` | `{"type": "bool"}` | A key plus an "is true when" case. |
| `text` | `{"type": "text", "maxLength": 32}` | A key, or fixed text. |
| `event` | `{"type": "event"}` | A counter key, an event name (with optional `match`), or "when *input* becomes *value*". |
| `items` | `{"type": "items", "states": ["running", "ok", "fail"]}` | An item-set source and its stage mapping (P3). |

Each input has an `id`, a `label` and an `explain` sentence for the Explain overlay, an
optional `default`, and an optional `repeat` (2–16) for indexed inputs (`health.1` …
`health.8` on a rack). At most 16 inputs per machine, counting repeats. `primary` names the
input a quest or marker means when it names only the machine (default: the first `enum`).

### Slots

The four RFC-0011 slot kinds keep their shape; this RFC gives them meaning and adds optional
fields and four kinds, all in the first format that enables the `machine` trait:

| Slot | RFC-0011 shape | Added here |
| --- | --- | --- |
| `states` | `materials` or `nodes`, `palette` of `{id, colour, emission}` (≤ 16) | Meaning above; the `stale` entry. |
| `labels` | `pose`, `size`, `maxChars` (≤ 64) | Optional `font` (`sans`, `mono`), `align`, `colour`, `plate` (a backing colour). Core rasterises with its bundled fonts; plain text only. |
| `spawns` | `pose` | `track` (a `tracks` slot, or `"port"` for a flow link), `items` (item assets, as a track's `items.assets`), `maxRate` (items per second, ≤ 10, default 2). |
| `effects` | `pose` | `kind` (`burst`, `pulse`, `flash`, `ring`), `colour`, `durationMs` (200–3000). |
| `tracks` **(new)** | | An asset-space track: `points` and `speed` with the RFC-0011 path rules, `items` with RFC-0011's pool fields, an optional `sink` at the end. Each instance gets its own transformed track. Item assets are named as in the package or library that holds the machine. ≤ 4 per asset, ≤ 32 points each. |
| `stacks` **(new)** | | `node` (hidden at rest, drawn instanced), `layout` `{"grid": [x, y, z], "spacing": [m, m, m], "fill": "xzy"}`, `cap` ≤ 64. |
| `toggles` **(new)** | | `nodes` that `visible:` may hide; never a collision proxy. |
| `ports` **(new)** | | `pose`, `direction` (`in`, `out`): where a flow link meets the machine (P3). |

New kinds also allow at most 8 per asset, like RFC-0011's. Labels, stacks, items and effects
are never pick or collision geometry.

States SHOULD differ in more than hue (a lamp that blinks, a raised flag, a symbol on the
label), so colour-blind users can tell them apart; the Explain overlay always names the state
in text.

### Value-driven animations

A lift's cage and a gauge's needle need a pose set by a value, not by time. The `machine`
trait's `positions` list names `decorative` animations that are **value-driven** instead of
clock-driven: `{"node": "needle", "range": [0, 0.75]}` maps the target `position:needle`
0–1 onto that fraction of the animation's cycle (eased over 300 ms), so a needle sweeps
three quarters of a turn and a `bob` cage rises from its lowest to its highest point with
`range` `[0.75, 1.25]`.

### Drives

```json
"drives": [
  {"input": "status", "target": "state:lamp"},
  {"input": "status", "target": "animation:belt-rollers",
   "map": {"cases": [{"equals": "running", "to": 1}], "else": 0}},
  {"input": "status", "target": "visible:alarm",
   "map": {"cases": [{"equals": "fail", "to": true}], "else": false}},
  {"input": "queued", "target": "count:waiting"},
  {"input": "queued", "target": "label:queue", "map": {"format": {"decimals": 0, "unit": "queued"}}},
  {"input": "jobStarted", "target": "spawn:belt-in"},
  {"input": "status", "target": "effect:confetti", "map": {"becomes": "ok", "from": "running"}}
]
```

At most 32 drives per machine. Validation rejects a drive whose target names a slot, node or
palette entry the asset lacks, or whose map can produce a value outside the target's domain.

### Starter machine library (P2)

Delivered in the shared object library (RFC-0011) as original CC-BY-4.0 assets, each with a
palette that works without colour, an `explain` for every input and a **recipe** for common
JSON shapes. Recipes are field and mapping suggestions only (and, for commands, a visible
suggestion the user confirms).

| Machine | Shows | Inputs | Slots used |
| --- | --- | --- | --- |
| `conveyor` | A CI pipeline: jobs ride a belt into a press. | `status` enum[idle, running, ok, fail]; `jobStarted` event; `queued` int 0–64; `lastJob` text | belt track, spawn, waiting stack, lamp states, label, burst |
| `crate-stack` | A queue: one crate per *n* items, a warning stripe above a threshold. | `depth` int 0–500; `level` enum[ok, warn, fail] | stack (cap 48, *n* set in the drive's scale), count label, states |
| `server-rack` | Hosts: one light per unit. | `health` enum[ok, warn, fail, off] × 8; `name` text | 8 `states` slots, label |
| `lift` | A deploy: the cage rises with progress, doors open when done. | `status` enum[idle, deploying, done, failed]; `progress` number 0–1; `environment` text; `finished` event | value-driven cage, door toggles, label, burst |
| `build-beacon` | Build monitor: the rotor turns while running, red on failure, fireworks on success. | `status` enum[idle, running, ok, fail]; `progress` number 0–1 | rotor animation, ring states with emission by progress, burst |
| `counter-kiosk` | Mailbox or ticket counter. | `count` int 0–9999; `level` enum[ok, warn, fail] | number label, flag toggle (raised when count > 0), states |
| `gauge` | Any level on a dial. | `value` number 0–1; `caption` text | value-driven needle, label |
| `signal-lamp` | The smallest machine: one status. | `status` enum[off, ok, warn, fail] | states |

## 4. Flows

A **flow** connects machines with tracks so a pipeline of steps can be seen spatially: build →
test → deploy as three machines joined by belts, with jobs moving between them.

```json
{"id": "release-line", "items": {"source": "com.hyprune.sources.ci-jobs"},
 "stages": [
   {"id": "build",  "object": "u-3f2a10", "in": "belt-in", "out": "out"},
   {"id": "test",   "object": "u-9c41e7", "in": "in", "out": "out"},
   {"id": "deploy", "object": "u-51d0b2", "in": "in"}],
 "links": [
   {"from": "build", "to": "test",   "track": "user/path-7"},
   {"from": "test",  "to": "deploy", "track": "user/path-8"}],
 "exits": {"ok": "effect:confetti", "fail": "sink"}}
```

Stages name instances and their `ports` (or a `spawns` slot for the first stage); links name
RFC-0011 `track` paths from one port to the next. A flow is user state in the per-world
overlay; a world may author one between its own instances, without a source.

### Item model

The flow's source publishes an **item set**: at most 64 `{id, label, state, stage}` (`id` and
`label` ≤ 64 characters, `state` and `stage` slugs). The helper builds it from a JSON array
with a pointer per field. Core treats it as **the current truth, not a queue of events**:

| Between two publications | Shown as |
| --- | --- |
| A new `id` | Created at its stage: the first stage's spawn, or the stage's `in` port. |
| Same `id`, later stage | Leaves the current `out` port and travels the link tracks to the new stage, through intermediate stages it skipped. |
| Same `id`, new state | Its palette entry changes. |
| `id` gone | Exits by the flow's `exits` entry for its last state (a burst for `ok`, a sink for `fail`) and returns to the pool. |
| Earlier stage (a retry) | Moves there with a flash; items never run backwards along a track. |

Items are RFC-0011 items: instances of the link track's item assets with a state index and a
label (drawn on a small plate within 6 m of the player), pooled, under RFC-0011's caps and
`spacing`. Within a stage, items keep **first-seen order**, not the array's, so an API that
reorders its list does not shuffle the belt; items changing stage in one update enter the
link in array order.

### When data outpaces the animation

Core keeps only the latest target for every item, so it never falls behind unboundedly:

1. Travel time on a link is its length ÷ track speed, capped at 4 s; a longer link runs
   faster.
2. A change that arrives while an item travels **retargets** it; it never queues a second
   trip.
3. More than 16 items entering one link within a second travel as one **batch** item `×n`,
   which splits again at the destination.
4. Counter and event spawns (no item set) create at most `maxRate` items per second per spawn
   slot. The backlog is a number, not a queue; above 16 it becomes one batch item. Every
   creation stays under RFC-0011's per-track and per-world caps, so its `overflow` rule is a
   last resort, not the normal path.
5. A machine showing more than its stack or track cap shows the cap and a `+n` label.
6. With motion off ([below](#7-performance-and-render-rules)) items appear at their target
   stage at once.

## 5. Setup (normative UX)

The reference shell MUST provide this flow; other shells SHOULD. Every step is a form; nothing
needs a text editor.

1. **Place a machine** from the Director's Objects catalog (RFC-0011): pocket it, place it with
   tool 5, adjust it with tool 4.
2. **The configure panel opens** on placement, as RFC-0011 does for any configurable object,
   with its **Data** section first. It lists the machine's typed inputs with their labels and
   explain text, each "Not connected".
3. **For each input, pick a source:**
   - **An existing key or event:** a searchable list of live sources and their keys, with each
     current value and type. Keys whose type cannot fit the input are greyed out.
   - **New source → URL:** a URL, and optionally a header with a secret. The panel calls
     `live.sources.test` and shows the response as a collapsible JSON tree with values;
     clicking a value picks its pointer, and arrays offer `length` and `countWhere`. The
     input's live value appears beside it.
   - **New source → Command:** an argv editor, a confirmation that shows exactly what will
     run, a test run with an output preview, then the same field picker.
   - **New source → Timer:** pulse, countdown or schedule.
4. **Optional mapping:** for `enum` inputs a case table pre-filled from common words
   (`success`/`passed`/`green` → `ok`; `failure`/`failed`/`red`/`error` → `fail`;
   `pending`/`queued`/`running`/`in_progress` → `running`); for numbers a range and
   thresholds; for events "each increase", "each event named …" or "when it becomes …". The
   machine in the world previews the mapping live.
5. **Done.** One `objects.configure` patch commits the bindings atomically.

A recipe pre-fills steps 3 and 4 for a known JSON shape, so the common case is "paste the
URL, Done". The Sources page in Settings lists every source with its status, errors, last
values and the machines and quests that use it.

### Explain overlay

Visual metaphors need legends. **Explain** (a Director button and the `live.explain` world
action, unbound by default) draws callouts at the slots of the aimed machine, or of every live
machine in view:

```text
 ┌ Status: running  ← ci-main/status "in_progress" · 12 s ago
 ├ Crates: 7 queued (1 crate = 1 job)
 └ Belt: one item per started job
```

The shell draws callouts at slot positions core projects as `spatial.projection` markers of
kind `live-slot`: the input label, mapped and raw values, the source, the age, any error, and
the quest objectives that watch it.

### Using a machine

E/use on a machine opens its **detail card** in the shell: inputs, values, sources, ages and
errors, an Edit button for the Data section, and the binding's optional **link**: a URL
(opened by the shell with the desktop's URL handler after a first-use confirmation) or a
window rule (focused through the existing `surface.focus`/`workspace.focus`). Core reports the
use and the instance ID; it never opens a URL or starts a program.

## 6. Quests

RFC-0012 `signal` objectives read the same data, so there is one signal path. This RFC fixes
what their addressing means:

| RFC-0012 form | Reads |
| --- | --- |
| `source` + `key` | A value or counter as defined [above](#data-keys-events-and-items). |
| `source` + `event` (+ `match`) | Events by `name`, matched on `fields`; each event `id` counts once. |
| `machine` (an instance ID) | The machine's `primary` input, or the input named by an optional `input`, **after** its binding's mapping. So `"when": {"op": "becomes", "value": "ok"}` works whatever API feeds the machine, and the objective follows the machine if the user rebinds it. |

- Stale, missing and error conditions never satisfy a `when`; a source coming back fresh
  re-baselines `becomes` and `increases` without crediting the jump.
- A machine is a marker target (`{machineId}`), and the Explain overlay names the objectives
  that watch it.
- Quest conditions, linking, confirmation, credit limits and storage stay RFC-0012's. The
  daemon evaluates signals next to bindings, from the same coalesced values.

## 7. Performance and render rules

These extend the 0.8 and RFC-0011 rendering rules; everything there still holds.

- **Where work happens.** The daemon evaluates bindings and drives when data changes and sends
  the plugin a compact per-instance visual state (state indices, speeds, emission factors,
  toggle mask, counts, positions, label text, pending spawns and effects) over the private
  bridge. The plugin applies it in the tick, outside the render pass, into the immutable frame
  snapshot. Nothing in the render pass parses JSON, evaluates a mapping, rasterises text or
  allocates.
- **Coalescing.** At most 4 visual updates per second per instance (configurable 1–10); the
  latest wins, counters and events accumulate. Label text changes at most twice a second per
  slot. Glyphs rasterise on a CPU worker into a per-world atlas; uploads count toward the 2 ms
  per-frame upload budget.
- **Frames only while visible.** A bound change on an instance that is not visible (swept
  bounds and shared visibility, as in 0.8) updates its state and forces no frame; the player
  sees the latest state when it comes into view. A change on a visible instance asks for frames
  only for its transition (the 300 ms ease, an effect's duration, item travel). A bound
  animation at speed 0 is still, so an idle machine costs nothing.
- **Caps**, fixed at load: 64 bound instances per world, 512 stacked copies, 8 concurrent
  effects of at most 48 particles; items follow RFC-0011's caps. Over a cap the result degrades
  visibly (batch items, `+n` labels, skipped effects) and memory never grows.
- **Motion** (`live.motion`): `auto` (default: items travel and machines spin while the world
  is active and the player present, and pause on battery and USB-C power, as [RFC-0010](/rfcs/0010-npcs/) does for
  characters), `always`, `still` (states, labels, counts and flashes only; no spins or travel;
  effects become flashes) and `off` (rest pose and rest state). `graphics.reduced_motion: true`
  forces `still`. States always change, so a reduced-motion user still sees a failure.
- **Render-pass safety.** No binding, effect or item causes compositor work; links and focus go
  through the shell and the existing deferred methods. GL state is saved and restored as for
  every object pass.
- **Offload.** The RFC-0009 offload renderer draws scene geometry only, and a world with
  objects already uses the in-process renderer. Live objects add nothing to offload; if a later
  offload version draws objects, the per-instance visual state is part of its frame snapshot.

## Example: a CI conveyor end to end

**1. The machine** (`object.json` in the shared library; geometry fields abbreviated):

```json
{
  "formatVersion": "0.10", "id": "conveyor", "version": "1.0.0", "name": "Conveyor",
  "category": "machines", "tags": ["ci", "pipeline"], "scene": "object.glb", "license": "CC-BY-4.0",
  "attribution": [{"path": ".", "author": "Hyprune contributors", "license": "CC-BY-4.0"}],
  "bounds": {"min": [-2.2, 0, -0.8], "max": [2.2, 1.9, 0.8]},
  "traits": {
    "decorative": {"animations": [
      {"node": "belt-rollers", "type": "spin", "axis": [1, 0, 0], "pivot": [0, 0.6, 0], "period": 1.2}]},
    "collidable": {"node": "proxy"},
    "movable": {"surfaces": ["floor"]},
    "machine": {
      "primary": "status",
      "inputs": [
        {"id": "status", "type": "enum", "values": ["idle", "running", "ok", "fail"], "default": "idle",
         "label": "Pipeline status", "explain": "Lamp colour and belt motion: the belt runs while the pipeline runs."},
        {"id": "jobStarted", "type": "event", "label": "Job started", "explain": "Each started job drops a crate onto the belt."},
        {"id": "queued", "type": "int", "min": 0, "max": 64, "default": 0,
         "label": "Queued jobs", "explain": "Crates waiting beside the entry, one per queued job."},
        {"id": "lastJob", "type": "text", "maxLength": 24, "label": "Last job", "explain": "The most recent job's name."}],
      "drives": [
        {"input": "status", "target": "state:lamp"},
        {"input": "status", "target": "animation:belt-rollers", "map": {"cases": [{"equals": "running", "to": 1}], "else": 0}},
        {"input": "queued", "target": "count:waiting"},
        {"input": "lastJob", "target": "label:sign"},
        {"input": "jobStarted", "target": "spawn:belt-in"},
        {"input": "status", "target": "effect:confetti", "map": {"becomes": "ok", "from": "running"}}],
      "recipes": [{"name": "Pipeline summary JSON", "fields": {
        "status": "/pipelines/0/status", "jobStarted": "/pipelines/0/jobs_started",
        "queued": {"countWhere": {"array": "/jobs", "pointer": "/status", "equals": "queued"}},
        "lastJob": "/pipelines/0/last_job/name"}}]}
  },
  "slots": {
    "states": [{"id": "lamp", "materials": ["lamp-glass"], "palette": [
      {"id": "idle", "colour": [0.35, 0.45, 0.6], "emission": 0.5},
      {"id": "running", "colour": [1.0, 0.7, 0.2], "emission": 2},
      {"id": "ok", "colour": [0.3, 1.0, 0.45], "emission": 2},
      {"id": "fail", "colour": [1.0, 0.2, 0.15], "emission": 3},
      {"id": "stale", "colour": [0.4, 0.4, 0.4], "emission": 0.2}]}],
    "labels": [{"id": "sign", "pose": {"position": [0, 1.75, 0.81], "rotation": [0, 0, 0, 1]},
                "size": [1.2, 0.3], "maxChars": 24, "font": "mono"}],
    "tracks": [{"id": "belt", "speed": 0.6, "points": [
      {"position": [-2, 0.8, 0], "type": "line"}, {"position": [2, 0.8, 0], "type": "line"}],
      "items": {"assets": ["job-crate"], "max": 24, "spacing": 0.45}, "sink": true}],
    "spawns": [{"id": "belt-in", "pose": {"position": [-2, 0.8, 0], "rotation": [0, 0.707, 0, 0.707]},
                "track": "belt", "items": ["job-crate"], "maxRate": 2}],
    "stacks": [{"id": "waiting", "node": "crate", "cap": 64,
                "layout": {"grid": [4, 4, 4], "spacing": [0.35, 0.35, 0.35], "fill": "xzy"}}],
    "effects": [{"id": "confetti", "pose": {"position": [0, 2.0, 0], "rotation": [0, 0, 0, 1]},
                 "kind": "burst", "colour": [1.0, 0.8, 0.2], "durationMs": 1500}]
  }
}
```

**2. The source** (helper configuration, created by the Data section; daemon-owned user
state):

```json
{"id": "ci-main", "kind": "http",
 "url": "https://ci.example.com/api/projects/42/summary",
 "headers": {"Authorization": {"prefix": "Bearer ", "secret": "ci-token"}},
 "intervalS": 30, "timeoutS": 10,
 "fields": [
   {"name": "status", "pointer": "/pipelines/0/status", "type": "string"},
   {"name": "queued", "countWhere": {"array": "/jobs", "pointer": "/status", "equals": "queued"}, "type": "int"},
   {"name": "jobsStarted", "pointer": "/pipelines/0/jobs_started", "type": "counter"},
   {"name": "lastJob", "pointer": "/pipelines/0/last_job/name", "type": "string"}]}
```

The helper publishes it every 30 s with `staleMs` 75,000 and `ttlMs` 3,600,000:

```json
{"sourceId": "com.hyprune.sources.ci-main", "sequence": 118, "ttlMs": 3600000, "staleMs": 75000,
 "values": {"status": "running", "queued": 3, "jobsStarted": 5112, "lastJob": "unit-tests",
            "_status": "ok", "_httpStatus": 200}}
```

**3. The binding** (`objects.configure` on the user placement):

```json
{"id": "u-3f2a10", "patch": {"data": {
  "inputs": {
    "status": {"source": "com.hyprune.sources.ci-main", "key": "status",
               "map": {"cases": [{"equals": "success", "to": "ok"},
                                 {"in": ["failed", "canceled"], "to": "fail"},
                                 {"in": ["created", "pending", "running"], "to": "running"}], "else": "idle"}},
    "jobStarted": {"source": "com.hyprune.sources.ci-main", "key": "jobsStarted", "map": {"counter": true}},
    "queued": {"source": "com.hyprune.sources.ci-main", "key": "queued"},
    "lastJob": {"source": "com.hyprune.sources.ci-main", "key": "lastJob"}},
  "link": {"url": "https://ci.example.com/group/project/-/pipelines"}}}}
```

**4. What core shows.** `status: "running"` → input `running` → lamp `running`, belt speed 1.
`queued: 3` → three crates in the stack. `jobsStarted` 5110 → 5112 → two crates enter the belt
(at most two per second) and ride to the sink. `lastJob` → the sign reads `unit-tests`. When
the pipeline passes, `status` becomes `success` → `ok`: the lamp turns green, the belt winds
down and, because it came from `running`, the confetti plays once. A quest objective
`{"type": "signal", "machine": "u-3f2a10", "when": {"op": "becomes", "value": "ok"}}`
completes at the same moment. If the API stops answering, after 75 s the conveyor dims; after
an hour it shows its rest state and `—`.

## 8. Contract plan

### Object and world format

RFC-0011 defines object manifests and world format 0.9 (P2) and 0.10 (P3: movers and items).
This RFC needs **no format change for P1**: implicit inputs use 0.9 slots and animations.
From P2 it needs world format **0.10**, the same format bump as RFC-0011's movers and items (P3), since spawning items onto tracks needs them; the two land together:

| Change | Where |
| --- | --- |
| The `machine` trait enabled: `inputs`, `drives`, `primary`, `positions`, `recipes`; combinations with `decorative`, `collidable`, `movable` | `object.json`, inline `objectAssets[]` |
| Slot field additions (`labels`, `spawns`, `effects`) and the new kinds `tracks`, `stacks`, `toggles`, `ports` | `slots` |
| `objects[].data`: `defaults` (mappings a user binding starts from) and bindings to `com.hyprune.core.clock` only | `objects[]` |
| `flows[]` between the world's own instances (P3; this format or the next) | top level |

Every valid 0.9 document is valid as 0.10. The schema, the shared validator, core and
`hyprune-world-check` check every rule above, the scene-dependent ones (nodes, materials,
palette ids, map domains) with the asset glTF.

### IPC (one version per phase, numbered at acceptance)

| Phase | Method or change | Grant |
| --- | --- | --- |
| P1 | `data.publish`: `ttlMs` up to 86,400,000, optional `staleMs`, reserved `_` keys | `data.publish` |
| P1 | `objects.configure` patch section `data` (`inputs`, `link`), also allowed on authored instances | `objects.control` |
| P1 | `live.sources.list` → configs without secrets, status, last error, users; `live.sources.set {source}` / `live.sources.remove {id}` | `state.read` / **`live.control`** |
| P1 | `live.sources.test {source}` → `{preview, values, error?}` (runs once, publishes nothing) | `live.control` |
| P1 | `live.secret.set {name, value}` / `live.secret.remove {name}` / `live.secret.list` (names only) | `live.control` |
| P1 | State key **`live`**: per bound instance `{id, inputs: {<id>: {value, raw, source, key, condition, ageMs}}, link}`, at most 64 entries, published on change and never per frame; `condition` is `fresh`, `stale`, `missing` or `error` | `state.read` |
| P2 | `data.publish` optional `events` (≤ 16); `spatial.projection` marker kind `live-slot`; `live.explain` world action | `data.publish` / `state.read` |
| P3 | `data.publish` optional `items` (≤ 64); `live.flows.set` / `live.flows.remove`; `live` gains `flows` with per-link counts | `data.publish` / `live.control` |

`live.control` is a new grant for the trusted shell and CLI; a world can never request it.
The daemon owns source configurations and secrets (atomic 0600 replacement, like other user
state) and delivers them to the helper on its own connection, a `sources.config`
notification with secrets resolved at fetch time. Only the bundled helper holds
**`sources.host`**, the grant that receives them; the shell never talks to the helper
directly (RFC-0003). The existing `data.object.bind` and 0.3 `dataObjects` stay: a data anchor
can host a machine, and a shell can still present data itself.

### Extension manifest 0.2

- `contributes.dataSources`: `[{sourceId, label, keys: {<name>: {type, label, values?, min?, max?}}, events?: [{name, label, fields}]}]`,
  so the Data section lists third-party keys and events with names and types.
- `sandbox.network` stays `false` for third-party extensions. The helper's `sources-net`
  profile (outbound network, nothing else) and `sources-local` (trusted, unsandboxed) are
  host-defined profiles of a bundled component, not manifest options.

### Shell

The Data section of the configure panel with the field picker and live preview; the Sources
page (sources, status, errors, secrets); the Explain overlay; the machine detail card with its
link; a "Live" filter in the Objects catalog.

### Phasing

| Phase | Delivers | Needs | Proven when |
| --- | --- | --- | --- |
| **P1** | Bindings for animation speed, state palette, emission and labels on user-placed objects through implicit inputs; the helper's HTTP, command and timer sources; secrets; the Data section and Sources page; staleness. | RFC-0011 P1 (catalog, placement, configure, 0.9 manifests with slots). | A user binds a placed object to a URL and to a command without editing a file, and it dims when the URL stops answering. Nested tests cover a mock HTTP server, a timeout, a `429`, a removed source and a reconnecting helper. |
| **P2** | The `machine` trait and the starter library; counts, value-driven animations, toggles, effects; events; spawns on tracks; file watch; the Explain overlay. | RFC-0011 P3 for spawns (items on tracks). | Each starter machine binds from its recipe in under a minute; a source at 10 publications per second with counters and events stays within the caps. |
| **P3** | Flows and item sets; webhooks; machine and event signals for RFC-0012. | RFC-0012 P3. | A three-stage flow fed a replayed job log never lags more than one travel time; a quest step completes when a deploy finishes. |

Contract changes follow the usual path: RFC amendment, schema version and tests, SDK types and
the core changelog.

## Alternatives considered

- **Scripts in core** (an embedded language to compute visuals): rejected. It breaks the
  data-only world rule, puts untrusted code next to the compositor and is not needed: sources
  compute anything outside core, and mappings cover the visual step.
- **Transient event notifications** for spawns and celebrations: rejected for counters,
  transitions and the resent event window, which survive coalescing and reconnects without a
  replay log.
- **Arbitrary colours and text styles from data:** rejected for authored palettes, which keep
  machines legible and on-style in every world.
- **glTF material variants (`KHR_materials_variants`) for palettes:** a good fit for states
  that change textures, not only factors; left for a later format if colour and emission
  palettes prove too narrow.
- **HTTP polling in core:** rejected; network access in the compositor process is exactly what
  the extension model keeps out.

## Open questions

1. **Unsandboxed commands.** Is running user-confirmed commands as the user acceptable for P1,
   or should commands start sandboxed with per-path opt-in?
2. **Explain trigger:** a dedicated action (proposed, unbound), hold-E while aiming, or the
   Director only?
3. **Coalescing default:** 4 visual updates per second per machine, or fewer on battery?
4. **Prompting from worlds:** may a world ask on first visit to connect its authored machines
   ("This room has a CI conveyor: connect it?"), or stay silent until the user opens the panel?
5. **Sharing setups:** export machines, sources (without secrets) and mappings as a file
   another user imports, with commands confirmed again?
6. **Third-party network:** a brokered fetch (the helper's network worker on behalf of an
   extension, per approved origin), or network namespaces per extension?
