---
title: "RFC-0009 — Optional offload renderer"
description: "A supervised world renderer, explicit cross-GPU frames, power admission and local fallback."
---

**Status: proposed · 2026-10-08 · Core M4 design; not an implemented contract.**

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

Hardware tests run in the spike's nested harness under
`flock /tmp/worldshell-nested.lock`, with AC admission, a separate watchdog and
short capped runs. Record compositor/renderer GPU identity and exact commits.
Do not load a test plugin into an owner's live session. Later supervised DRM,
hardware-cursor, physical presentation and suspend tests need a dedicated
qualification session; nested success does not establish those properties.
High-refresh headroom tests are brief, separately admitted and power-guarded;
"uncapped" never means removing the power watchdog. Stills/video carry settings,
scale, camera and capture-overhead metadata; encode gallery artifacts in `/tmp`
and move them in without controlling the gallery watcher.

| Phase | Deliverable and exit gate |
| --- | --- |
| **M4.0 · harden the experiment** | Versioned supervised worker, device probe, immutable state, both allocation directions, bounded ring/sync; fake power tests and validation-layer run. Keep opt-in developer-only; no shipping-performance claim from world-only color. |
| **M4.1 · minimal shippable offload** | One qualified Intel/NVIDIA pair, one SDR/untransformed output, opaque/masked worlds, native scale, local depth prepass and native surfaces; `off/auto/on`, conservative power admission/watchdog, prepared local fallback and actionable reasons. All lifecycle/input/power/composition gates pass; sustained permitted-power benefit over local rendering at matched quality, and p95 pose→ready below 25 ms in the complete frame graph. Default remains off. |
| **M4.2 · quality and efficiency** | Qualify transported depth against local prepass, dynamic render/transfer scale, broader effects/transparency and device pairs. Measure quality headroom over Intel Auto, not only higher FPS than a fixed-resolution baseline. Extend schemas/diagnostics with compatibility fixtures. |
| **M4.3 · latency and outputs** | Optional reprojection, qualified high-refresh budgets and multi-output scheduling, broader output/color profiles. Simulation advances once; each output has bounded state and independent capability/fallback. Physical latency, idle energy and long-session evidence required. |

A phase that misses its safety, correctness or benefit gate stays experimental;
local rendering remains a complete supported product. In particular, keeping
Intel at roughly 60 FPS through dynamic resolution may make fidelity/headroom,
rather than another 60 FPS counter, the useful offload benefit. That claim needs
a new controlled quality comparison and is not established by round 2 alone.
