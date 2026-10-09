---
title: "Governance"
description: "Lightweight stewardship with a public decision trail."
---


The founding owner is the interim steward. Repository maintainers review work in their area; responsibilities should be listed as maintainers join. This is a practical starting arrangement, not a claim of an existing foundation or elected council.

## Decisions

Ordinary fixes use pull request review. Changes to repository boundaries, public formats/protocols, capability policy, licensing or irreversible data migration require an RFC. RFCs progress from proposed -> accepted -> implemented, or superseded/rejected. Accepted means a design decision; implemented requires linked evidence. Current foundation RFCs remain proposed until the owner reviews them.

Allow at least seven calendar days for substantive public RFC feedback unless a documented security fix needs faster handling. The steward records the outcome, rationale and dissent in the RFC/PR. Seek one relevant maintainer review in addition to the steward once available; while there is only one maintainer, record the exception. For unresolved disagreement, prefer a reversible experiment behind an explicit unstable boundary.

## Maintainers and releases

Consistent contributions and constructive review can lead to a scoped maintainer invitation from the steward. Maintainers can step down without abandoning their work; document ownership transfer. Release owners publish compatibility notes, test evidence and license/provenance checks. No stable API or delivery date is implied by the roadmap.

## Community and security

Use the Contributor Covenant and organization security policy. The conduct contact is **conduct@hyprune.com**, an explicit placeholder to be provisioned and tested by the owner; it is not yet monitored. Do not send sensitive reports to it until activated or post them in public issues. No personal address is published. Enable GitHub private vulnerability reporting on core and propagate a tested reporting route. The initial repository documents these setup steps rather than inventing an unmonitored mailbox.

## Decisions awaiting owner review

Ratify the nine RFCs (0001–0009, many with implemented amendments) and the proposed HUD-style amendment, moving each to accepted or implemented with linked evidence; confirm repository license choices; activate conduct@hyprune.com and GitHub private vulnerability reporting; and decide when to open the component repositories. The Hyprland target (0.56.2) and the hyprune.com deployment are settled. These are review items, not blockers for development.
