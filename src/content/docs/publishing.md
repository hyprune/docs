---
title: "Publishing a package"
description: "How to publish a Hyprune world or library from your own GitHub repository: repository name, tag, release assets, the release record, and listing it in the community registry."
---

Worlds and libraries are published by their creators, from their own repositories, as GitHub
Releases ([RFC-0015](/rfcs/0015-registry/)). Hyprune never hosts your files: the official and
community indexes only link to your release assets and pin them by sha256. Users can also add
your repository directly as a custom source, without any registry.

## The repository

One package per repository is simplest. A repository can hold several packages (like
`hyprune/worlds`); then each package's tags carry its name (below).

**Name it `<owner>/hyprune-<kind>-<name>`** (recommended, never required), with `<name>` a
lowercase slug, and add the GitHub topics `hyprune` and `hyprune-<kind>` so people can find it:

| Kind | For | Example |
| --- | --- | --- |
| `world` | A world package | `hyprune-world-tidepool` |
| `objects` | An object, character or machine library | `hyprune-objects-garden-kit` |
| `companion` | A library whose main item is a companion character | `hyprune-companion-drunk-ash` |
| `companion` (themed pack) | Several companions on one theme | `hyprune-companion-forest-pack` |
| `extension` | An RFC-0007 process extension | `hyprune-extension-weather` |
| `shell` | An alternative shell | `hyprune-shell-minimal` |

A themed library of several companions is `<owner>/hyprune-companion-<theme>-pack`. It may ship
its own clips (dances, styled walks) as a motion pack in `motion/<id>/`; every character on the
same skeleton can then play them ([shared clip library](/rfcs/0010-npcs/#amendment-shared-clip-library),
`hyprune motion check`). One repository may hold several packages, each tagged
`<name>-v<version>` (like `hyprune/worlds`, which releases the worlds, the starter kit and the optional companions
library, `hyprune-companions-v<version>`).

The registry's checks print a warning for other names and never fail on them; repositories
with several packages are exempt. Keep sources in git with or without Git LFS, as you prefer:
users never clone your repository, they download one release asset.

**Ids.** The package id is reverse-domain (RFC-0004). Without a domain of your own, use
`io.github.<owner>.<name>`: the registry checks that `<owner>` owns the repository.
`com.hyprune.*` is reserved for official packages. Official packages are listed from the meta repository's pins: preinstalled
libraries in `libraries/releases.json`, optional ones (like the companions library) in
`libraries/optional.json`.

## A release

**The version is the tag.** Set `version` in `world.json` or `library.json`, commit, and tag
that commit:

| Repository holds | Tag |
| --- | --- |
| One package | `v<version>`, e.g. `v1.2.0` |
| Several packages | `<name>-v<version>`, e.g. `lumen-reach-v0.10.3` |

Versions are SemVer without build metadata. A pre-release (`1.3.0-rc.1`) must be published as
a GitHub pre-release; Hyprune never offers it as an update unless a user asks for it. A
published tag never moves and its assets are never replaced or deleted: a fix is a new
version. Turn on GitHub's immutable releases where your account has them. Hyprune pins every
version by hash, so a replaced asset is refused, never installed.

### Pack it

```sh
hyprune library check ./my-library                 # or: hyprune world validate ./my-world
hyprune library pack ./my-library --release --tag v1.2.0 --output dist/
# worlds: hyprune world pack ./my-world --release --tag v1.2.0 --output dist/
```

`pack --release` checks the package, checks that the tag names the manifest version, and
writes the three release assets (plus up to four thumbnails with `--thumbnail file.png`):

| Asset | Content |
| --- | --- |
| `<id>-<version>.tar.zst` | The archive: one root directory named exactly the id, reproducible. |
| `<id>-<version>.tar.zst.sha256` | Its `sha256sum` line. |
| `<id>-<version>.release.json` | The release record: id, type, version, format, name, licence, archive hash and sizes, required libraries, thumbnails, and the repository, tag and commit it was built from. |
| `<id>-<version>.thumb-<n>.png` | Optional, `n` = 1-4, at most 1280 x 720 and 512 KiB; 1 is the card image. |

The repository and commit default to the package directory's git remote and `HEAD`; pass
`--repo` and `--commit` when packing elsewhere.

### Publish it

```sh
git tag v1.2.0 && git push origin v1.2.0
gh release create v1.2.0 dist/io.github.ada.tidepool-1.2.0.* --title "Tidepool Station 1.2.0" --notes "…"
```

Packages are data only: JSON, glTF, images, the SVG subset, audio and text. No file may be
executable or start with an executable or script signature; the registry and every install
refuse those.

**Licence.** Declare an SPDX licence in the manifest and cover every file in its attribution.
You are responsible for licensing your own work; the community registry takes the declared
licence at face value and only checks that it is present and well formed.

## Listing it in the community registry

The community registry is `hyprune/registry`: one JSON file per package, added by pull
request.

```sh
hyprune registry entry github:ada/hyprune-world-tidepool@v1.2.0 > entries/community/io.github.ada.tidepool.json
hyprune registry check entries/community/io.github.ada.tidepool.json
```

Add `summary`, `description` and `tags` if you like, then open a pull request that changes
only that file. CI downloads your release asset and checks it: you have write access to the
repository, the id is yours, the tag names the version and points to the record's commit, the
hashes and sizes agree, the archive is safe and data only, the package validates, the licence
is declared, required libraries are listed, and nothing was removed before. A maintainer
merges when every check passes; merging is not a content review.

For each new version, add it at the top of `versions` in your entry (or regenerate the entry
and keep the old versions) and open another pull request.

If someone reports a problem with your package, the registry removes the link at the first
credible report; see the registry's README. Your repository and releases are never touched.

## Without a registry

Anyone can install from your repository directly:

```sh
hyprune install github:ada/hyprune-world-tidepool            # newest release
hyprune source add github:ada/hyprune-world-tidepool --label "Ada's worlds"   # follow updates
```

Releases without a valid release record are skipped, so the convention above is all a
repository needs.
