---
title: "Try Hyprune"
description: "Install paths, a developer nested session, and your first ten minutes in Lumen Reach."
---

Hyprune is an early preview. It targets **Hyprland 0.56.2** exactly, because the core plugin is built against that compositor's ABI. The component repositories (core, shell, SDK, schemas, worlds and the installer) are **not public yet**. The paths below are for people with access, and show what the experience will look like once the repositories open.

## Install paths

The meta repository `hyprune/hyprune` is the front door. It bundles core, shell, SDK and worlds into **kits**:

| Kit | What you get |
| --- | --- |
| `lumen-reach` | The four Lumen Reach homes with terminals on their walls; High graphics, or the `intel` tier for an iGPU |
| `minimal` | One quiet home with a terminal and a workspace wall; 12 triangles, no textures, reduced motion |
| `dev` | The Switchyard test world plus a debug home and SDK tools |

- **Nix profile** (any Linux): `nix profile install github:hyprune/hyprune#kit-minimal`, then `hyprune-setup install`, log out, and start `hyprune-session` from a TTY.
- **NixOS or Home Manager:** import the module and set `programs.hyprune = { enable = true; kit = "lumen-reach"; };`. The module pins the same compositor the plugin was built for, plus its matching portal.
- **Arch:** `./install.sh --kit minimal --dry-run`, then without `--dry-run`. The script checks the compositor and header versions, builds the pinned components and never edits your Hyprland config without showing the diff and asking first. `--uninstall` reverses it.

Fedora and Debian packages aren't available; use Nix there. World packages are published as GitHub releases and pinned by hash. Lumen Reach 0.7.1 and Switchyard 0.1.1 are the current releases.

## A nested developer session

Core's developer tools run everything inside a nested Hyprland window, so your real session is never touched. From a core checkout:

```sh
dev/hyprune-dev up      # build, run acceptance, keep the nested session open
dev/hyprune-dev smoke   # acceptance only
dev/hyprune-dev record  # acceptance with a screen recording
```

Each nested session holds an exclusive lock, and its controller only targets the child compositor. Test new core builds this way first. Some failures can only appear on real hardware, such as hardware-cursor and DRM output transitions. These need a supervised live session, with a checklist in core.

## Your first ten minutes

With the `lumen-reach` kit:

1. **Enter the world** with **Super+F12**. **F12** always returns to the ordinary desktop.
2. **Walk and look.** Use **WASD**, **HJKL** or the arrows, and move the mouse to look. **Shift** sprints, **Space** and **Ctrl** move up and down, **V** toggles noclip and **F4** flight.
3. **Hold Tab for one second** to open the Director: Map (waypoints, travel, autodrive), Workspaces, Settings and Performance. **Escape** closes it.
4. **Go home.** **Super+1** takes you to Sun Court, the home of workspace 21. **Super+2** to **Super+4** reach Array Hall, Rime Vault and Signal Rise. Windows on a workspace appear on its home's main wall.
5. **Use a window in place.** Aim at it and press **E**. Keystrokes go to the app. **F** brings it to native 2D. **Super+Tab** or **Back** returns to the world.
6. **Carry and pocket.** Hold **Super+left mouse** to carry an aimed window, then **Super+wheel** to change its distance. Tool **5** (Placement) pockets windows with the middle button and places them ahead with the left button or onto a surface with the right.
7. **Free cursor.** From the world, **Super+Tab** gives you a real cursor while the camera freezes. Press it again to return.

The full binding tables are on the [keymap](/keymap/) page. Bindings live in `~/.config/hyprune/input.json` and reload live; the Director's Settings tab edits them too. Graphics presets (Low/iGPU, Medium, High, Ultra, auto) and the optional dGPU offload are in **Performance**.

## When something goes wrong

- **F12** leaves the world from any mode except free cursor. In free cursor, press **Super+Tab** or **Back** first.
- If the daemon dies, the plugin restores the desktop by itself (in 0.052 s in tests).
- If the shell crashes or restarts, it reconnects, renews its credentials and resyncs.
- **U** writes a private capture (a screenshot plus a JSON state dump) under `~/.local/state/hyprune/captures/` for bug reports.
