---
title: "First real session"
description: "Run Switchyard, real core and shell in an isolated nested Hyprland."
---

Core 0.2.0, shell 0.2.0 and SDK/schema 0.3.0 provide the first real session over
authenticated IPC 0.3. Build core and install shell requirements using their
READMEs, then build Switchyard according to the worlds README. The launcher
consumes its package unchanged. Require Quickshell, kitty, btop, wtype and grim;
Chromium is optional. Recording also requires wf-recorder and FFmpeg.

From the core checkout:

```sh
dev/hyprune-dev up
dev/hyprune-dev smoke
dev/hyprune-dev record
node tests/validate-session.mjs
```

`up` runs acceptance and leaves the visible nested session open. Hold Tab to open
the Director; Escape closes it and F12 returns to the desktop. Workspace 10 is
Switchyard; 11 is the original CC0 Quiet observatory fixture. Workspaces uses
real compositor activation and core's loading/warp lifecycle. Map delivers the
world package's SVG and named places for waypoint, travel and autodrive. Docked
terminal/btop/browser windows remain live and receive ordinary application input.

Every nested lifetime holds `flock /tmp/worldshell-nested.lock`. A verified
controller targets only the child compositor and its Wayland display. Never
invoke bare owner-session hyprctl/Quickshell or load the plugin into the owner's
desktop. Tokens are inherited through FDs. No SDK mock participates.

[RFC-0003](/rfcs/0003-ipc/) defines the new versioned state and methods;
[RFC-0008](/rfcs/0008-shell/) defines verified Wayland association, passive HUD,
exclusive Director and core-published screen projections;
[RFC-0004](/rfcs/0004-world-format/) defines the safe affine map profile and
Switchyard compatibility adapter. Frozen 0.1/0.2 contracts remain available.

The core report `docs/FIRST-SESSION.md` records reproduction, test evidence and
remaining limits. The reviewed gallery video is `videos/hyprune-first-session.mp4`
(61 seconds, 1080p H.264/yuv420p, fast start, under 60 MB) with adjacent metadata.
Nested verification covers actual walking, hold/input ownership, Map, travel,
warp, live window typing, workspace transitions and clean exit. Hardware-cursor
verification still requires a dedicated DRM session; cursor lifecycle is unchanged.
