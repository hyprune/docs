---
title: "Try it in 5 minutes"
description: "Check your computer, then open Lumen Reach in a window: one folder, no sudo, no config edits, no log out."
---

Two commands. The first only reads; the second puts everything in **one folder** and opens Hyprune in a window inside the desktop you are using now. Nothing is installed system-wide, no login items or session entries are added, and your configuration is never edited.

```sh
curl -fsSL https://hyprune.com/check | bash   # read-only compatibility report
curl -fsSL https://hyprune.com/try | bash     # download into ~/hyprune-try and open it
```

## 1. Check

`check` reports your distribution, Wayland session, Hyprland version against the plugin ABI, GPU and OpenGL ES, Quickshell, Python, Nix, disk space and memory, then gives one verdict: **✓ ready**, **⚠ ready with notes**, or **✗ not yet**. Every ✗ comes with the exact command to fix it for your distribution (Arch, Fedora, Debian/Ubuntu, openSUSE, NixOS). It changes nothing, sends nothing, and its only download is the small pinned manifest ([`try/manifest.json`](https://github.com/hyprune/hyprune/blob/main/try/manifest.json)). Add `--json` for a machine-readable report:

```sh
curl -fsSL https://hyprune.com/check | bash -s -- --json
```

## 2. Try

`try` runs the same checks first. If something is missing it prints the install commands and stops: it never runs a package manager or `sudo`. Then it downloads into `~/hyprune-try`, verifying every SHA-256:

- **core** (the Hyprland plugin and its helpers), prebuilt for the pinned Hyprland ABI. Until a prebuilt release matches your Hyprland, it builds core from source inside the folder (5-15 minutes; the check lists the build packages);
- **the shell** (Quickshell HUD and Director) with a private Python venv in the folder;
- **Lumen Reach**, the release world, checked against [`worlds/releases.json`](https://github.com/hyprune/hyprune/blob/main/worlds/releases.json).

Config, state and caches stay in the folder too. Then it opens a nested Hyprland **window** (1600x900) with Lumen Reach loaded, at Sun Court.

| In the window | Keys |
| --- | --- |
| Move, look | W A S D or arrows, mouse; Space up, Ctrl down, Shift sprint |
| Use, focus a window | E, F; left click is the primary tool, 1-5 pick tools |
| Director | hold Tab |
| Free cursor | Back or Alt+Tab |
| World / desktop, homes | Alt+F12, Alt+1-4 |
| Quit | Alt+Shift+Q, close the window, or Ctrl+C in the terminal |

Your desktop usually keeps Super chords for itself, so inside the window every Super chord also works with Alt. The full keymap is on the [keymap page](/keymap/).

Options (after `bash -s --`):

```sh
curl -fsSL https://hyprune.com/try | bash -s -- --dir ~/hyprune-try --world lumen-reach --dry-run
```

`--dry-run` checks and prints the plan without writing anything; `--no-run` downloads without starting; `--live` loads into your running Hyprland instead (below); `--ref` picks the meta repository revision for the manifest.

## Afterwards

```sh
~/hyprune-try/run                 # the nested window again (--size 1280x720 for a smaller one)
~/hyprune-try/run --live          # load into your running Hyprland, for this login only
~/hyprune-try/run --stop          # undo --live
~/hyprune-try/uninstall           # delete the folder; there is nothing else to undo
```

**`--live`** is opt-in and asks first. It loads the folder's plugin and shell into the Hyprland session you are using, without touching your config, and adds a Super+Shift+H (or the next free) toggle to enter the world. A plugin crash takes the session with it, so save your work first. `run --stop` unloads everything and removes the toggle; it also works from a TTY if the session misbehaves. Quickshell keeps its usual per-instance log in `$XDG_RUNTIME_DIR`, which is cleared when you log out.

## Requirements and the Nix path

You need a Wayland session (KWin, GNOME or Hyprland; sway 1.12 cannot host the nested window), **Hyprland 0.56.2** exactly, because the plugin is built against its ABI, Quickshell, Python 3.11+, and `curl`, `tar`, `zstd`. The prebuilt core matches Arch Linux's Hyprland 0.56.2 package. On other distributions, or with a different Hyprland build, use Nix, which brings the pinned compositor so the ABI always matches:

```sh
nix --extra-experimental-features 'nix-command flakes' run github:hyprune/hyprune#try
```

It opens the same window and keeps its state in `~/hyprune-try-nix` (`rm -rf` it to uninstall). Outside NixOS it uses Nix's Mesa, so it suits Intel and AMD graphics; with the proprietary NVIDIA driver outside NixOS, use the script path or a GL wrapper such as nixGL.

## Pinned copies

`https://hyprune.com/try` and `/check` follow the latest published scripts. To run an exact, verified copy instead, download a versioned one and check its SHA-256 against [`try.sha256`](https://hyprune.com/try.sha256):

```sh
curl -fsSLO https://hyprune.com/try-0.1.0.sh
curl -fsSL https://hyprune.com/try.sha256 | grep ' try-0.1.0.sh$' | sha256sum -c -
less try-0.1.0.sh                 # it is short: read it first
bash try-0.1.0.sh --ref try-v0.1.0
```

`--ref` pins the manifest and the world record to the same release, so every download is fixed by hash. The source of both scripts is [`try/`](https://github.com/hyprune/hyprune/tree/main/try) in the meta repository; this site serves byte-identical copies.

For a permanent install with a login-screen session, see [Try Hyprune](/first-session/) and the [meta repository](https://github.com/hyprune/hyprune).
