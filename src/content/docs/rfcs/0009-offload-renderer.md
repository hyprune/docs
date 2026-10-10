---
title: "RFC-0009 — Optional offload renderer"
description: "A supervised world renderer, explicit cross-GPU frames, power admission and local fallback."
---

**Status: accepted · proposed 2026-10-08, accepted 2026-10-09 · phase 1 implemented, default off.** Phase 1 is on core main and verified in nested sessions; physical power-profile qualification is pending (see the [phase 1 amendment](#phase-1-implementation-amendment-hot-switching-and-performance-010) and the [roadmap](/roadmap/)). The [IPC 0.18 amendment](#amendment-ipc-018-device-scaled-offload-power-and-device-selection) scales the power cap to the offload GPU on systems without a battery and adds device selection. The buffer protocol remains private to core.

This amends [RFC-0002](/rfcs/0002-runtime/) without moving compositor or input
authority. Its buffer protocol is private to core, not a public provider API.
The default remains in-process rendering on the compositor GPU.

## Decision and evidence

Allow an explicitly opted-in renderer process to render expensive world shading
on another GPU. Keep native application capture, surfaces, overlays and final
composition on the compositor GPU. `hypruned` supervises the renderer; the
plugin never becomes its production process supervisor.

The [round-2 spike at core commit 03965ce](https://github.com/hyprune/core/blob/03965ce619c24b2f3734b0ef5ac89d8671cb7479/docs/spikes/dgpu-offload.md#round-2--reverse-allocation-and-vulkan-2026-10-08)
used Intel Panther Lake/xe for composition and an RTX 5090 Laptop with NVIDIA
615.71.09 for world rendering. Native 3840×2160, matched Intel-quality preset
(2× MSAA), the same pinned Lumen Reach world, short sequential nested runs:

| Measurement | Result |
| --- | ---: |
| Intel in-process, nested | 25.10 fresh submissions/s |
| NVIDIA Vulkan LINEAR, nested | 60.02 completed frames/s; 59.18 first submissions/s |
| Pose request → Intel-ready texture | 14.05 ms median; 17.27 ms p95; 27.05 ms maximum |
| Pose request → first plugin submission | 23.89 ms median; 24.88 ms p95 |
| NVIDIA world GPU time | 4.095 ms median |
| NVIDIA optimal → LINEAR / Intel LINEAR → local copies | 1.291 / 1.343 ms median |
| NVIDIA whole-device peak power | 47.78 W |
| Intel-allocated LINEAR, standalone | 59.80 FPS; 13.61 / 15.89 ms median/p95 pose→ready |
| High/4× MSAA at 60 FPS | Aborted at 50.37 W by the 50 W watchdog |

Intel-allocated LINEAR EGLImages could not become NVIDIA GL textures or
renderbuffers: all 12 attachment cases failed. Vulkan accepted LINEAR in both
allocation directions. The working bridge imports an optimal Vulkan image into
GL with external memory/semaphores, renders with core's GL renderer, copies into
LINEAR with Vulkan, and imports that dmabuf on Intel. No CPU pixel copies are
needed, but this is **two GPU copies, not an entirely zero-copy pipeline**.

These results establish transfer feasibility, not a shipping desktop's speed.
The spike omitted native windows/depth, measured no physical photons, and had
no Vulkan validation layer. A seat-command launch took 68.10 ms to a matching
ready pose, including process launch/input delivery/simulation. Recording
reduced first submissions to 48.67/s. Five startup frames were excluded; short
runs and shared GPU activity do not establish sustained power efficiency.
The old fixed-quality Intel baseline must not be compared with a newer Auto
preset without also recording effective resolution and enabled effects.

### Published-main quality headroom (2026-10-08)

The follow-up merged core `origin/main` **ad81f24** into the spike as
**6412298**, then measured the same pinned world and matched Sun Court/Rime
Vault viewpoints. It includes presets, dynamic resolution, graphics IPC 0.7/0.8,
BVHs and incremental uploads. The [full report and raw evidence](https://github.com/hyprune/core/blob/936d962/docs/spikes/dgpu-offload.md#quality-headroom)
include frame intervals, GPU/copy timing, power logs, 4K stills and a separate
recording-overhead comparison. No core main edits or live-session tests.

| Setting, 3840×2160 output | Sun Court FPS / world scale | Rime Vault FPS / world scale |
| --- | --- | --- |
| Intel Auto → Low, 1× MSAA | 59.99 / 0.50–0.5625 | 60.10 / 0.4375 |
| Intel High, 2× MSAA, dynamic | 59.93 / 0.375 | 59.98 / 0.375 |
| Intel Ultra, 4× MSAA, dynamic | 56.79 / 0.375 | 58.56 / 0.375 |
| Intel Ultra, 4× MSAA, forced native | 15.36 / 1.0 | 17.04 / 1.0 |
| NVIDIA Ultra, 4× MSAA, cap 45 | 45.01 / 1.0 | 45.01 / 1.0 |

The successful NVIDIA runs measured pose→Intel-ready **12.08 ms median** in
both views, **16.10 / 14.37 ms p95**, **43.73 / 45.44 W** whole-device peaks.
First plugin submissions were **44.94 / 45.13 FPS**, with request→first-submit
p95 **27.37 / 26.75 ms**. Render GPU medians were **4.690 / 4.804 ms**;
NVIDIA/Intel transfer copies each cost about **1.3 ms**. Native offload shades
3.16–5.22× as many world pixels as measured Auto, or 7.11× dynamic High/Ultra.
Ultra also enables bloom, height fog, environment sky, normal/reflection/specular
shading, alpha haze and higher anisotropy relative to Auto's Low preset.

**60 FPS native Ultra remains unqualified within the 50 W test ceiling.**
Sun Court at 4× MSAA was stopped at **50.56 W** (partial 59.77 FPS). Reducing
to 2× completed Sun at **59.98 FPS / 49.34 W**, but Rime stopped at **50.41 W**
(partial 59.94 FPS). Partial runs are failures of power qualification, even
when their frame counters are near 60. The complete 45 FPS runs lasted only a
few seconds; they are not sustained electrical or thermal qualification.

Two tiny uncapped native-Ultra render-only bursts (12 frames, 32–35 ms) measured
**2.489 / 2.640 ms median GPU time**, with **2.610 / 2.873 ms wall completion**.
They exclude transport and active Intel composition. A 500 ms meter may miss
the entire burst, so its 22.69 / 28.41 W sampled whole-run peaks do not establish
uncapped power or a shippable high-refresh rate. AC checks, the shared nested
flock and 50 W/75°C watchdog remained active; no hardware power cap was changed.

**Revised recommendation:** optional offload adds fidelity at a power-admitted
frame cap; it is not needed merely to reach 60 FPS on this Intel device.
Keep Intel Auto as the default and this RFC's conservative 30 FPS / 40 W
initial policy. Native Ultra / 45 FPS is a candidate profile for further
qualification, not a universal safe preset. Require supply admission, adequate
power margin and the complete native-window/depth budget before shipping.
Neither native-4K Ultra at 60 FPS nor high-refresh offload is qualified here.

The newer Intel result is native **output**, not native **world shading**.
The stills show finer detail/material highlights and Ultra steam absent in
Low; no application windows were captured. Each normal observation window is
about four seconds, after eight seconds Intel settling or 0.5 seconds after
NVIDIA availability. Shared GPU activity remains a confounder. The 30 FPS
side-by-side video is illustrative: recording reduced NVIDIA first submissions
to **40.08 / 41.01 FPS** and raised ready p95 to **34.19 / 39.44 ms**. Use the
unrecorded measurements for latency, and never equate ready/submission timing
with physical motion-to-photon latency. A 45 FPS stream on a 60 Hz output also
has uneven presentation cadence. These limits reinforce the existing M4 gates.

## Process ownership and discovery

| Owner | Responsibilities |
| --- | --- |
| Plugin, compositor thread | Authoritative simulation, camera, input/focus, capture leases, output identity, Intel buffer imports, native surfaces, presentation and local fallback |
| `hypruned` | Opt-in config, validated assets, device/power admission, spawn/reap/restart, diagnostics and policy leases |
| Renderer child | Its own EGL/Vulkan contexts, immutable world snapshot, world GPU resources and pose-tagged frame production |

The daemon creates an inherited `SOCK_SEQPACKET` pair and passes one endpoint to
the plugin over their authenticated private bridge and the other to its child.
A separate control endpoint carries supervisor policy/health messages. Frame
FDs and requests go directly between plugin and renderer; public JSON-RPC and
the daemon's event loop do not relay frame-rate pixel traffic. All endpoints
carry a fresh session/renderer epoch and same-build protocol version.

The renderer is a child of `hypruned`, not a child compositor and not a shell or
extension. It receives no Wayland connection or seat authority. Plugin-spawned
workers were useful for the spike but complicate crash reaping, sandboxing and
power supervision. Daemon loss preserves RFC-0002's ordinary-desktop recovery
within one second; it is not treated as permission to keep an unsupervised GPU
worker running.

Discover the compositor's actual DRM device from the adapter. Enumerate render
nodes through libdrm/udev and correlate EGL devices and Vulkan physical devices
using DRM identity and device UUID/PCI identity. Do not assume `card1`,
`renderD129`, NVIDIA index zero, or change `AQ_DRM_DEVICES`. Select a distinct,
permitted device, optionally constrained by a stable user-selected identity.
Require matching GL/Vulkan device identity for external-memory interop.

Probe in the child after power admission, with a small allocation and strict
time budget: required extensions, supported formats/modifiers/usages, actual
memory allocation, GL attachment, producer signal, consumer import and a known
pixel pattern. Intersect both devices' capabilities; extension strings alone
are insufficient. Cache results against both device identities, driver versions
and core build. Invalidate after driver/device reset. No repeated probe loop on
battery, denied access, or a known-bad pair. Normal local builds need no NVIDIA
or Vulkan dependency; the optional worker/telemetry backend may be separately
packaged.

## Requested configuration and effective state

Proposed local graphics configuration, **not valid in today's frozen schemas**:

```json
{
  "graphics": {
    "offload": "off",
    "offload_options": {
      "device": "auto",
      "max_fps": 30,
      "gpu_budget_watts": 40,
      "supply_reserve_watts": 60,
      "verified_supply_watts": null,
      "reprojection": "off"
    }
  }
}
```

| Mode | Behavior |
| --- | --- |
| `off` (default) | No renderer/probe or periodic dGPU telemetry that keeps it awake; render locally |
| `auto` | Opt-in adaptive selection, only with admitted power, a qualified device pair and a measured quality/performance benefit |
| `on` | Request offload whenever its capability and power gates pass; report a specific reason when it cannot run, then render locally |

`on` is **not a safety bypass**. Battery, insufficient/unknown supply, thermal
limits, unavailable telemetry and unsupported scene/output profiles disable
both enabled modes. Validate types and finite bounds before persisting; no
silent coercion. Initial FPS range is 15–60; higher refresh is a later qualified
profile. Wattage can be configured downwards within a qualified device profile;
raising its absolute trip ceiling requires new qualification, not an ordinary
settings toggle. Defaults above are conservative engineering proposals, not
proof of safe operation on any USB-C adapter.

Preserve requested config separately from effective mode, selected GPU,
transport, effective preset/scale/MSAA/FPS cap and a reason such as `battery`,
`supply-unknown`, `supply-limited`, `power-budget`, `unsupported-world`,
`renderer-failed` or `no-benefit`. Auto compares equivalent output quality,
not just renderer FPS. A future schema/IPC version must add these controls and
reason discovery; do not add fields or enum values to frozen IPC 0.7/0.8.
Core remains the sole settings writer; a shell cannot request device FDs or
approve its own supply override.

## Private frame protocol

Negotiate a bounded binary header and explicitly sized payloads. No pointers,
GL names, paths from public clients, or native structs as wire ABI. All messages
validate version, length, FD count, session/renderer/output generation, sequence
and deadline before any import or state change. Linux `CLOCK_MONOTONIC`
nanoseconds provide same-host timestamps; do not compare raw GPU clocks across
devices.

| Message | Essential content |
| --- | --- |
| `HELLO / CAPS` | Build/protocol, device identities, producer/consumer roles, transport/format/usage/sync support and memory limits |
| `CONFIGURE / READY` | World digest and generation, output size/transform/color profile, render extent, camera/depth convention, MSAA/effects generation, ring epoch |
| `BUFFER / BUFFER_ACK` | Slot, allocation owner, plane FDs, format/modifier, extent, per-plane stride/offset, validated byte bounds; consumer import acknowledgement |
| `RENDER` | Sequence/slot, issue/deadline, simulation timestamp, immutable world-state generation, view/projection and camera pose/FOV; optional bounded prediction metadata |
| `FRAME` | Exact echoed request identity/pose, color/depth profile, acquire sync_file FD and producer timings |
| `RELEASE` | Slot/sequence and consumer completion fence, or explicit acknowledgement that its copy fence has already signaled |
| `QUIESCE / ERROR` | Stop new work, bounded reason and acknowledged epoch retirement; never a command to exit Hyprland |

Start with two producer slots and three local compositor targets. Slot states
are `FREE → RENDERING → READY → COPYING → FREE`; local targets are
`FREE → COPYING → FRONT → RETIRING → FREE`. Never overwrite FRONT while a
compositor GPU read is in flight. A slot is reusable only after the Intel copy
completes and its release is acknowledged. Dropping a stale frame still needs
safe fence retirement; an uncompleted slot cannot simply be marked free.
Allow at most two submitted requests and one coalesced, unsent latest state.
Account for every external allocation, GL/Vulkan backing image, local copy,
MSAA target and world/capture cache before admission. Reject oversized totals;
a 4K RGBA8 plane alone is 33,177,600 bytes. No unbounded queue or resize cache.

Two allocation directions are negotiated independently:

- **Producer allocation:** NVIDIA Vulkan creates a LINEAR modifier image with
  exportable dma-buf memory. The plugin imports it as an EGLImage/texture.
- **Consumer allocation:** Intel GBM allocates LINEAR with appropriate usage
  flags, exports its FD to the child, and NVIDIA Vulkan imports that memory as
  a copy target. Query layout and compatible memory types; do not assume a
  stride, memory heap or renderable NVIDIA GL attachment. The spike allocated
  via Intel GBM inside the child; production moves this allocator to the
  compositor's deferred preparation owner.

LINEAR is the initial transport. Other intersecting modifiers require separate
qualification. LINEAR describes memory layout, not color transfer function.
NVIDIA GL renders into an optimal image shared with Vulkan through opaque-FD
external memory; reusable GL/Vulkan semaphores and explicit layout/queue-family
transitions bracket the Vulkan copy. A native sync_file covers all writes to a
frame's attachments. Intel imports/waits on it through native-fence support or
polls completion without blocking before issuing its local copy. Release
fencing covers that copy. Do not assume implicit synchronization, triple
buffering, FD receipt or `glFlush` alone establishes readiness. FD ownership and
close-on-exec are explicit, including the platform's already-signaled-fence
representation. Initialization failure closes every received handle.

The render pass only samples a completed, locally owned snapshot. Imports,
allocation, fence retirement and resource destruction occur in the verified
deferred phase with render nesting zero and scoped GL state, following RFC-0002.
No `glFinish`, synchronous readback, blocking IPC, fence wait or child reap on
the compositor thread. A permanently unsignaled fence triggers fallback;
quarantine outstanding resources until safe retirement or device teardown.

## Pacing, latency and stale frames

Use one monotonic cadence with absolute deadlines; skip missed deadlines,
never catch up with bursts of obsolete poses. Cap submissions by output refresh,
user/power limits and measured consumer capacity. Continue retiring completions
while awaiting the next deadline: the spike's independent relative/absolute
caps queued old poses despite an apparently good FPS counter.

At 60 Hz, target p95 pose→local-ready below 20 ms, with **25 ms as the
qualification ceiling**, and p95 first plugin submission below 30 ms. These are
engineering gates, not hard real-time guarantees or physical motion-to-photon.
Record request wait, rendering, both copies, fence-observation delay, fresh
completion/submission rates, frame intervals, age at display, scale and power.
Separate CPU from GPU timestamps; reject disjoint GPU timing. Include startup,
recording overhead and worst outliers separately from warm steady samples.

Present the newest complete frame matching world/output/settings epochs. Never
combine old color with new depth or an unrelated camera. An older matching
snapshot may be repeated for at most 50 ms from its pose issue timestamp; if
it ages out, switch to prepared local rendering. A 500 ms missing renderer
heartbeat or protocol deadline failure stops/reaps the worker independently.
Discard obsolete generations immediately on world/settings/resize changes;
do not stretch an old framebuffer across a new output configuration. Retain
local presentation until the new ring and first matching frame are ready.

Without reprojection, surfaces, occlusion, overlays and picking use the camera
of the **displayed** world snapshot, while authoritative simulation continues.
Capture pixels can update independently, but geometry and input hit testing
must share the displayed surface-layout generation. Revalidate live handles and
permissions before seat dispatch. A newer simulation pose is not a license to
click where a stale frame shows no target.

Reprojection is off in the first shipping profile. A later opt-in profile may
warp world color with matching depth to a newer camera, render native surfaces
and overlays at that camera, and invalidate disoccluded pixels. Start with
bounded rotation; translation, animated geometry and translucent layers need
motion/coverage data and hole handling. Repeated/reprojected images do not count
as fresh rendered FPS. Large pose deltas or unreliable depth select local
rendering, rather than stretching foreground objects or misrouting clicks.

## Power admission, watchdog and hysteresis

A laptop in the spike had previously shut down under GPU load on USB-C. An
`online=1` flag establishes neither adapter wattage nor available headroom.
Read power-source topology and changes in `hypruned`, never inside a plugin
frame. Identify the actual active supply/PD contract where the platform exposes
it. Do not sum duplicate AC/USB reporting nodes or mistake advertised adapter
maximums, instantaneous draw or a battery's voltage for negotiated input power.
Linux power-supply attributes are optional and driver-dependent; missing data
means unknown. See the [kernel power-supply interface](https://docs.kernel.org/power/power_supply_class.html).

Admission requires external power, no sustained battery supplementation,
trustworthy supply capacity and a qualified GPU telemetry source. Define:

`available GPU budget = verified input watts − platform/charging reserve`

The effective budget is the minimum of that value, requested GPU budget and
qualified profile budget. The reserve includes CPU, Intel/display load,
charging, conversion loss and transient margin; the proposed 60 W default is
not a whole-laptop measurement. If the requested budget does not fit, disable
with `supply-limited`, rather than assume spare USB-C power. A user's
`verified_supply_watts` may supply a conservative, locally confirmed lower
bound when contract reporting is absent; it cannot override a reported lower
contract or battery operation, and is tied to the adapter/platform identity.
Unknown or changed identity invalidates it. Auto does not invent this value.
Battery operation, AC unplug, PD downgrade and sustained discharge on AC revoke
admission. Unsupported/missing discharge telemetry needs a qualified platform
policy; do not silently infer safety from a fully charged battery.

Use an independent daemon watchdog: power-source events plus a roughly 100 ms
poll fallback; GPU power/temperature at 500 ms while active; a renewable 500 ms
rendering lease. A child must stop submissions when its lease expires. A stalled
frame channel cannot renew that lease by itself. Prefer a maintained vendor
telemetry API; [NVIDIA recommends NVML over parsing changing nvidia-smi output](https://docs.nvidia.com/deploy/nvidia-smi/index.html).
No privileged clock, fan, persistence-mode or hardware power-limit changes are
required. Software workload caps cannot guarantee an electrical power ceiling.

Initial qualified-laptop policy: 40 W requested budget, 30 FPS cap; absolute
stop at 50 W or 75°C, retaining the spike's ceilings. A budget overload first
steps FPS down (60→45→30→20→15), then selects local rendering if it persists for
one second or reaches a trip threshold. Any observed absolute trip stops new
work immediately. Missing power telemetry for two seconds also stops offload.
Hardware-supported profiles may tighten these values; higher settings require
separate evidence. In particular, the aborted 4×/60 FPS run does not qualify a
higher power limit. Keep fidelity policy separate: do not silently lower an
explicit Ultra preset to conceal a power-limited frame rate.

Apply asymmetric hysteresis: disable immediately for unsafe power; require
30 seconds of stable admitted supply and a 60-second cooldown before automatic
reenablement. Increase FPS by at most one step after ten seconds below 80% of
the effective budget with acceptable temperature/latency; do not bounce between
rates on every sample. P-state is supporting evidence, not an admission switch:
P0/P2 under useful work can be normal. Do not force P8 or restart just because
P0 appears. On inactivity, release the worker's GPU contexts after a five-second
grace, stop polling that wakes the device, and measure settling energy/P-state
in qualification. Another application may keep the GPU awake; do not kill it
or claim its power belongs to Hyprune. Safety teardown bypasses all grace times.

## Windows, depth, MSAA and render scale

Captured client buffers stay on Intel. No desktop pixel, lock surface or raw
seat input is sent to the NVIDIA worker. Preserve [RFC-0005](/rfcs/0005-surfaces/)
leases, damage, child-tree geometry and [RFC-0008](/rfcs/0008-shell/)'s native
window/overlay resolution. A flat world image behind every window is not enough:
walls must occlude windows, and surfaces must retain their mutual depth/order.

The minimal shipping profile uses **local depth reconstruction**. Keep a
prepared copy of opaque/alpha-tested world geometry on Intel; render a depth-only
prepass using the exact received camera, world/animation generation, alpha-test
textures, render extent and sample convention. Reuse core's MSAA depth resolve
and native-depth reconstruction rules. NVIDIA supplies resolved world color;
Intel builds matching local depth, then draws native-resolution windows,
workspace planes, popups and core overlays. A collision mesh or bounds proxy
is not sufficiently accurate depth. This duplicates geometry residency/work
and must be measured; the world-only spike does not price it in.

Ordering and color rules for that profile:

1. NVIDIA shades opaque/masked world geometry, resolves its MSAA, applies world
   bloom/exposure/tone mapping once, and exports a negotiated SDR color image.
2. Intel decodes that carrier into the compositor's composition space without
   another artistic tone map; local world depth follows the same sample/resolve
   rule as the local backend. Resolve/coverage edge fixtures must match the
   accepted local renderer's policy; do not assert per-sample equivalence from
   a resolved color texture alone.
3. Intel depth-tests surfaces against world depth and orders overlapping native
   surfaces, child trees and premultiplied alpha exactly as its local path does.
   Application pixels receive the compositor output transform, not world bloom
   or exposure. World-locked overlays use this displayed camera; shell/lock
   layers remain normal compositor layers above the world.

World transparency in front of or between application planes cannot be correctly
composed by painting all windows over a flattened translucent-world image.
The first profile therefore rejects such scenes/features and stays local;
it never silently makes glass opaque or drops transparent geometry. A later
frame graph needs separately composable world transparency or a unified local
translucent pass. Dynamic effects whose depth silhouette cannot be replicated
also remain local until supported. Fullscreen/native handover always wins.

A later profile may replace the Intel depth prepass with a negotiated depth
plane, protected by the same acquire fence and frame identity as color. Probe
an actually importable representation (for example a qualified float or packed
color carrier), not assumed cross-vendor depth/stencil attachment support.
Specify units, near/far, reversed-Z convention, projection, origin, coverage,
invalid/sky values and reconstruction. A 32-bit 4K depth plane adds another
33.18 MB per transferred frame; measure its bandwidth and quality before
claiming it is cheaper than local depth. Never pair mismatched attachments.

M4's first profile fixes world scale to 1 for an intelligible qualification
boundary. Later negotiation supports independent world render/transfer extent
and native output extent. Camera aspect remains the output aspect. Resolve
MSAA before transfer; reconstruct world color/depth before native surfaces.
Only one owner selects dynamic scale, using end-to-end consumer timing with
hysteresis; a scale change creates a new ring/settings generation. Reduced
transfer resolution, tone-map ordering and sharpening can differ from native
Auto rendering, so compare stills as well as FPS. MSAA/effects are explicit,
not implicitly selected by the GPU vendor. Do not advertise unimplemented
"all effects" such as SSR or runtime shadows.

## Fallback and crash isolation

Maintain a prepared local renderer with the same authoritative scene/camera and
settings generation while offload runs; account for its memory cost. Activate
offload only after a validated ready frame. On loss/error, stop new offload
requests and switch on a safe frame boundary to local rendering at current
simulation state, preserving surfaces, focus, input mode and world identity.
Do not reload the world, replay input, wait for worker shutdown, or freeze the
last offloaded image indefinitely. A local Auto policy may select a lower world
scale to restore responsiveness; report that effective change. If local assets
cannot be kept prepared, offload admission fails rather than promising seamless
fallback. If local rendering itself fails, recover ordinary desktop mode.

The daemon reaps using owned child identities/pidfds. At most one automatic
restart after cooldown per ten minutes; repeated crashes latch off until an
explicit retry or a new qualified configuration. New process, new epoch, new
ring; never replay in-flight frames. Lock immediately revokes rendering/capture
leases and hides world presentation; suspend, hot-unplug and daemon/plugin exit
cancel all generations. Renderer cleanup is asynchronous to composition.

Process separation contains an ordinary renderer crash, as the spike's SIGKILL
test demonstrated. It does not contain a shared kernel-driver fault, GPU reset,
PCIe failure or an indefinitely stuck driver ioctl. An import/driver bug can
still affect Hyprland. This is a narrower failure boundary, not a security or
availability guarantee for GPU drivers.

## Device access and sandbox

Run as the logged-in user with existing render-node permissions; no root,
setuid helper, DRM master, modesetting, broad video-group changes or world-given
device paths. The supervisor resolves identities, opens only the necessary
render/device nodes, and passes narrow FDs where supported. Some proprietary
userspace stacks require NVIDIA control/UVM nodes: use a tested device allowlist
rather than pretend a single render FD is sufficient. No usable confined
profile means no offload on that platform.

Use `no_new_privs`, filesystem/mount isolation and a driver-qualified syscall
policy. No network, home/config/secrets, public IPC tokens, compositor sockets,
input devices or application buffers in the child. Supply validated, immutable
world assets through read-only FDs/sealed data or a read-only approved package
view; prohibit arbitrary world shaders/native extensions. Limit decoded asset
sizes, CPU threads, file descriptors, queued work and memory. Do not persist a
shader cache in an arbitrary path requested by the child. GPU access exposes a
large driver ioctl surface: sandboxing is defense in depth, not a boundary for
hostile GPU code.

The plugin treats even its supervised peer's descriptors as untrusted: overflow-
safe plane bounds, supported formats/usages, maximum dimensions/bytes, exact FD
counts and epoch/slot ownership before importing. Malformed packets close
attached FDs and fall back. Cap logs and notices. Validate buffers in a disposable
probe child where possible; that reduces but does not remove compositor import
risk. No third-party provider receives this private FD transport by implication.

## Test plan and M4 phases

All numbers below are gates to demonstrate, not results already achieved.

| Layer | Required evidence |
| --- | --- |
| Protocol/lifetime | Malformed/truncated packets, excess FDs, stride overflow, duplicate slots, stale epochs, reordered frames, missing/invalid acquire/release fences, resize/world switch with slots in flight; no leaks or premature reuse |
| Device/transport | Both allocation directions, actual format/modifier/usage intersection, GL↔Vulkan ownership under validation layers, known pixels, unsupported device/driver, permissions denied, no dGPU installation |
| Composition/input | Opaque/masked edges, thin occluders, MSAA resolve, alpha windows, popups/menus, carry/resize, displayed-pose picking, transformed/fractional outputs, world overlays, native fullscreen; unsupported transparency selects local |
| Power simulation | Battery/unplug/PD downgrade, duplicate supplies, unknown watts, charging reserve, discharge on AC, stuck telemetry, expired lease, budget/temperature trips, cooldown/FPS/P-state hysteresis; use fake providers, not induced electrical overload |
| Failure/recovery | Worker crash/hang mid-copy, daemon death, output/device removal, lock/unlock, suspend/resume, repeated restart/unload, fallback preserves typing/grabs and ordinary desktop escape |
| Performance/quality | Intel Auto/High/Ultra versus offload at matched scale/effects; effective scale and preset, depth cost, native surfaces, FPS/pacing/latency distributions, memory, power and idle settling; static and moving Sun Court/Rime Vault viewpoints |

Hardware tests run in the spike's nested harness while holding its exclusive
session lock, with AC admission, a separate watchdog and
short capped runs. Record compositor/renderer GPU identity and exact commits.
Do not load a test plugin into a user's live session. Later supervised DRM,
hardware-cursor, physical presentation and suspend tests need a dedicated
qualification session; nested success does not establish those properties.
High-refresh headroom tests are brief, separately admitted and power-guarded;
"uncapped" never means removing the power watchdog. Stills/video carry settings,
scale, camera and capture-overhead metadata; encode capture artifacts outside
the output directory and move them in when complete.

| Phase | Deliverable and exit gate |
| --- | --- |
| **M4.0 · harden the experiment** | Versioned supervised worker, device probe, immutable state, both allocation directions, bounded ring/sync; fake power tests and validation-layer run. Keep opt-in developer-only; no shipping-performance claim from world-only color. |
| **M4.1 · minimal shippable offload** | One qualified Intel/NVIDIA pair, one SDR/untransformed output, opaque/masked worlds, native scale, local depth prepass and native surfaces; `off/auto/on`, conservative power admission/watchdog, prepared local fallback and actionable reasons. All lifecycle/input/power/composition gates pass; sustained permitted-power benefit over local rendering at matched quality, and p95 pose→ready below 25 ms in the complete frame graph. Default remains off. |
| **M4.2 · quality and efficiency** | Qualify transported depth against local prepass, dynamic render/transfer scale, broader effects/transparency and device pairs. Measure quality headroom over Intel Auto, not only higher FPS than a fixed-resolution baseline. Extend schemas/diagnostics with compatibility fixtures. |
| **M4.3 · latency and outputs** | Optional reprojection, qualified high-refresh budgets and multi-output scheduling, broader output/color profiles. Simulation advances once; each output has bounded state and independent capability/fallback. Physical latency, idle energy and long-session evidence required. |

A phase that misses its safety, correctness or benefit gate stays experimental;
local rendering remains a complete supported product. In particular, keeping
The published-main comparison establishes world-only fidelity headroom over
Intel Auto, with a frame-rate/power tradeoff. M4 must still demonstrate that
benefit with native windows, correct depth/ordering and sustained admitted power;
the quality-headroom spike does not waive any shipping gate.

## Phase 1 implementation amendment: hot switching and Performance 0.10

The menu writes `graphics.set({patch:{offload:"off"|"auto"|"on"}})` over exact IPC
0.10. Default is **off**. Mutation is diff-applied and persisted independently of
Hyprland. No restart, compositor reload, or main-world reload occurs. Local world
resources stay resident during worker warmup and operation. Startup, allocation,
imports, polling and teardown run outside the compositor frame. A complete
matching-generation frame younger than 50 ms may replace opaque world colour;
missing/stale/crashed-worker frames use the prepared local renderer immediately.
No blend is required: switching happens at complete frame boundaries. Pointer
picking uses the actually displayed camera. Native client buffers, glass/haze,
world markers, prompts and the debug overlay remain on the output GPU; a native
geometry depth pass preserves occlusion (including masked material cut-outs).

Hypruned owns the child and creates its private data/control socketpairs. It sends
the data endpoint to the plugin using SCM_RIGHTS over their inherited private
bridge. Poses/frames travel directly between renderer and plugin. The bounded
2-slot LINEAR transport copies GL output to Vulkan LINEAR DMA-BUF, then copies
only completed buffers into three local presentation targets. It transfers no CPU
pixels or client buffers. Sequence, generation, pose, dimensions, stride, modifier
and descriptor count are checked. Fence polling never blocks the compositor.
The renderer uses the approved installed world path, clean environment, no launch
grants or compositor sockets, no-new-privileges, Landlock filesystem confinement
and seccomp restrictions on new connections/process execution. Unsupported
confinement or driver interop fails back to local. NVIDIA EGL and Vulkan identities
must match the same discovered DRM render node; no fixed card number is assumed.

The power policy follows the revised power profiles. USB-C, battery and limited
AC keep **auto off**; explicit on permits at most **50 W / 45 FPS**. Qualified full
AC (reported capacity at least 150 W, no battery discharge) permits **80 W / 60 FPS**.
Unknown supply data fails closed. `offload_power_cap_w` defaults to 80 (20–100 input
range), always clamped to the profile ceiling. No root power-limit/clock writes
are made: this is a monitored software budget, not a hardware-enforced instantaneous
power limit. NVML readings use the discovered PCI identity. AC/policy is checked
at 100 ms; power/temperature at 500 ms; unknown/stale readings, cap breach or more
than 75 °C withdraw admission. On AC while the battery discharges, admission is
withdrawn. The child has an independent 500 ms renewable lease watchdog thread,
including during driver calls and startup. Stopping releases the worker and NVML
handle. A fault requires an explicit off/on retry; phase 1 avoids crash-restart loops.
All hardware development runs also use the independent external 50 W / 75 °C,
55-second maximum watchdog, under the shared nested flock. Battery/full-AC policy
branches and AC→USB withdrawal use fake telemetry in unit tests.

`graphics.get/set` adds `performance` in 0.10. It contains requested and effective
settings, `preset` (including `custom`), active renderer, status/reason, power/profile,
cap/FPS, and per-control costs. `gpuMs:null` means unavailable or inseparable;
`sharedPass/passGpuMs` identifies shared work without falsely attributing the whole
pass to one effect. MSAA resolve excludes its shared scene shading cost. Existing
controls include quality, MSAA, sharpen, anisotropy, bloom, fog, alpha/haze, AO,
normal maps, reflections, sky, dynamic resolution, fixed render scale and target FPS.
New `scale_min/scale_max` bound automatic scale (0.375–1, min ≤ max); fixed render
scale is independent of those bounds. The Performance page may poll at 4 Hz.
Older protocols keep their frozen config shape and reject the new setting keys.

Initial limitations: NVIDIA GLES/Vulkan LINEAR, Linux x86-64 with Landlock ABI≥3,
outputs up to 3840×2160. Edited world-node transforms select local rendering until
synchronised scene edits are implemented; carrying/resizing windows stays supported.
Both copies and local depth reconstruction are intentional phase-1 costs. Resource
residency doubles world GPU storage. These nested results do not qualify physical
outputs, real-session cursor behavior, arbitrary drivers or hardware power changes.

## Amendment: IPC 0.18 device-scaled offload power and device selection

Phase 1 sized its power policy for a laptop. On a desktop with two RTX 3090s
(37–45 W idle, 90–200 W while rendering the world) the fixed 80 W full-AC cap
always tripped the watchdog. Such a desktop has no battery and often no
power-supply entries at all, so it was also reported as "power supply unknown"
and offload failed closed. The run also found that an NVIDIA compositor GPU
imports the worker's LINEAR buffers only as external textures; core now imports
them through `GL_TEXTURE_EXTERNAL_OES` when the driver reports LINEAR as
external-only (no contract change). Evidence:
[core `docs/evidence/offload/nvidia-consumer/README.md`](https://github.com/hyprune/core/blob/e0defa18e53bcfef98c758ef70c804f8972cfcf6/docs/evidence/offload/nvidia-consumer/README.md).

**Mains detection.** A system with no power supply of type `Battery` runs on
mains power: the profile is `full-ac`, `auto` is admitted and the frame-rate
ceiling is 60 FPS. With a battery present nothing changes: 50 W / 45 FPS, or
80 W / 60 FPS on qualified full AC (reported capacity at least 150 W, no battery
discharge), and the user's cap can only lower that ceiling.

**Cap.** `offload_power_cap_w` is 20–1000 W or `null`; `null` is the new
default and means automatic. Without a battery the cap is scaled to the offload
GPU's enforced power limit as read through NVML:

| Case | Cap | `capSource` |
| --- | --- | --- |
| Battery, `null` | Profile ceiling: 50 W, or 80 W on qualified full AC | `profile` |
| Battery, a number | The configured value clamped to the profile ceiling | `configured` |
| No battery, `null` | 75 % of the GPU's enforced power limit | `device` |
| No battery, a number | The configured value clamped to [20, enforced limit] | `configured` |
| No battery, enforced limit unknown | 80 W | `fallback` |

The 75 °C temperature ceiling, the NVML freshness rules (missing or stale
readings withdraw admission) and the 500 ms lease watchdog are unchanged. As
before, this is a monitored software budget: core makes no hardware
power-limit or clock writes.

**Device.** `offload_device` is `"auto"` (default) or the lowercase PCI address
`domain:bus:device.function` (for example `0000:65:00.0`) of the GPU that runs
the offload renderer. `auto` considers the NVIDIA render nodes the daemon can
open, prefers one that is not the GPU the compositor renders with, then the
least utilised one by NVML. An explicit address selects that GPU or stops
offload with reason `offload device unavailable`; core never substitutes
another GPU for an explicit choice. EGL, Vulkan and NVML identities must still
match the selected render node.

**Performance.** `graphics.get/set` `performance` records gain two required
keys. `capSource` is one of `profile`, `device`, `configured` or `fallback` (the
table above). `device` is `null` when no offload GPU is chosen yet or none is
available, otherwise `{pci, node, name, enforcedLimitW, selection,
drivesCompositor}`: the PCI address, render node (`renderD<n>`), the driver's
product name or null, the enforced power limit in watts or null when unknown,
whether the GPU was chosen by `auto` or `explicit`ly, and whether it is the GPU
the compositor renders with. `profile` keeps its five values; systems without a
battery report `full-ac`. `capW` remains the effective cap.

**Reasons.** When the supervisor stops the worker (power or temperature
watchdog, policy or device change), `performance.reason` reports the
supervisor's reason, not the consumer's resulting transport error such as
`renderer transport EOF/truncation`.

**Older sessions.** Peers below 0.18 keep their frozen shapes: `offload_device`,
`capSource` and `device` are omitted; a `null` cap is reported as the effective
cap clamped to [20, 100], and an effective cap above 100 W is reported as 100.
Writing `offload_device`, a `null` cap or a cap above 100 from such a session is
an invalid-params error ("setting requires IPC 0.18"). All earlier capabilities
are inherited.
