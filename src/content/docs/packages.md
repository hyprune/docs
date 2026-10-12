---
title: "Finding and installing packages"
description: "Browse official, community and custom sources, install worlds and libraries with hash checks, and update, roll back, pin and remove them from the Director or the command line."
---

Worlds and object libraries come from **sources** ([RFC-0015](/rfcs/0015-registry/)). Every
entry says which source it comes from, and every install, from any source, is pinned by
sha256, extracted by the same safe extractor and checked as data only: worlds and libraries
contain no code, and installing one never runs anything.

| Source | Shown as | Who checks it |
| --- | --- | --- |
| Official | `Official` | Built and reviewed by Hyprune; CC0-1.0, CC-BY-3.0 or CC-BY-4.0 content. |
| Community registry | `Community registry` | Third-party packages that pass automated checks. Nobody reviews the content; the licence is declared by the creator. A link is removed at the first credible report. |
| Your own | `Custom: <your label>` | Nobody. You chose it. The install checks still apply. |

The two built-in sources are always present (you can disable them). Labels come from the
source kind and from you, never from the content, so a custom source can't pass itself off as
official.

## In the Director

Open the Director's **Library** tab.

- **Browse** shows cards from every enabled source: thumbnail, name, creator, type, the source
  badge, the declared licence and the download size. Filter by source and type, or search.
- **Install** first shows the plan: what is installed, from which source, the creator and
  repository, the licence and how it was checked, the sizes and the hash. Nothing is
  downloaded before you confirm. Progress and any error show on the card.
- **Installed** lists what you have: the current and previous versions, the source, pins and
  newer versions, with Update, Roll back, Pin / Unpin and Remove (press Remove twice). Content
  installed by your system configuration is read-only here.
- **Sources** lists the sources with their entries, last refresh and any error, with Refresh,
  Disable / Enable and Remove (custom sources only). **Add source** takes an index URL, a
  GitHub repository (`github:owner/repo`) or a package URL with its sha256, and a label of
  your choice.

A library you install shows up in the **Objects** tab right away (**Open in Objects**).
Updating everything at once (`hyprune update --all`) is on the command line only for now.

## On the command line

The `hyprune` CLI (`@hyprune/sdk`) does the same. With a running session it hands libraries
to core; without one it installs them itself.

```sh
hyprune source refresh                       # fetch the indexes
hyprune browse garden --type library          # search what's available
hyprune install com.hyprune.starter           # newest version, after showing the plan
hyprune install io.github.ada.tidepool@v1.2.0 --pin
hyprune installed                             # what is installed, with updates
hyprune update --all
hyprune rollback io.github.ada.tidepool       # back to the previous version, and pin it
hyprune unpin io.github.ada.tidepool
hyprune remove io.github.ada.tidepool
```

`hyprune world …` and `hyprune library …` (`add`, `list`, `info`, `update`, `rollback`, `pin`,
`unpin`, `remove`) work on one kind. `--yes` accepts a plan without asking, except a source
change (installing an id you already have from another source), which always asks.

**Versions.** Hyprune identifies versions by their git tag. An update is a newer tag in the
same source; pre-releases are only installed when you name them. Each install keeps exactly
one previous version for a one-step rollback, and a rollback pins the restored version so the
next update doesn't undo it. An update or rollback of the world that is loaded right now
waits: load another world first.

## Custom sources

```sh
hyprune source add github:frank/hyprune-world-stuff --label "Frank's stuff"
hyprune source add https://example.org/hyprune/v0.1/index.json --label "Example club"
hyprune source add https://example.org/tidepool-1.2.0.tar.zst --sha256 <64 hex> --label "Tidepool"
hyprune source list
hyprune source remove franks-stuff
```

- **A GitHub repository** is read through its releases, never cloned: each release that follows
  the [release convention](/publishing/) becomes a version.
- **An index URL** is any index in the registry format.
- **A package URL** needs its sha256 (or is a release record URL, which carries it).

Hyprune doesn't check custom sources. Packages from them are installed with the same safety
checks, but nobody has reviewed them. Removing a source keeps what you installed from it; those
installs just stop getting updates.

## Offline

```sh
hyprune install ./io.github.ada.tidepool-1.2.0.tar.zst --sha256 <64 hex>
```

installs a downloaded archive. Without `--sha256` the hash is matched against a cached index
entry for the same id and version, else shown for you to confirm.

## Where things live

| What | Where |
| --- | --- |
| Worlds | `~/.local/share/hyprune/worlds/<id>/` (the previous version in `.previous/<id>/`) |
| Libraries | `~/.local/share/hyprune/libraries/<id>@<version>/` |
| Install records | `~/.local/state/hyprune/content.json` |
| Your sources | `~/.config/hyprune/sources.json` |
| Index, download and thumbnail cache | `~/.cache/hyprune/` |

Each honours its XDG variable. Libraries preinstalled by the installer, `try` or the Nix
modules are listed as official or system content.
