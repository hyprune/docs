# Foundation validation — 2026-10-07

Local environment: Node v26.10.0, npm 12.2.0, system Chromium. CI targets Node 24.14.0. Exact direct dependency versions and the full dependency lockfile are committed.

- `npm ci && npm run build`: passes; 16 static pages including the default 404, Pagefind search index, sitemap and custom domain file.
- `npm run check:links`: passes; local navigation, anchors and asset references across all pages, CNAME, and SHA-256 integrity of all five mirrored schema files.
- `npm run test:browser`: passes; dark landing, light architecture, dark IPC RFC, theme selection, two rendered SVG diagrams, actual Pagefind results for “lightmaps,” and no page-level horizontal overflow at 390px for landing/architecture/IPC. No browser page errors or failed HTTP requests.
- `npm audit`: zero reported vulnerabilities after a narrowly pinned postcss-selector-parser override. Review and remove that override when the upstream dependency no longer needs it.
- `hyprune/schema`: `npm ci && npm test` passes all 69 tests, including every IPC method/result/event fixture and meaningful invalid manifests, paths, grants, deltas and lease states.

Screenshots were opened and visually inspected: `artifacts/landing-dark.png`, `artifacts/architecture-light.png`, and `artifacts/search.png`. Additional captures: `artifacts/ipc-dark.png`, `artifacts/ipc-mobile.png`. Artifacts are local and gitignored; rerun the browser command to reproduce them.

Starlight emits benign build warnings about an absent optional i18n collection and its built-in 404 content entry. The generated default 404 exists. The link checker excludes canonical metadata (the default 404's canonical route is not a navigation destination).

This validation covers documents, schemas, tooling and the static site. It does not establish runtime, sandbox, glTF package, compositor or DNS correctness. The schema CLI's limits are documented in the schema README. GitHub Actions configuration is committed but has not run remotely; no push, Pages deployment, DNS edit or external message was performed.
