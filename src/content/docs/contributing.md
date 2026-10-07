---
title: "Contributing"
description: "Choose a boundary, bring evidence, and keep the desktop recoverable."
---


Hyprune is early and building in the open. Contributions can be code, original world art, interaction design, documentation, conformance cases or careful RFC review.

## Start with a small concrete change

Read [Concepts](/concepts/) and [RFC-0001](/rfcs/0001-umbrella/) to choose a repository. Explain the user-visible problem, link the affected RFC, and keep implementation within that repository's boundary. For contract changes, propose the RFC and schema/fixtures first; link their exact commits from consumer PRs.

For docs: `npm ci && npm run build`, then `npm run check:links`. For schemas: `npm ci && npm test`; run the validator against new examples. Runtime PRs should include the exact Hyprland build and evidence for the relevant failure cases, using a nested session before live DRM testing. Do not claim tests you could not run.

## Rights and review

Submit only work you have the right to license. Code uses MIT. Official world content uses CC-BY-4.0, with CC0/CC-BY dependencies documented per file or directory. Include source, author, license and modifications. No ripped game assets or derivatives—even as temporary fixtures or screenshots. Original geometric test scenes are preferred.

Describe what changed, why, and how it was validated. Maintainers may ask for a smaller contract or more failure evidence before adding new API surface. There is no CLA at this stage; contributions use the repository's stated license. Do not add someone as co-author without their contribution/consent.

Follow the organization [Code of Conduct](https://github.com/hyprune/.github/blob/main/CODE_OF_CONDUCT.md) and [contribution guide](https://github.com/hyprune/.github/blob/main/CONTRIBUTING.md). See [governance](/governance/) for decisions and maintainership.
