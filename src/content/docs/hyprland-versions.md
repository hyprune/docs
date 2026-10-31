---
title: "Supported Hyprland versions"
description: "Which Hyprland releases Hyprune runs on, why the version has to match exactly, and how each install path picks the right build."
---

Hyprune's core is a Hyprland plugin. A plugin is built against one Hyprland release's headers and only loads into that release: Hyprland refuses a plugin built for another version, and Hyprune checks first so it can tell you why.

## Policy

Hyprune supports **the current Hyprland release and the one before**. When Hyprland publishes a new release, core adds it and drops the oldest, so a distribution update never leaves you more than one release behind.

| Hyprland | Status |
|---|---|
| 0.57.x | supported; core 0.11.0 and later ship a prebuilt for 0.57.0 |
| 0.56.x | supported; core 0.10.0 and later ship a prebuilt for 0.56.2 |
| 0.55 and older | not supported |

Within a release, the plugin needs the **exact** version it was built for (0.56.2 is not 0.56.1): Hyprland's ABI changes between patch releases too.

## How each path picks the build

- **[Try it](/try-it/):** the check reads `Hyprland --version` and picks the core prebuilt for that release (one archive per supported Hyprland, named `hyprune-core-<version>-hyprland-<hyprland>-x86_64.tar.gz`). If your Hyprland is a supported release but no prebuilt matches its ABI, it builds core from source in the folder. An unsupported release gets a ✗ with the versions Hyprune supports.
- **Nix flake:** the flake pins one Hyprland release (0.57.0 since core 0.11.0) and builds core against it, so the session always runs a matched pair. Updating the `hyprune` flake input moves both together.
- **Installer and source builds:** core builds against the installed Hyprland headers (`pkg-config hyprland`), which must be the same version as the installed `Hyprland`. CMake stops with the supported list for any other release.
- **Live testing (`core/dev/live`):** the launcher compares the running session with the build. After a Hyprland update, log out and back in before going live: until then the session still runs the old release.

## After a Hyprland update

1. Log out and back in, so the session runs the new release.
2. If it is a supported release, rerun try (it fetches the matching prebuilt), rebuild from source, or update the flake input.
3. If it is newer than Hyprune supports, keep the previous Hyprland package until core supports it. On Arch: `sudo pacman -U https://archive.archlinux.org/packages/h/hyprland/<package>` with the package named in the check's fix line.
