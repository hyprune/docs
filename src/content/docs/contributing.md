---
title: "Contributing"
description: "Choose a boundary, bring evidence, and keep the desktop recoverable."
---


Hyprune is an early preview, building in the open, and every repository is public on [GitHub](https://github.com/hyprune). Contributions can be code, original world art, interaction design, documentation, conformance cases or careful RFC review. Open issues and pull requests in the repository that owns the change: [hyprune](https://github.com/hyprune/hyprune) (install and kits), [core](https://github.com/hyprune/core), [shell](https://github.com/hyprune/shell), [worlds](https://github.com/hyprune/worlds), [sdk](https://github.com/hyprune/sdk), [schema](https://github.com/hyprune/schema) or [docs](https://github.com/hyprune/docs).

## Start with a small concrete change

Read [Concepts](/concepts/) and [RFC-0001](/rfcs/0001-umbrella/) to choose a repository. Explain the user-visible problem, link the affected RFC, and keep implementation within that repository's boundary. For contract changes, propose the RFC and schema/fixtures first; link their exact commits from consumer PRs.

For docs: `npm ci && npm run build`, then `npm run check:links`. For schemas: `npm ci && npm test`; run the validator against new examples. World and extension authors can work without a checkout: `npm i -g @hyprune/sdk` provides `hyprune world validate`, `hyprune world pack`, `hyprune ext new` and the `hyprune-mock` daemon, and `@hyprune/schema` carries the schemas and validator. Runtime PRs should include the exact Hyprland build and evidence for the relevant failure cases, using a nested session before live DRM testing. Do not claim tests you could not run.

## Machine-specific settings

Repositories never contain machine-specific values such as review directories or build hosts. Developer tools read them from the environment, or from an optional `~/.config/hyprune/dev.env` (one `KEY=VALUE` per line); the environment wins. The keys are `HYPRUNE_GALLERY_DIR` and `HYPRUNE_VIDEO_DIR` (where review stills and videos are published; unset, a tool warns and names its fallback), `HYPRUNE_BUILD_HOST` (remote Nix and test runs) and `HYPRUNE_BAKE_HOST` (Blender bakes for worlds; `local` on that host itself). Each repository's README or CONTRIBUTING lists the ones it uses.

## Rights and review

Submit only work you have the right to license. Code uses MIT. Official world content uses CC-BY-4.0, with CC0/CC-BY dependencies documented per file or directory. Include source, author, license and modifications. No ripped game assets or derivatives—even as temporary fixtures or screenshots. Original geometric test scenes are preferred.

Describe what changed, why, and how it was validated. Maintainers may ask for a smaller contract or more failure evidence before adding new API surface. There is no CLA at this stage; contributions use the repository's stated license. Do not add someone as co-author without their contribution/consent.

Follow the organization [Code of Conduct](https://github.com/hyprune/.github/blob/main/CODE_OF_CONDUCT.md) and [contribution guide](https://github.com/hyprune/.github/blob/main/CONTRIBUTING.md). See [governance](/governance/) for decisions and maintainership.
