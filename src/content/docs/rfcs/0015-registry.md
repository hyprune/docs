---
title: "RFC-0015 — Registry and sources: publishing, discovering, installing and updating worlds and libraries"
description: "Creator-owned releases, one index format for the official, community and custom sources, link-only listing with automated checks, and install, update, rollback and pinning through core, the CLI and the Director."
---

**Status: draft · proposed 2026-10-12; decisions recorded 2026-10-12 (below).** Phase 1 is implemented as recorded in the [amendment](#amendment-phase-1-in-the-sdk-without-new-ipc); the rest is not. It builds on the
world package and archive rules of [RFC-0004](/rfcs/0004-world-format/), the libraries,
library install and `<id>@<version>` layout of [RFC-0011](/rfcs/0011-objects/) (IPC 0.22),
the extension host and grant approvals of [RFC-0007](/rfcs/0007-extensions/) and the grant
model of [RFC-0003](/rfcs/0003-ipc/). [RFC-0014](/rfcs/0014-builder/) (draft: the in-world builder,
import, git-versioned world folders, Make world and Release) produces the package directories
this RFC publishes; its Release pushes a tag and creates the GitHub release in this RFC's format.

**Decisions (2026-10-12).** The version is the git tag: releases are built from tags, and
indexes and installs refer to the tag. An installed world stays in `worlds/<id>/`, and only the
previous version is kept, for one-step rollback; update means a newer tag exists, pin means
staying on a tag, and installs fetch the tag's release asset, never a clone. System-managed
content is read-only without an explicit override. The official licence bar is CC0-1.0,
CC-BY-3.0 or CC-BY-4.0.

## Goal

Anyone who makes a world or a library can publish it from their own repository, and anyone
running Hyprune can find it, install it, keep it up to date and go back one
version, from the Director or the command line. Creators own and host their content;
Hyprune only links to it. Every package is pinned by hash and installed by the same safe
extractor, whatever its source, and worlds and libraries stay data only: installing one
never runs code.

## Principles

1. **We only link, never host.** An index entry points to the creator's own GitHub Release
   asset or URL. Hyprune's indexes carry metadata and hashes, never package bytes or
   thumbnails. Official packages follow the same rule: the hyprune organisation is their
   creator, and they are releases of its own repositories like anyone else's.
2. **Declared licences are taken at face value.** The creator declares an SPDX licence for
   each version and is responsible for licensing their own repository. The community
   registry does not review content beyond the automated technical checks (download, hash,
   schema and world-check or library validation, size limits, no executables). A link is
   removed at the first credible report of a problem.
3. **Three source kinds, always labelled.** Official, community registry and custom sources
   share one index format and one install path; the Director and the CLI always say which
   source an entry comes from.
4. **Same safety for every source.** Hash pinning, the safe extractor, size and decompression
   limits, the data-only rule and core's validation apply to every install, curated or not.
   Curation differs between sources; safety does not.
5. **Core never touches the network.** A separate fetch helper downloads; core verifies,
   extracts and validates local files only, as RFC-0011 already requires for libraries.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Package | A world or a library: one root directory with its manifest (`world.json` or `library.json`), distributed as a `.tar.zst` archive. |
| Tag | The git tag a release is built from (`v1.2.0`). The tag names the version everywhere: in indexes, installs, updates and pins. |
| Release | One published version of one package: the GitHub Release for a tag, with the archive, its `.sha256` file and its release record as assets. |
| Release record | `<id>-<version>.release.json`: the machine-readable description of one release (below). |
| Index | A JSON document listing entries, in the format defined here. Anyone can publish one. |
| Entry | One package in an index: id, type, creator, repository, and its versions with URL, hash, size, licence and format. |
| Source | Something a user's Hyprune reads entries from: a built-in index (official, community registry) or a custom source (an index URL, a GitHub repository or a direct package URL). |
| Install | The current release of one package on this machine: extracted, validated and recorded with its source, tag and hash. A world has one install, in `worlds/<id>/`. |
| Previous | The install an update or rollback replaced, kept for one-step rollback. |
| Pin | Staying on the installed tag; updates skip it. |
| Job | An asynchronous install, update or refresh in core, with stages and progress. |

## Sources

| Source kind | What it is | Who curates | Label shown | Checks before listing | Removal |
| --- | --- | --- | --- | --- | --- |
| **Official** | Packages built by the hyprune organisation from its own repositories (today `hyprune/worlds`), CC0-1.0, CC-BY-3.0 or CC-BY-4.0 content only. Index generated from the meta repository's pins. | Hyprune builds and reviews every release (the RFC-0004 rights policy, the worlds release gates). | `Official` | The full release gates of the building repository, plus the registry's automated checks. | Ordinary bug and rights work in the building repository; a fixed release replaces the pin. |
| **Community registry** | The hyprune-managed index of third-party packages, `hyprune/registry`. Entries added by pull request; link only. | Nobody reviews content. Automated checks run on every pull request and on a schedule; maintainers merge entries that pass. | `Community registry`, with "licence declared by the creator" | The automated checks below. | The takedown process below: the link is removed at the first credible report. |
| **Custom** | Any index URL in this format, any GitHub repository that publishes releases by the convention below, or a direct package URL, added by the user with a display label. | The user. Hyprune does not police custom sources. | `Custom: <label>` (for example `Custom: Frank's stuff`) | None by Hyprune. The install checks still apply. | The user removes or disables the source. |

The official and community registry indexes are **built-in sources**: present by default,
may be disabled, can't be removed or relabelled. Third parties can run their own indexes in
the same format, and users subscribe to them as custom sources. Nothing in an index decides
its own label: a third-party index can't present itself as official or as the community
registry (see [Labels](#labels)).

## Package release convention

This convention applies to every package a built-in source lists and is what
`github:` custom sources read. Direct-URL sources need only the archive and its hash.

### Repository and tags

A creator's package is a git repository on GitHub (RFC-0014's builder keeps an author's world
as one). **Publishing is a tag plus a release:** the creator tags a commit, and the release
built from that tag carries the package. Source files may live in git with or without Git
LFS, as the creator chooses; **distribution uses Release assets, never the repository**.
Installers MUST NOT clone or fetch a source repository: its history holds every binary
revision and LFS downloads count against the creator's quota. They fetch the release asset
for the tag and verify its hash.
Release assets have stable URLs that can be pinned by hash and no per-download billing for
the creator, whereas LFS bandwidth quotas are small and count every download (including CI
checkouts of LFS objects). The [repository template](#repository-template) builds releases
from either layout.

| Repository holds | Tag | Example |
| --- | --- | --- |
| One package | `v<version>` | `github:ada/tidepool-world`, tag `v1.2.0` |
| Several packages | `<name>-v<version>`, where `<name>` is a slug naming the package within the repository | `github:hyprune/worlds/lumen-reach`, tag `lumen-reach-v0.10.2` |

The tag is the version: `<version>` is SemVer 2.0 and MUST equal the manifest `version` at
the tagged commit, and the release MUST be built from that commit. A published tag MUST NOT
be moved or deleted; a fix is a new tag. Versions compare by SemVer order of their tags, so
"newer" always means a higher tag. A version with a pre-release
part (`1.3.0-rc.1`) MUST be published as a GitHub pre-release; clients never offer
pre-releases as updates unless the user asks for that version. Build metadata (`+…`) is not
allowed in published versions.

### Assets

A release carries exactly one package's assets:

| Asset | Required | Content |
| --- | --- | --- |
| `<id>-<version>.tar.zst` | yes | The archive (below). |
| `<id>-<version>.tar.zst.sha256` | yes | One line in `sha256sum` format: 64 lowercase hex digits, two spaces, the archive asset name, newline. |
| `<id>-<version>.release.json` | yes | The release record (below). |
| `<id>-<version>.thumb-<n>.png` / `.jpg` | optional, `n` = 1-4 | Thumbnails, sRGB, at most 1280 x 720 and 512 KiB each, 16:9 recommended; thumbnail 1 is the card image. |

`<id>` is the manifest id (reverse-domain, RFC-0004). Published assets are **immutable**: a
creator MUST NOT replace or delete an asset of a published version; a fix is a new version.
Creators SHOULD enable the hosting platform's immutable-release setting where it exists.
Indexes pin hashes, so a replaced asset is detected and refused, never silently installed.

### Archive

The archive follows the RFC-0004 and RFC-0011 archive rules: a zstd-compressed ustar stream
with one root directory named exactly `<id>`, containing regular files and directories only
(no symlinks, hard links, devices, FIFOs, absolute paths, `..`, empty or `.` segments,
backslashes or `%`, `?`, `#`, `:` in names). It SHOULD be reproducible (sorted entries,
mtime 0, uid and gid 0, mode 0644 or 0755 for directories). Limits:

| Limit | World | Library |
| --- | --- | --- |
| Archive (compressed) | 512 MiB | 256 MiB |
| Expanded size | 1 GiB | 512 MiB |
| Files | 10,000 | 4,000 |
| Single file | 128 MiB | 32 MiB |
| zstd window | 128 MiB (window log at most 27) | 128 MiB |

**Data only (normative).** Every file in the archive MUST be one of: the manifest and other
`.json` files; glTF (`.glb`, `.gltf`, `.bin`); images (`.png`, `.jpg`, `.jpeg`, `.ktx2`);
SVG that passes core's map SVG subset (no scripts, event attributes or external references);
audio (`.ogg`, `.wav`); or documentation (`.md`, `.txt`, and `LICENSE`, `NOTICE`, `COPYING`,
`ATTRIBUTION` with or without those extensions). No file may have an executable mode bit, and
no file may start with an executable or script signature (ELF, PE `MZ`, Mach-O, `#!`, WebAssembly
`\0asm`). A world's `requiredExtensions` may name only data extensions core implements (such as
`com.hyprune.map` and `com.hyprune.blueprint`); a world that works with an executable extension
says so in its description, and the user installs that extension separately through the
RFC-0007 extension host, with its own grant approval.

### Release record

```json
{
  "recordVersion": "0.1",
  "type": "world",
  "id": "io.github.ada.tidepool",
  "version": "1.2.0",
  "formatVersion": "0.8",
  "name": "Tidepool Station",
  "license": "CC-BY-SA-4.0",
  "archive": {
    "name": "io.github.ada.tidepool-1.2.0.tar.zst",
    "sha256": "5d2f0c6e3b9a41d8e7c2b0f4a6d9e1c3b5a7f9e2d4c6b8a0f1e3d5c7b9a2e4f6",
    "bytes": 48213004,
    "expandedBytes": 96424960,
    "files": 212
  },
  "requires": {"libraries": ["com.hyprune.street@1.2.0"]},
  "thumbnails": [
    {"name": "io.github.ada.tidepool-1.2.0.thumb-1.png",
     "sha256": "0b8e4c2a6f1d3e5b7a9c0d2e4f6a8b1c3d5e7f9a0b2c4d6e8f1a3b5c7d9e0f2a",
     "width": 1280, "height": 720}
  ],
  "source": {"repo": "https://github.com/ada/tidepool-world", "tag": "v1.2.0",
             "commit": "3f2a9c4e1b7d5a8c0e2f4b6d8a1c3e5f7b9d0a2c"},
  "tool": {"name": "hyprune", "version": "0.23.0"},
  "checks": {"schema": "pass", "worldCheck": "pass"}
}
```

| Field | Rules |
| --- | --- |
| `recordVersion` | Required, `"0.1"`. |
| `type` | `world` or `library`. |
| `id`, `version`, `formatVersion`, `name`, `license` | Required; MUST equal the archive manifest's values. `license` is an SPDX expression. |
| `archive` | Required: asset name, sha256, compressed bytes, expanded bytes and file count. |
| `requires.libraries` | Exact `id@version` library references from the manifest (RFC-0011); a library lists none. |
| `thumbnails` | 0-4 assets with their hashes and pixel sizes. |
| `source` | Required: repository URL, the tag, and the full commit the tag points to and the release was built from. |
| `tool`, `checks` | Informative: what built it and which local checks passed. Clients never trust `checks`. |

The official worlds' existing release report (`reports/release.json`) is a superset kept in
the building repository; official releases publish this record as an asset as well.
`hyprune world pack --release` and `hyprune library pack --release` write the archive, the
`.sha256` file and the record together.

### Repository template

`hyprune/package-template` (a template repository, MIT) holds a package skeleton, a
`.gitattributes` with commented LFS patterns, and a release workflow. On a pushed tag it:

1. checks out the tag (fetching LFS objects only if the repository uses LFS, with a cache);
2. installs the SDK and the core checker at versions pinned in the workflow;
3. runs `hyprune world validate` or `hyprune library check`, then `hyprune-world-check` for
   worlds;
4. runs `pack --release`, checks that the tag, manifest and record agree, and creates the
   GitHub Release with the assets;
5. prints the community registry entry for this version and, when the repository has opted
   in, opens the registry pull request (P2).

Creators MAY release by hand; the convention, not the workflow, is what indexes check.

## Index format

Every source except a GitHub repository or a direct URL is an index: one JSON document at a
stable HTTPS URL. The official index, the community registry index and any third-party index
use the same schema, `registry-index.schema.json` 0.1.

```json
{
  "indexVersion": "0.1",
  "name": "Hyprune community registry",
  "homepage": "https://github.com/hyprune/registry",
  "serial": 1842,
  "generated": "2026-11-02T08:00:00Z",
  "successor": null,
  "entries": [
    {
      "id": "io.github.ada.tidepool",
      "type": "world",
      "name": "Tidepool Station",
      "summary": "A tidal research station with four workspace homes and a pier.",
      "description": "Four connected homes around a flooded atrium...",
      "creator": "ada",
      "repo": "https://github.com/ada/tidepool-world",
      "tags": ["water", "station"],
      "versions": [
        {
          "tag": "v1.2.0",
          "version": "1.2.0",
          "formatVersion": "0.8",
          "published": "2026-11-01",
          "license": "CC-BY-SA-4.0",
          "url": "https://github.com/ada/tidepool-world/releases/download/v1.2.0/io.github.ada.tidepool-1.2.0.tar.zst",
          "sha256": "5d2f0c6e3b9a41d8e7c2b0f4a6d9e1c3b5a7f9e2d4c6b8a0f1e3d5c7b9a2e4f6",
          "bytes": 48213004,
          "expandedBytes": 96424960,
          "files": 212,
          "record": {
            "url": "https://github.com/ada/tidepool-world/releases/download/v1.2.0/io.github.ada.tidepool-1.2.0.release.json",
            "sha256": "9a1c3e5f7b9d0a2c4e6f8b1d3a5c7e9f0b2d4a6c8e1f3b5d7a9c0e2f4b6d8a1c"
          },
          "requires": {"libraries": ["com.hyprune.street@1.2.0"]},
          "thumbnails": [
            {"url": "https://github.com/ada/tidepool-world/releases/download/v1.2.0/io.github.ada.tidepool-1.2.0.thumb-1.png",
             "sha256": "0b8e4c2a6f1d3e5b7a9c0d2e4f6a8b1c3d5e7f9a0b2c4d6e8f1a3b5c7d9e0f2a",
             "width": 1280, "height": 720}
          ],
          "status": "available"
        }
      ]
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `indexVersion` | Required. Clients read indexes whose major-zero version they support (`"0.1"` now) and refuse others with "this source needs a newer Hyprune". |
| `name`, `homepage` | Optional, informative. `name` (at most 64 characters) is only suggested as the default label when a user adds the index; it never becomes the label of a built-in source. |
| `serial` | Required, a positive integer that increases with every publication. A client refuses an index whose serial is lower than the last one it accepted from that source (rollback protection) and keeps the cached one. |
| `generated` | Required RFC 3339 UTC time. |
| `successor` | Optional HTTPS URL of a newer index version for the same source. A client that supports it offers to switch the source to it; it never switches silently. |
| `entries` | Required, at most 20,000, ids unique within the index. |
| `entries[].id` | Reverse-domain id (RFC-0004). |
| `entries[].type` | `world` or `library`. |
| `entries[].name`, `summary`, `description` | Plain text (no markup is rendered): name 1-64 characters, summary at most 140, description at most 2,000. |
| `entries[].creator` | 1-64 characters: who publishes it (for GitHub, the repository owner). |
| `entries[].repo` | Optional HTTPS URL of the source repository. |
| `entries[].tags` | At most 8 slugs. |
| `versions[]` | 1-64 versions, newest first, each unique. |
| `versions[].tag` | Required: the git tag the release was built from. Clients identify, install, update and pin versions by tag. Publishers without git use `v<version>`. |
| `versions[].version`, `formatVersion`, `license` | SemVer, equal to the version the tag names; the package format version; the declared SPDX expression. |
| `versions[].published` | ISO date. |
| `versions[].url`, `sha256`, `bytes`, `expandedBytes`, `files` | The archive URL (HTTPS), its hash, and its sizes; sizes within the [archive limits](#archive). |
| `versions[].record` | Optional `{url, sha256}` of the release record. Required in the official and community registry indexes. |
| `versions[].requires` | As the release record. |
| `versions[].thumbnails` | 0-4 `{url, sha256, width, height}`, within the asset limits. |
| `versions[].status` | `available` (default) or `unavailable` (a scheduled re-check found the asset missing or changed; clients don't offer it). |

**Limits for any index:** at most 16 MiB as served, UTF-8 JSON, no duplicate keys. URLs in
an index are HTTPS only. An index MAY list packages hosted anywhere; the hyprune indexes list
only GitHub Release assets of the entry's `repo`.

**Versioned URLs.** An index is published at a URL that names its format version, by
convention `…/v0.1/index.json`. A publisher moving to a later index version keeps the old URL
working (at least until clients that read it have had a release to move) and points
`successor` at the new one.

## The hyprune registry

### Repository layout

`hyprune/registry` (public, MIT for its code; entries are metadata) holds both built-in
indexes:

```text
registry/
  entries/
    official/<id>.json      # generated from the meta repository's pins; changed only by the sync job
    community/<id>.json     # one entry per package, added and updated by pull request
  removed/<id>.json         # tombstones of removed links (below)
  schema/                   # pinned copy of the 0.1 index and release record schemas
  tools/                    # check, build-index and re-verify scripts
  .github/
    CODEOWNERS              # entries/official/ owned by the release maintainers
    ISSUE_TEMPLATE/report.yml
    workflows/check.yml     # pull requests
    workflows/publish.yml   # main: build and publish both indexes
    workflows/reverify.yml  # weekly re-check of every listed version
```

An entry file is exactly one index `entries[]` object (with a `$schema` pointer).
`publish.yml` concatenates them into two documents served by GitHub Pages:

| Built-in source | URL |
| --- | --- |
| Official | `https://hyprune.github.io/registry/v0.1/official.json` |
| Community registry | `https://hyprune.github.io/registry/v0.1/community.json` |

Each publication increments `serial`. The indexes contain metadata only; nothing is mirrored.

### Ids and ownership

- `com.hyprune.*` ids are reserved for official entries. A community entry using one is
  refused.
- An id under `io.github.<owner>.` MUST belong to a repository owned by `<owner>`.
- Other ids are first come, first served; an id cannot change owner except through the
  report process.
- **Only the repository's maintainers list it.** The pull request author MUST have write
  access to the entry's `repo` (checked through the GitHub API). Nobody can list another
  person's repository.
- `id@version` maps to one sha256 forever. A version can be removed but never re-pointed to
  different bytes; a fix is a new version.

### Pull request checks (CI)

`check.yml` runs on `pull_request` (never `pull_request_target`), with no secrets except a
read-only token for API lookups. Downloaded archives are checked in a job that has no network
after the download step, a 15-minute timeout and the archive limits enforced while streaming.

| # | Check | Fails when |
| --- | --- | --- |
| 1 | Entry schema | The file is not a valid 0.1 entry, its name is not `<id>.json`, or it changes another entry. |
| 2 | Id and ownership | Reserved or mismatched id; the PR author lacks write access to `repo`; the id is held by another repository. |
| 3 | Tag and release | The tag doesn't exist, doesn't name the entry's version by the [tag convention](#repository-and-tags), or doesn't point to the record's `source.commit`; the release for the tag doesn't exist, is a draft, or is a pre-release not marked as one; `url` is not an asset of that release. |
| 4 | Download and size | The download fails or exceeds `bytes`; Content-Length disagrees with `bytes`. |
| 5 | Hashes | The archive's sha256 differs from the entry, the `.sha256` asset or the record; the record's hash differs from the entry. |
| 6 | Record agreement | Id, version, format, licence, sizes, requirements or thumbnails differ between record, entry and manifest. |
| 7 | Safe extraction | Any archive rule or limit above is broken (the core extractor's rules, shared fixtures). |
| 8 | Data only | Any file outside the allowlist, any executable bit or signature, or an unknown required extension. |
| 9 | Package validation | Schema validation of the manifest fails; for worlds `hyprune-world-check` (pinned core) fails; for libraries the RFC-0011 library and object validation fails. |
| 10 | Declared licence | `license` is missing or not a valid SPDX expression, or the manifest's attribution doesn't cover every file. Only the presence and form are checked, never the claim. |
| 11 | Requirements | A required library `id@version` is not listed in the official or community index. |
| 12 | Thumbnails | A thumbnail is missing, its hash differs, it is not PNG or JPEG, or it exceeds its limits. |
| 13 | Removed | The id, a version or the archive hash matches a tombstone in `removed/`. |
| 14 | Version history | An existing version's `tag`, `url` or `sha256` changed, or a listed version disappeared without a removal. |

When all checks pass, a maintainer merges. Merging is not a content review; maintainers only
confirm the checks ran on the final commit. New versions of an existing entry, opened by a
repository maintainer and passing every check, MAY be merged automatically (open question 2).

`reverify.yml` re-downloads every listed version weekly (rate-limited) and marks a version
`unavailable` when its asset is gone, its hash changed or its tag was moved or deleted. An entry whose every version is
unavailable for 30 days is removed with the reason `unavailable`.

### Official entries

The official index is generated from the meta repository's pins, `worlds/releases.json` and
`libraries/releases.json`, by a sync job (a pull request from a bot, owned by CODEOWNERS).
The sync job checks that each pin's URL, sha256 and Nix hash agree and adds the entry fields
the pins don't carry (name, summary, creator `hyprune`, thumbnails) from each release record.
Official entries pass the same automated checks; their review happens earlier, in the
building repository's release gates and the official rights policy: original, CC0-1.0,
CC-BY-3.0 or CC-BY-4.0, with provenance (RFC-0004's policy, widened by this RFC to CC-BY-3.0;
RFC-0014's official-publishing check follows it). Releases made before the release record existed are imported from
the pins without a record.

### Reports and removal (community registry only)

The community registry links to content it doesn't review, so its one tool is removing a
link.

1. **Reporting.** Anyone may report an entry: a rights holder, a creator, a user. The report
   form (`ISSUE_TEMPLATE/report.yml`) asks for the entry id and versions, the kind of problem
   (rights, licence, safety, content policy, broken, creator request), and a contact. Reports
   that would expose personal data or exploit details go to the security contact in the
   organisation's security policy instead of a public issue.
2. **Removal at the first credible report.** A maintainer removes the link when the report
   identifies the entry and describes a plausible problem; the registry does not judge the
   claim, the creator's repository or the licence. Removal is a commit that deletes the entry
   (or versions) and adds a tombstone; the next publication drops it from the index.
   Maintainers SHOULD act within three working days and MUST NOT wait for the creator's
   response.
3. **Tombstone.** `removed/<id>.json`: `{id, versions: "*" | [...], sha256: [...], reason,
   date, report}`, where `reason` is one of `rights`, `licence`, `safety`, `policy`, `broken`,
   `unavailable` or `creator-request` and `report` is the issue number. Tombstones contain no
   claim details. CI refuses to list a tombstoned id, version or archive hash again.
4. **Relisting.** Only when the reporter withdraws the report, or the creator shows that the
   problem is fixed in a new version with a new hash; maintainers record the reason in the
   tombstone history. The registry offers no other appeal: the creator's repository and its
   releases are untouched and stay the creator's business, as do disputes about them on the
   hosting platform.
5. **Clients.** On the next refresh the entry disappears from Browse and its installs are
   marked `removed from source` with the reason class. Hyprune never deletes or disables
   installed content remotely; for the reason `safety` the Director and CLI recommend removal
   and ask on the next start. Updates from that entry stop.

Official entries are handled as ordinary bug or rights work in the building repository
(withdrawing a pin, publishing a fixed version). Custom sources have no report process in
Hyprune: they are entirely the user's choice and the source operator's business.

## Custom sources

### Kinds

| Added as | Example | What the client reads | Updates |
| --- | --- | --- | --- |
| Index URL | `https://example.org/hyprune/v0.1/index.json` | The index document. | From the index on refresh. |
| GitHub repository | `github:frank/hyprune-stuff` | The repository's release list (GitHub REST API), never the repository itself: each tag whose release follows the [release convention](#package-release-convention) becomes a version of an entry. Releases without a valid record are skipped. | From newer tags on refresh. |
| Package URL | `https://example.org/tidepool-1.2.0.tar.zst --sha256 <hex>`, or a release record URL | One entry with one version. An archive URL needs `--sha256`; a record URL supplies the hash and is re-read on refresh. | Only for a record URL whose version increases. |

A package URL without a hash is refused: every install is pinned. For `github:` sources the
hash comes from the release record and `.sha256` asset of the same origin, so it guarantees
integrity and repeatability, not authorship (signatures, P4).

### Labels

- Every source has an id (a slug, generated from the label unless given) and a label.
- The client renders the source kind before the label and never lets content change it:
  `Official`, `Community registry`, or `Custom: <label>`.
- A custom label is chosen by the user (1-48 printable characters). When omitted, the default
  is the index's `name`, else the repository (`frank/hyprune-stuff`), else the URL's host;
  the `Custom:` prefix is always added, so a custom source can't display as official or as
  the community registry.
- Entries are keyed by `(source, id)`. The same id may appear in several sources; Browse lists
  each with its own label. An install remembers its source and updates only from it. Installing
  an id that is already installed from another source is a **source change**: the plan shows
  both labels and needs explicit confirmation (no `--yes` shortcut). A custom source listing a
  `com.hyprune.*` id is shown, labelled custom, and is never an update for the official
  install.

### Adding, listing, refreshing and removing

| Action | CLI | Director (Browse → Sources) |
| --- | --- | --- |
| Add | `hyprune source add <url \| github:owner/repo> [--label TEXT] [--id SLUG] [--sha256 HEX]` | "Add source": URL field, label field, a preview of the first entries, Add. |
| List | `hyprune source list [--json]` | The sources list: label, kind, URL, entries, last refresh, state. |
| Refresh | `hyprune source refresh [ID…]` | "Refresh" per source and for all. |
| Relabel | `hyprune source label ID TEXT` | Edit the label. |
| Disable / enable | `hyprune source disable ID`, `enable ID` | A switch per source (built-in sources included). |
| Remove | `hyprune source remove ID` | Remove (custom sources only). |

Adding a source fetches it once and validates it (the index schema and limits, or the
repository's releases); a source that fails is not added. Adding shows the notice "Hyprune
doesn't check custom sources. Packages from them are installed with the same safety checks,
but nobody has reviewed them." Removing or disabling a source keeps everything installed from
it; those installs show `source removed` or `source disabled` and get no updates until the
source returns. At most 32 custom sources.

## Install, update, rollback and pin

### Install pipeline (normative)

Every install, from any source, runs the same stages as one job:

1. **Resolve.** Find the entry and its tag: the requested tag, else the highest
   non-pre-release `available` tag whose `formatVersion` this core supports. A version the
   core can't load is listed with "needs a newer Hyprune" and is not installable. For `github:`
   sources this reads the release list and the tag's release record; nothing is cloned.
2. **Plan.** Compute what will be installed: the package, the exact library versions it
   requires (from the same source, then the official index, then the community registry),
   which are already installed, what the install replaces (the current tag, which becomes the
   previous one), download and expanded sizes, disk space after install.
3. **Confirm.** Show the plan with provenance and licence (below). Nothing is downloaded
   before confirmation except the index or release metadata.
4. **Download.** The fetch helper downloads the tag's release asset into the cache, refusing
   more bytes than `bytes`.
5. **Verify.** Core hashes the cached file and compares it with the pinned sha256 before
   reading any archive content. A mismatch fails the job (`hash.mismatch`) and deletes the
   cached file.
6. **Extract.** Off the compositor thread, with the safe extractor, into a staging directory
   whose name starts with `.` under the target root, enforcing the archive and data-only rules
   while streaming (zstd window cap, expanded bytes, file count, file size).
7. **Validate.** Core validates the staged package exactly as it validates installed ones:
   the manifest schema, for worlds the world-check rules core implements, for libraries the
   RFC-0011 library and object validation. Id, version and format MUST equal the entry's.
8. **Commit.** For a world: delete `worlds/.previous/<id>/`, rename the current
   `worlds/<id>/` to `worlds/.previous/<id>/`, rename the staging directory to `worlds/<id>/`,
   then write the install record (tag, hash, previous). For a library: rename the staging
   directory to `libraries/<id>@<version>/` (RFC-0011) and record it as the current tag. Then
   publish the new content revision.

Any failure leaves the previous state untouched and removes the staging directory; the commit
renames are journalled in `content.json` first, so an interrupted commit is completed or
undone at the next start. The same tag with the same digest installed again succeeds without
change; a tag whose asset no longer matches the recorded hash is refused (`content.conflict`,
as RFC-0011's `library.conflict`). Library installs and world installs are the same job; the
existing `libraries.install` (IPC 0.22) becomes a local-file install through this pipeline.

### Provenance and licence on install

The confirmation (Director dialog or CLI prompt) shows, for every package in the plan:

| Item | Shown |
| --- | --- |
| Name, id, version, type | Always. |
| Source label | `Official`, `Community registry`, or `Custom: <label>`, with the source URL. |
| Creator and repository | From the entry and record; the commit for record-backed versions. |
| Licence | The declared SPDX expression. Official: "CC-BY-4.0 · reviewed by Hyprune". Community registry: "CC-BY-SA-4.0 · declared by the creator, not reviewed". Custom: "declared by the package, not checked". |
| Sizes and hash | Download size, installed size, sha256 (shortened, full on request). |
| Requirements | Libraries pulled in; executable extensions the description mentions are never installed here. |
| Data only | "Worlds and libraries contain no code. Installing doesn't run anything." |

The installed package's licence, attribution and provenance stay visible in the Installed
view and `hyprune world info`.

### Update, rollback, pin and remove

Each install has one current tag and at most one previous tag. There is no folder per version
and no version history beyond one step.

| Operation | Semantics |
| --- | --- |
| **Check** | On refresh, each install from an enabled source is compared with its source: an update exists when the source lists a newer tag (higher SemVer, not a pre-release, `available`, loadable by this core) than the current one. Major-version updates are offered but flagged ("may move or hide things you placed", RFC-0011 dormant overrides). Pinned installs show the newer tag with a pin badge. |
| **Update** | Installs the newest tag through the install pipeline; the current install becomes the previous one, and the old previous one is deleted. Never automatic in this RFC: the user starts every update (open question 5). |
| **Rollback** | Swaps the current and previous installs (two renames, no download) and pins the restored tag, so the next update doesn't redo the change. Rolling back again swaps them back. With no previous install, rollback is refused; installing an older tag explicitly (`add <id>@<tag>`) is the way further back, and it replaces the current install like an update. |
| **Pin** | Stays on the current tag: updates skip it until `unpin`. `add <id>@<tag> --pin` installs a given tag and pins it in one step. |
| **Remove** | Deletes the current and previous installs and the record. Refused for the loaded world, for system-managed installs, and for a library version an installed world requires (the error lists them) unless forced; RFC-0011 user placements referencing a removed library become `missing`. |

**Active world.** An update or rollback of the loaded world never swaps files under the
running scene. The new install is staged and validated, and the commit renames wait until the
world is unloaded; the Director offers "Load the new version", which unloads, commits and
loads (`world.load` of the same id). Until then the install record shows `pending`. Overlays are
keyed by world id (RFC-0011), so user placements carry over and are rechecked as RFC-0011
describes.

**Libraries.** RFC-0011 keeps libraries in `<id>@<version>` directories because worlds
reference exact versions, and that stays. A library's current and previous tags follow the same
rules as a world's; any other installed version is kept exactly as long as an installed world
or a user placement requires it, and is deleted with the update or removal that leaves it
unreferenced. A library update leaves worlds on the versions they reference; user placements
follow RFC-0011's same-major substitution.

**Update checks.** A refresh downloads whole indexes, so it reveals nothing about what is
installed; `github:` sources query only their own repository. Setting `content.check_updates`
is `daily` (default), `weekly` or `off`; the Director and CLI can always refresh by hand.

### Where state lives

| What | Where | Written by |
| --- | --- | --- |
| Installed worlds | `$XDG_DATA_HOME/hyprune/worlds/<id>/`: the current tag, as today | core, CLI, installer |
| Previous worlds | `$XDG_DATA_HOME/hyprune/worlds/.previous/<id>/`: the one install the last update or rollback replaced | core, CLI |
| Installed libraries | `$XDG_DATA_HOME/hyprune/libraries/<id>@<version>/` (RFC-0011): the current and previous tags and versions installed worlds require | core, CLI |
| System-managed content | Packaged world directories and `$HYPRUNE_LIBRARY_DIR` entries from the system modules | the system configuration (read-only) |
| Install records (source, tag, hash, previous, pin) | `$XDG_STATE_HOME/hyprune/content.json` | core, CLI |
| Custom sources and built-in source switches | `$XDG_CONFIG_HOME/hyprune/sources.json` | core, CLI; the user may edit it |
| System-declared sources | Files listed in `HYPRUNE_SOURCES_FILES` (read-only) | the system configuration |
| Index and record cache | `$XDG_CACHE_HOME/hyprune/sources/<sourceId>/` | fetch helper |
| Downloads | `$XDG_CACHE_HOME/hyprune/downloads/<sha256>.tar.zst` (pruned after commit, kept at most 7 days) | fetch helper |
| Thumbnails | `$XDG_CACHE_HOME/hyprune/thumbnails/<sha256>.png` or `.jpg` (verified) | fetch helper |

All JSON files are replaced atomically with mode 0600, under an exclusive lock on
`$XDG_STATE_HOME/hyprune/content.lock`, which both core and the CLI take, so a CLI run while
core is running and a CLI run without a session can't interleave.

```json
{
  "version": 1,
  "installs": [
    {"id": "io.github.ada.tidepool", "type": "world", "source": "community", "pinned": false,
     "current": {"tag": "v1.2.0", "version": "1.2.0",
       "sha256": "5d2f0c6e3b9a41d8e7c2b0f4a6d9e1c3b5a7f9e2d4c6b8a0f1e3d5c7b9a2e4f6",
       "digest": "c41e…", "license": "CC-BY-SA-4.0",
       "url": "https://github.com/ada/tidepool-world/releases/download/v1.2.0/io.github.ada.tidepool-1.2.0.tar.zst",
       "installed": "2026-11-02T09:12:44Z"},
     "previous": {"tag": "v1.1.0", "version": "1.1.0", "sha256": "…", "digest": "…",
       "license": "CC-BY-SA-4.0", "url": "…", "installed": "2026-10-20T18:01:09Z"},
     "pending": null}
  ]
}
```

```json
{
  "version": 1,
  "builtin": {"official": {"enabled": true}, "community": {"enabled": true}},
  "custom": [
    {"id": "franks-stuff", "label": "Frank's stuff", "kind": "index",
     "url": "https://example.org/hyprune/v0.1/index.json", "enabled": true, "added": "2026-11-01"},
    {"id": "ada-tidepool", "label": "Ada's worlds", "kind": "github", "repo": "ada/tidepool-world",
     "enabled": true, "added": "2026-11-02"}
  ]
}
```

`digest` is core's content digest of the extracted tree (the RFC-0011 library digest), used
for conflict detection and to notice local tampering.

**Core's world catalog** keeps today's layout: one `worlds/<id>/` per id. Core MUST ignore
directories whose names start with `.` in the world root (`.previous/` and staging), as it
already does for libraries. A `worlds/<id>/` without an install record (installed by an older
installer or by hand) is recorded on the first content operation as `{source: "local"}` with
its manifest version and no tag; it gets no updates until the user installs the same id from
a source, which is a source change (see [Labels](#labels)).

**System-managed content is read-only (decided).** Content installed by the Nix modules or
the packaged world directories is listed with `managed: "system"`: no update, rollback, remove
or pin from the Director or CLI, which point to the system configuration instead. The only
way past it is an explicit override: installing a user copy of a system-managed id requires
`override: true` ("Install my own copy" in the Director, `--override` in the CLI, never
implied by `--yes`); the user copy takes precedence until it is removed.

## Fetch helper

`hyprune-fetch` (core repository) is the only component that opens network connections for
content. Core and the CLI launch it per job, without a shell, with a JSON request on stdin;
it writes progress as JSON lines on stdout.

- **Requests:** an index or record URL with a byte cap, an archive URL with its expected
  `bytes` and sha256, or a GitHub repository's release list.
- **Transport:** HTTPS only, the system trust store, at most 5 redirects and only to HTTPS;
  30 s connect and idle timeouts; resumable downloads with `Range`; never sends cookies or
  credentials (an optional GitHub token for the API is read from `GITHUB_TOKEN` in the CLI's
  environment only, never stored or passed by core).
- **Limits:** stops at the expected `bytes` (archives), 16 MiB (indexes), 1 MiB (records),
  512 KiB (thumbnails), 4 MiB per GitHub API page; at most 2 concurrent downloads.
- **Output:** writes only `<name>.part` files inside the cache directory it is handed, renames
  them after its own hash check, and reports `{bytes, total}` at most 4 times a second.
- **Isolation:** no session socket, token or launch FD is inherited. Once the RFC-0007 sandbox
  exists, it runs in it with network access and a single writable cache directory.

Core re-hashes every file the helper produces before use; the helper is a transport, never a
source of trust. Offline installs skip it.

### Offline install

`hyprune world add ./io.github.ada.tidepool-1.2.0.tar.zst` installs a downloaded archive. The
hash is computed locally and checked against `--sha256` when given, else against any cached
index entry with the same id and version (whose tag is then recorded), else recorded as `{source: "file"}` with the
computed hash (the CLI shows it and asks). Everything after the download stage is identical.

## CLI

The SDK's `hyprune` CLI. With a running session it uses IPC (`content.control`); without one
it runs the same pipeline itself, under the same lock, and core picks the result up through
its directory watch.

### Sources of a single install

| Argument | Resolves to |
| --- | --- |
| `io.github.ada.tidepool[@v1.2.0]` | An id in the enabled sources (official, community registry, then custom in their listed order); several matches ask which, unless `--from SOURCE`. |
| `github:ada/tidepool-world[@v1.2.0]` | The repository's single package at that tag, else its newest non-pre-release tag. |
| `github:hyprune/worlds/lumen-reach[@lumen-reach-v0.10.2]` | A package in a multi-package repository, tags `lumen-reach-v<version>`. |
| `https://…/x.release.json` | A release record (supplies URL and hash). |
| `https://…/x.tar.zst --sha256 HEX` | A direct archive. |
| `./x.tar.zst [--sha256 HEX]` | A local archive (offline). |

After `@` comes a tag; a bare SemVer (`@1.2.0`) is accepted and mapped to the tag by the
[tag convention](#repository-and-tags). A `github:` or URL argument installs once without
adding a source; `--track` also adds it as
a custom source (with `--label`) so it gets updates.

### Commands

```text
hyprune world add <source>[@tag] [--from SOURCE] [--sha256 HEX] [--pin] [--override] [--track --label TEXT] [--yes]
hyprune world list [--json] [--updates]          # id, current tag, previous tag, pin, newer tag
hyprune world info <id>
hyprune world update [<id>… | --all] [--dry-run] [--yes]
hyprune world rollback <id>                      # swap with the previous install and pin it
hyprune world pin <id>                           # stay on the current tag
hyprune world unpin <id>
hyprune world remove <id> [--force]
hyprune world pack <dir> --release [--output DIR]

hyprune library add|list|info|update|rollback|pin|unpin|remove   (as above; `library install` stays as an alias of add;
                                                                  remove also takes <id>@<version> for one version)
hyprune library pack <dir> --release [--output DIR]

hyprune source add <url | github:owner/repo> [--label TEXT] [--id SLUG] [--sha256 HEX]
hyprune source list [--json]
hyprune source refresh [ID…]
hyprune source label <id> <text>
hyprune source enable|disable <id>
hyprune source remove <id>

hyprune browse [TEXT] [--type world|library] [--source ID] [--json]
hyprune registry entry <dir | github:owner/repo@tag>       # print the community registry entry for a release
hyprune registry check <entry.json>                         # run the registry's checks locally
hyprune content lock [--output hyprune-content.lock.json]  # pins for the Nix modules
```

`--yes` accepts the plan except for source changes and `--override`. Exit codes: 0 success, 1
failure, 2 usage, 3 refused by a rule (the rule is printed).

## Director: Browse

The shell adds a Director **Browse** tab with three views. All text from indexes is shown as
plain text; images are only verified cached thumbnails; nothing in an entry is a link the
shell opens without the user pressing "Open repository".

1. **Browse.** A grid of cards: thumbnail, name, creator, type, source label, declared
   licence, download size, and a badge for installed, update available or "needs a newer
   Hyprune". Filters: source (Official, Community registry, each custom source), type, tag;
   search over name, summary and tags; sort by name or last published. Official entries
   are listed first by default.
2. **Entry page.** Thumbnails, summary and description, creator and repository, source label,
   versions by tag (with format and status), the declared licence with its source-kind wording,
   requirements, and Install (or Update, Roll back, Pin, Remove for an installed id). Install
   opens the confirmation with the full plan.
3. **Installed.** Every install (worlds and libraries): current tag, previous tag, source
   label (or `system`, `local`, `file`), pinned, newer tag available, pending, `removed from
   source`; actions Update, Update all, "Roll back to <previous tag>", Pin/Unpin, Remove, Load
   (worlds), and the provenance panel. System-managed rows show only Load, the provenance
   panel and "Install my own copy".
4. **Sources.** As [above](#adding-listing-refreshing-and-removing).

Jobs show progress in the Director and as a HUD notice while it is closed; a finished install
offers "Load" for worlds and "Open in Objects" for libraries.

## Contract plan

### Schemas

New schema documents, versioned independently of world formats and IPC (first interfaces
are `0.1`, RFC-0001):

| Schema | Describes | Phase |
| --- | --- | --- |
| `registry/v0.1/release-record.schema.json` | The release record. | P1 |
| `registry/v0.1/index.schema.json` | An index document; `entry` is a `$defs` member, used for registry entry files. | P1 (P2 for the hyprune indexes) |
| `registry/v0.1/sources.schema.json` | `sources.json`. | P1 |
| `registry/v0.1/content-lock.schema.json` | `hyprune content lock` output for the Nix modules. | P3 |

`content.json` is core's private state, documented but not a contract. Each schema ships with
positive and negative fixtures; the shared extractor fixtures (traversal, links, devices,
oversize, zstd window, executable signatures) are run by core, the SDK, the meta installer
and the registry CI.

### IPC

Version numbers are assigned when each phase lands. A new grant, **`content.control`**, covers
installing, updating, removing, pinning and source changes; reads need `state.read`. The
trusted shell and the CLI may request it; worlds and extensions can't.

| Method | Params → result | Grant | Phase |
| --- | --- | --- | --- |
| `content.install` | `{source, tag?, sha256?, from?, override?, pin?, autoConfirm?}` → `{jobId}`; `source` is one of `{entry: {sourceId, id}}`, `{github: "owner/repo[/name]"}`, `{url}`, `{file}`; without `tag`, the newest installable tag | content.control | P1 |
| `content.confirm` | `{jobId, accept}` → `{revision}` | content.control | P1 |
| `content.cancel` | `{jobId}` → `{revision}` | content.control | P1 |
| `content.pin` | `{id, pinned}`: stay on (or release) the current tag → `{revision}` | content.control | P1 |
| `content.remove` | `{id, force?}`; libraries also `{id, version}` for one referenced version → `{revision}` | content.control | P1 |
| `sources.list` | `{}` → `{sources}` | state.read | P2 |
| `sources.add` | `{url}` or `{github}`, `{label?, id?, sha256?}` → `{jobId}` | content.control | P2 |
| `sources.set` | `{id, label?, enabled?}` → `{revision}` | content.control | P2 |
| `sources.remove` | `{id}` → `{revision}` | content.control | P2 |
| `sources.refresh` | `{ids?}` → `{jobId}` | content.control | P2 |
| `registry.list` | `{query?, type?, sourceIds?, tags?, cursor?, limit?}` (limit at most 100) → `{entries, cursor}` from the cached indexes, no network | state.read | P2 |
| `registry.entry` | `{sourceId, id}` → `{entry, installed}` | state.read | P2 |
| `content.update` | `{id}` or `{all: true}` → `{jobId}` (unpinned installs with a newer tag) | content.control | P3 |
| `content.rollback` | `{id}` → `{revision}`: swaps current and previous and pins; `-32004` when there is no previous install; for the loaded world it sets `pending` | content.control | P3 |
| `content.commit` | `{id}` → `{revision}`: applies a `pending` swap of the loaded world by unloading it, committing and loading it again | content.control | P3 |

`autoConfirm` is honoured only for plans without a source change or override.
`libraries.install`, `libraries.remove` (0.22) remain and map to `content.install {file}` and
`content.remove`.

**A job** as published in state (`content.jobs`, at most 16, updated at most 4 times a second):

```json
{
  "jobId": "j-41f0",
  "kind": "install",
  "sourceId": "community",
  "stage": "confirm",
  "plan": {
    "packages": [
      {"id": "io.github.ada.tidepool", "type": "world", "tag": "v1.2.0", "version": "1.2.0",
       "replaces": "v1.1.0", "sourceLabel": "Community registry", "creator": "ada",
       "repo": "https://github.com/ada/tidepool-world",
       "license": "CC-BY-SA-4.0", "licenceNote": "declared",
       "bytes": 48213004, "expandedBytes": 96424960,
       "sha256": "5d2f0c6e3b9a41d8e7c2b0f4a6d9e1c3b5a7f9e2d4c6b8a0f1e3d5c7b9a2e4f6",
       "action": "update"},
      {"id": "com.hyprune.street", "type": "library", "tag": "v1.2.0", "version": "1.2.0",
       "sourceLabel": "Official", "license": "CC-BY-4.0", "licenceNote": "reviewed",
       "bytes": 3108221, "expandedBytes": 7340032, "action": "already-installed"}
    ],
    "sourceChange": null,
    "diskFreeAfter": 182536110080
  },
  "progress": {"bytes": 0, "totalBytes": 48213004, "files": 0, "totalFiles": 212},
  "error": null
}
```

`stage` runs `resolving`, `confirm`, `downloading`, `verifying`, `extracting`, `validating`,
`committing`, then `done`, `pending` (the loaded world: committed on unload or
`content.commit`), `failed` or `cancelled`; finished jobs stay listed for 60 s. `action` is
`install`, `update` (with `replaces`, the tag that becomes the previous install),
`downgrade` (an explicit older tag) or `already-installed`.
`licenceNote` is `reviewed` (official), `declared` (community registry) or `unchecked`
(custom). `error` is `{rule, message}` with `rule` one of `fetch.failed`, `hash.mismatch`,
`archive.unsafe`, `archive.limit`, `data.executable`, `format.unsupported`,
`package.invalid`, `content.conflict`, `requirement.missing`, `disk.full`, `managed.system`,
`source.invalid`, `signature.invalid` (P4).

State gains `content {revision, installs, jobs, updates, sources}`: `installs` are records
`{id, type, sourceId, sourceLabel, tag, version, previous: {tag, version} | null, pinned,
pending, managed, removedFromSource, newerTag}`, `updates` the count for a badge, `sources` the list with `{id, kind, label,
enabled, lastRefresh, entries, error}`. Older peers receive none of this.

Errors: `-32004` unknown id, job or source; `-32005` system-managed, active world, required
library, or a source that can't be removed; `-32007` a rule (as `error.rule`, with
`error.data {rule}`); `-32008` too many jobs or sources. Notices: `content.installed`,
`content.updated`, `content.rolled-back`, `content.pending`, `content.failed`, `content.updates-available`,
`content.removed-from-source`, `source.added`, `source.failed`.

### Meta repository and Nix modules

- **Official pins stay in the meta repository.** `worlds/releases.json` and
  `libraries/releases.json` remain the source of truth for what kits and the Nix modules ship
  by default; the official index is generated from them, never the other way round, taking
  each version's tag from its pinned release URL (`…/releases/download/<tag>/…`). An official
  release is "published" when its pin lands.
- **The installer** (`install.sh`) keeps installing kit worlds from the pins into
  `worlds/<id>/` and records them in `content.json` as `{source: "official"}`, so they update
  through the normal pipeline afterwards. It shares the extractor fixtures.
- **Declarative installs (P3).** The Nix modules gain an option that takes a content lock
  written by `hyprune content lock`:

  ```nix
  programs.hyprune.content = {
    lock = ./hyprune-content.lock.json;   # id, type, tag, version, url, sha256, nixHash, source label
  };
  ```

  Each entry becomes a fixed-output `fetchurl` (`nixHash` is the SRI form of the same sha256:
  `sha256-` and the base64 of the digest), unpacked by a derivation that applies the
  extractor and data-only rules and runs the package validation, and is added to the packaged
  world directories or `HYPRUNE_LIBRARY_DIR`. These installs are `managed: "system"`.
  Custom sources declared in the module are written to a read-only file listed in
  `HYPRUNE_SOURCES_FILES`. Derivations set `meta.license` from the SPDX id when nixpkgs knows
  it (open question 6).

## Trust and safety

| Threat | Mitigation |
| --- | --- |
| Replaced or tampered asset | Every version pinned by sha256 in the index or by the user; core re-hashes before reading; the registry re-verifies weekly. |
| Malicious archive (traversal, links, devices, bombs) | The shared safe extractor; expanded-size, file-count, file-size and zstd window limits enforced while streaming; staging plus rename. |
| Code in a package | The data-only allowlist, executable bit and signature checks, the SVG subset; packages are never executed; extensions stay with the RFC-0007 host and its approvals. |
| Parser bugs in core | The existing validation order and budgets (RFC-0004) apply to installed content as to any package; validation runs off the compositor thread. |
| Listing someone else's work | Write access to `repo` required for community entries; `com.hyprune.*` reserved. |
| Index rollback or freeze | Increasing `serial`; clients keep the last accepted index; refresh age is shown. |
| Look-alike sources | Labels come from the source kind and the user, never from content; same-id installs from another source need explicit confirmation. |
| Untrusted CI input | `pull_request` only, no secrets, network-isolated checking, timeouts. |
| Core attack surface | No network in core; the fetch helper has no session access and is re-checked. |
| Authorship | Not proven by hashes. Optional signatures in P4. |

## Phasing

| Phase | Scope | Contract |
| --- | --- | --- |
| **P1** | Release convention, release record, `pack --release`, the repository template; the fetch helper; `hyprune world add` / `library add` from `github:`, record URLs, archive URLs with a hash and local files; installs by tag into `worlds/<id>/` with the previous install kept in `.previous/`; `content.json`; pin and remove; the shared extractor fixtures. | Release record and sources schemas 0.1; IPC `content.install`, `confirm`, `cancel`, `pin`, `remove` and `content` state. |
| **P2** | `hyprune/registry` with entries, CI checks, publication, re-verification and the report process; official index sync from the meta repository; the index schema for third-party indexes; custom sources (`hyprune source …`); Director Browse, entry page, Installed (install, remove) and Sources. | Index schema 0.1; IPC `sources.*`, `registry.*`. |
| **P3** | Update checks (newer tags), update, one-step rollback and pending swaps of the loaded world in the CLI and the Director; notices; `hyprune content lock` and the Nix module option. | IPC `content.update`, `content.rollback`, `content.commit`; content lock schema. |
| **P4** | Optional signatures on release records, verified on install and shown in provenance. | Record and index fields for signatures; `signature.invalid`. |

## Open questions

1. **Signatures.** Sigstore through the hosting platform's build attestations (keyless, bound
   to the repository and workflow that built the release) or minisign keys declared in the
   entry? How are keys rotated and revoked, and does a missing signature downgrade the label?
2. **Automatic merges.** Merge new versions of existing community entries automatically when
   the author maintains the repository and every check passes (proposed), or keep a human
   click for every pull request?
3. **Index hosting.** GitHub Pages of the registry repository (proposed), release assets of
   the registry, or a path under hyprune.com?
4. **Entry granularity.** One file per package with all versions (proposed) or one file per
   version, which makes version pull requests conflict-free?
5. **Automatic updates.** Never (proposed for now), or opt-in automatic minor and patch
   updates for official content?
6. **Licences in Nix.** How to map declared SPDX expressions that nixpkgs doesn't know, and
   whether non-free declared licences need `allowUnfree`.
7. **Executable extensions in indexes.** A later `extension` type with RFC-0007 approvals, or
   a separate index?
8. **Duplicate content.** Should the registry flag an archive whose files match another
   entry's under a different id (re-uploads of someone else's work), or leave that to reports?
9. **Popularity.** No download counts or ratings (proposed: nothing is reported back); is a
   privacy-preserving signal wanted later?

## Amendment: phase 1 in the SDK, without new IPC

Phase 1 implements the release convention, the three schemas, the community registry and
the client in the SDK's `hyprune` CLI, with a Director **Library** tab on top of the CLI. It
takes parts of P1, P2 and P3 together so that the third-party path works end to end: a
creator publishes a release, lists it by pull request, and a user browses, installs, updates,
rolls back, pins and removes it. It follows this RFC except where noted here.

**Schemas.** `registry/v0.1/index.schema.json` (with `$defs.entry` for entry files),
`release-record.schema.json` and `sources.schema.json` in the schema package, with
`validateRegistry(kind, document)` for the checks a schema can't express: unique ids, unique
versions newest first in SemVer order, the tag naming the version, SPDX licences and no build
metadata. The content lock schema stays in P3.

**No new IPC; the CLI runs the pipeline.** Core gains no `content.*`, `sources.*` or
`registry.*` methods in this phase. The CLI runs every job itself, as this RFC's "without a
session" path, under `$XDG_STATE_HOME/hyprune/content.lock` (taken with an exclusive create
and the owner's pid; a lock whose process is gone is taken over), because core doesn't take
the lock yet. With a running session and the `objects.control` grant, a verified library is
handed to core's `libraries.install {archive, sha256}` (IPC 0.22) after the CLI's own
extraction and data-only checks; without the grant or a session the CLI commits it into the
user library root, and core's directory watch picks it up. Worlds are committed by the CLI
into the world root; core loads `worlds/<id>/` by id, and ids can't start with `.`, so
`.previous/` and staging directories are never loaded. Core's world root now honours
`$XDG_DATA_HOME` like the CLI and the installers. The Director's Library tab runs the CLI
(`$HYPRUNE_CLI`, else `hyprune` on `PATH`) and reads its JSON output; it holds no state of its
own.

**The fetch helper is part of the CLI.** Downloads run in the CLI process with this RFC's
transport rules and limits (HTTPS only, at most 5 redirects, 30 s timeouts, byte caps per
request kind, resumable `.part` files, `GITHUB_TOKEN` sent only to the GitHub API base URL),
not as a separate `hyprune-fetch` program. Core still never opens a network connection.

**CLI names.** As in [Commands](#commands), plus shortcuts that take the type from the
resolved entry: `hyprune install|update|rollback|pin|unpin|remove`, `hyprune installed` (also
`hyprune content list`) and `hyprune sources` as an alias of `hyprune source`. Jobs take
`--plan` (stop after the plan), `--json` (JSON lines: `stage`, `plan`, `progress`, `done`,
`error`) and `--accept-source-change`, which the Director passes only after its own explicit
confirmation. Without `--yes` and without a terminal a job stops after the plan with exit 3
(`confirm.required`). `library install` keeps its IPC 0.22 forms (a local archive, or
`id@version --releases`) without a confirmation, and `library list` shows core's list while a
session runs.

**Update, rollback and pin are in phase 1** with the semantics of
[Update, rollback, pin and remove](#update-rollback-pin-and-remove). **Pending swaps of the
loaded world are not:** updating, rolling back or removing the world that a running session
has loaded is refused (rule `world.active`, exit 3) with "load another world first". World
commits are journalled in `content.json`; a world rollback (two renames) is not.

**Sources.** `source add` for a direct archive URL downloads the pinned archive once to learn
its id and version (the cached copy is reused by the install). A `github:` or URL install
without `--track` records that spec as its source and gets no updates. A refresh caches at
most 64 card thumbnails. Removing a superseded library version checks installed worlds, not
user placements. Offline installs extract and validate the archive before the plan, because
only the archive names the package. A world directory that is a symbolic link into the world
root counts as system-managed; `--override` replaces only the link.

**Installers and modules.** `install.sh` and `try` preinstall every published pin of the meta
repository's `libraries/releases.json` (now keyed by `id@version`, as the 0.9 library release
record schema requires) and record kit worlds and libraries in `content.json` as
`{source: "official"}`. The NixOS and Home Manager modules turn each pin into a fixed-output
package and add it to `HYPRUNE_LIBRARY_DIR` (`programs.hyprune.libraries.pinned`, default on,
and `libraries.extra`), so those libraries are system-managed and read-only. `try` installs
the CLI when Node.js is present.

### The registry in phase 1

- **Write access.** GitHub shows collaborator permissions only to tokens with push access to
  the repository, which the registry's read-only token never has on a creator's repository.
  Check 2 therefore accepts the pull request author when the permission lookup answers write,
  maintain or admin, **or** the author owns the repository, **or** the author created the
  GitHub release of every new version (creating a release needs write access). Anyone else is
  refused.
- **Trusted checks.** `check.yml` runs on `pull_request` and runs the tools, schemas and the
  pinned SDK from the base revision; files from the pull request are only read as data. A pull
  request that changes `tools/`, `schema/` or `.github/` together with an entry, a removal or a
  bot change is refused; one that changes only those is a maintenance change for code owners.
  The archive checks run in a network namespace without the token, after a separate download
  step.
- **World checks.** CI validates worlds with the SDK's validator and runs `hyprune-world-check`
  only when it is installed; without it CI prints a warning.
- **Bot changes as pull requests.** The weekly re-verification and the official sync open or
  update a pull request on a fixed branch (`reverify/weekly`, `sync-official/pins`) and start
  the checks on it, instead of pushing to `main`. The dates a version was first found
  unavailable live in `state/reverify.json`; community entries unavailable for 30 days get an
  `unavailable` tombstone, official ones are only marked.
- **Official entries without records.** No official release carries a release record yet, so
  every official version is imported from the pins without `record` (the exception in
  [Official entries](#official-entries)); the record becomes required for official releases
  made after the worlds release tooling writes it.
- **Serial.** Each publication's `serial` is the number of commits on the registry's `main`.

### Repository naming

A recommended convention, never a requirement: name a package repository
`<owner>/hyprune-<kind>-<name>`, where `<name>` is a lowercase slug, and give it the GitHub
topics `hyprune` and `hyprune-<kind>` for discovery.

| Kind | For | Example |
| --- | --- | --- |
| `world` | A world package | `hyprune-world-tidepool` |
| `objects` | An object, character or machine library | `hyprune-objects-garden-kit` |
| `companion` | A library whose main item is a companion character | `hyprune-companion-drunk-ash` |
| `companion` (themed pack) | A library of several companions on one theme | `hyprune-companion-neon-pack` |
| `extension` | An RFC-0007 process extension | `hyprune-extension-weather` |
| `shell` | An alternative shell | `hyprune-shell-minimal` |

A themed library of several companions (with its own motion pack of clips, RFC-0010's shared
clip library, if it has any) is `<owner>/hyprune-companion-<theme>-pack`. One repository may
hold several packages, each released with tags `<name>-v<version>`: the official optional
companions library `com.hyprune.companions` is released from `hyprune/worlds` with tags
`hyprune-companions-v<version>`. Repositories with several packages (tags `<name>-v<version>`, like `hyprune/worlds`) are
exempt. The community registry's checks print a warning for other names and never fail on
them; custom sources are never checked. `hyprune registry check` prints the same warning.
