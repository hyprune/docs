---
title: "RFC-0007 — Extension model and SDK"
description: "Process-based extensions, explicit grants and reproducible packages."
---

**Status: accepted · proposed 2026-10-07, accepted 2026-10-09.** Partly implemented: the [extension manifest schema](/reference/schema/extension/) and SDK scaffolding exist; the core extension host (sandbox, grant approval, crash/update/rollback) does not yet.


## Decision

Third-party executable extensions run as supervised processes. No stable in-process ABI and no arbitrary shared libraries in Hyprland. Core's own trusted adapters can be compiled in and are reviewed as core code. Data-only worlds and screen descriptors are not executable extensions.

`schema/v0/extension.schema.json` declares `manifestVersion: "0.1"`, reverse-domain ID, SemVer package version, name, license, `apiVersion: "0.1"`, `runtime: "process"`, relative entrypoint, requested capabilities, contributions and sandbox requirements. Contributions list screen descriptor paths and widget/movement/integration IDs. Widget, movement and integration IDs MUST be beneath the extension ID (for example `org.example.clock.widget` for `org.example.clock`). The manifest is registration metadata; each contribution must have a supported host contract before it is enabled. Duplicate provider IDs or attempts to claim `com.hyprune.core` fail registration.

## Host and privilege model

The daemon validates a package, resolves dependencies from a local approved registry, computes its digest and asks the user to approve its requested grants. The shell presents that decision but cannot grant it to itself. Supervisor passes a one-use connection token via inherited FD. Only the requested, approved intersection is granted; the extension must handle missing grants. Logs redact tokens and private app titles by default.

The first sandbox profile is Linux user/mount/PID/network namespaces with a read-only package mount, private temporary directory, bounded writable application state, no network, no host runtime directory, and only explicitly brokered IPC/Wayland FDs. Deny ptrace and host process inspection; apply seccomp/resource limits in the eventual launcher. Extension isolation is unavailable if these controls cannot be enforced; refuse manifests declaring `sandbox.required: true` rather than silently launching unsandboxed. v0 schema requires this strict profile. An administrator's developer-mode unsandboxed process is trusted local code, not an isolated extension, and is outside the distributable manifest contract.

Capabilities in IPC 0.1 are intentionally coarse control-plane grants (RFC-0003). There is no file, network, arbitrary command or input injection grant. New integrations needing those abilities require a follow-up capability/host RFC. In particular, `state.read` exposes window titles and pose, so it is a real privacy grant. A world cannot request it.

## Packaging and distribution

A package contains `extension.json`, an executable entrypoint, descriptor files, LICENSE and provenance/build instructions. Paths obey RFC-0004's package-relative rules. Never run install scripts during discovery or validation. M2 installs local packages or explicit release archives pinned by SHA-256 digest; there is no automatic remote marketplace execution. Verify path containment, size limits and digest before launch. Manifests do not contain shell command strings or environment expansion.

Content updates install atomically to a new immutable directory. Approval is keyed by package digest and capability list; update/reapproval can be presented together, but new code never silently inherits a grant. Keep the previous package for rollback; migration code may touch only its own state directory and runs under the same sandbox. Signatures and a curated registry can follow in M3 with defined key revocation and provenance policies; signatures alone do not imply trust.

## SDK responsibilities and compatibility

SDK ships the length-prefix codec, typed methods/events, reconnect/snapshot reducer, manifest tooling, world checks, templates and conformance harness. Keep schema as the single source of wire types. First reference client targets JavaScript for Quickshell integration/tooling; a C++ client can follow for core-adjacent hosts. Native clients may implement the small protocol independently and must pass the same fixtures.

World author tools export clean glTF plus manifest sidecars, validate nodes/UV1/collision/spawns, and report dependency licenses. Screen provider tooling uses an approved Wayland application surface before considering custom GPU transports. Widget rendering is shell-specific until a portable widget contract is ratified; extensions must not assume QML injection works in every shell. API `0.1` only covers current control methods, not these future host APIs.

## Lifecycle and acceptance

Validate -> register supported contributions -> approve -> start -> hello -> active -> stop/revoke -> reap. Limit restart attempts to three per minute with backoff; then disable and notify. Revocation disconnects IPC, clears contributions, releases leases/captures and terminates the process. A crashed provider leaves a noninteractive placeholder, never an input grab.

M2 acceptance requires an independently authored sandboxed process using only declared grants, denied-capability tests, a crash/restart test, update/reapproval/rollback, and malicious path rejection. Third-party native code inside the compositor remains out of scope even after M3.
