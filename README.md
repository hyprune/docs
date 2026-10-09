# Hyprune docs

An Astro Starlight site for **hyprune.com**: pitch, concepts, architecture diagrams, eight foundation RFCs plus the proposed offload RFC, prototype lessons, contributing, governance and M0–M3 roadmap and proposed core M4 offload gates. Original SVG illustrations and diagrams; no prototype assets. Original prose/code/art are MIT.

## Local development and verification

Use Node >=22.12 (CI/.nvmrc pin 24.14.0) and npm. Direct dependencies use exact versions and the lockfile pins the graph.

```sh
npm ci
npm run build
npm run check:links
npm run preview -- --host 127.0.0.1
```

The production build includes Pagefind search and native Starlight light/dark/system theme selection. Search is verified against the built site, not the dev server. `postcss-selector-parser` is overridden to 7.1.6 to address its quadratic parsing advisory in the upstream Expressive Code build chain; retain the override until upstream no longer needs it.

With a browser available, `npm run test:browser` serves `dist` locally, exercises themes, search, diagrams and mobile width, and writes PNGs to ignored `artifacts/`. Set `CHROMIUM_PATH` if your Chromium is not `/usr/bin/chromium`, or install Playwright Chromium with `npx playwright install chromium` and set `CHROMIUM_PATH=playwright`. No screenshots contain prototype assets.

## GitHub Pages

The workflow builds and checks pull requests. Only a push to `main` or manual dispatch on `main` deploys the build artifact, using GitHub Pages' OIDC deployment action. No deploy branch or personal token is needed. The deploy job uses the `github-pages` environment; configure review protection there if desired.

Owner steps after reviewing and pushing:

1. In **hyprune/docs → Settings → Pages**, choose **GitHub Actions** as the build source.
2. Verify domain ownership for the `hyprune` organization using GitHub's generated DNS TXT challenge. Do not guess its value.
3. Set the Pages custom domain to **hyprune.com**. `public/CNAME` contains that name, but a custom Actions deployment still requires the Pages setting.
4. Add the DNS records below, remove conflicting apex records, wait for verification/certificate provisioning, then enable **Enforce HTTPS**.
5. Confirm both apex and www resolve to the intended site. The canonical site is the apex; Pages should redirect www to it.

| Type | Host | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | hyprune.github.io |

Keep DNS unproxied during verification. Do not add a wildcard record. These values follow [GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site); recheck those instructions if GitHub changes its hosting setup. `astro.config.mjs` uses `site: https://hyprune.com` at `/`, not `/docs/`, because this is a custom-domain site.

Nothing has been pushed or deployed by this foundation work.

## Schema mirrors

The Keymap page is generated from core's canonical `config/input.default.json`.
With the sibling core checkout present, run `python3 scripts/generate-keymap.py`
after changing defaults, then `npm run check:keymap` before committing. The page
records the input file's SHA-256 and preserves HJKL / WASD / arrows ordering.

`public/schema/` is a checked-in, byte-for-byte mirror of every published contract in `hyprune/schema` (all `v0*` version directories, `extensions/`, `examples/` and `CHANGELOG.md`). `public/schema/source.json` records the source commit, each file's SHA-256 and its first-publication date. Raw files keep the URLs in their `$id` (for example `/schema/v0.15/ipc.schema.json`).

After committing schema changes, run `npm run sync:schema` (default source `../schema`), review the diff and commit the mirror. The script rejects a dirty contract tree. `npm run check:schema` (also run by `check:links`) verifies the hashes and, when the sibling schema checkout exists, that the mirror equals the recorded commit and that schema `HEAD` has not moved on. Never edit mirror files directly.

The [schema reference](https://hyprune.com/reference/schema/) is generated from the mirror at build time (`src/lib/schema/`, `src/pages/reference/schema/`): one page per contract version with readable field tables, a structural diff against the previous version, the changelog paragraphs and RFC headings that mention it, examples, and a collapsible highlighted raw view with download. New versions appear automatically after a sync.

## Foundation review

All RFCs remain **proposed** until owner review. Ratify architecture/licenses and coordinate the exact Hyprland target with core. Community setup remains: provision **conduct@hyprune.com** (placeholder, not yet monitored) and enable/test GitHub private vulnerability reporting. Do not publish a personal address.

[Starlight setup reference](https://starlight.astro.build/manual-setup/) · [Astro Pages guide](https://docs.astro.build/en/guides/deploy/github/)
