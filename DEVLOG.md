# Kontar Edition — development log

Read this file before starting work. Update it after every material change. Keep entries concise and factual.

Last updated: 2026-09-30

## Goal

Adapt Azgaar's Fantasy Map Generator for the world of Kontar: Russian-first UI, safe world-data operations, and later local Codex/MCP integration.

## Repository

- Path: `D:\Programming\AI\Fantasy-Map-Generator`
- Upstream: `https://github.com/Azgaar/Fantasy-Map-Generator.git`
- Clean upstream branch: `master`, tracks `upstream/master`
- Working branch: `codex/kontar-edition`
- Personal fork / `origin`: not configured yet
- Base upstream commit: `7940ee81`

## Current state

- Centralized Russian localization is complete in commit `89da18cf`.
- Russian is the default; Russian/English can be switched in the Options panel.
- All translations live in `src/data/locales/ru.json`; runtime logic is in `src/services/localization.ts`.
- Catalog maintenance: `scripts/i18n-extract.mjs`, `scripts/i18n-generate-ru.mjs`.
- Translation architecture: `docs/architecture/localization.md`.
- Coverage: 4418 exact messages, 3 patterns, 40 intentionally ignored names; static missing count is 0.
- Map labels, user notes, editable content, and speech voices are intentionally not translated.
- First editable Kontar draft: `worlds/kontar/kontar-first-rift-draft.map`.
- Vector reference: `worlds/kontar/reference/kontar-first-rift.svg`.
- Reproducible generator: `scripts/kontar-generate-map.mjs`.
- One-click launcher: `scripts/kontar-launch.cmd` starts the app, opens the current Kontar map on the first non-primary monitor, saves browser downloads to the real user Downloads folder, and stops its server when the browser closes.
- Launcher log: `%LOCALAPPDATA%\Kontar\launcher.log`.
- Heightmap edit mode is stored independently of its translated label, so Russian `Risk`, `Keep`, and `Erase` modes finalize correctly.
- Generated map content localization is centralized in `src/services/russian-map-content.ts`: proper names and name-base corpora are transliterated to Cyrillic on map load/generation.
- Domain terminology is centralized in `ru.json` under `dataMessages` and `dataPatterns`; internal English IDs remain unchanged for compatibility.
- The local MCP bridge has not been implemented yet.

## Verified

- Node.js `24.11.1`
- `npm run i18n:check` — passed, 0 missing strings
- `npm run build` — passed
- `npm test -- --run` — 106 files, 1198 tests passed
- Manual browser QA — main menu translated; `ru → en → ru` switching works
- Kontar draft round-trip — generated, saved, and loaded back without page or integrity errors
- Round-trip counts — 2464 cells, 17 states, 14 cultures, 306 burgs, 77 rivers, 16 custom labels
- Launcher self-test — detected `DISPLAY2`, loaded `kontar-first-rift-draft.map`, saved a `.map` through the browser, and shut down cleanly
- Heightmap localization regression — 4 focused tests passed; Russian catalog check and production build passed
- Russian data-editor browser audit — biomes, zones, features, markers, trade animation, name bases, provinces, religions, and states contain no remaining Latin-script values

## Working rules

- Keep `master` clean. Develop only in `codex/kontar-edition` or its child feature branches.
- Pull official changes into `master`, then merge `master` into the working branch.
- Never scatter Russian strings through application code; add or correct them in `ru.json`.
- Keep English as the fallback locale.
- Preserve upstream data structures and save compatibility unless a migration is documented.
- Start MCP access read-only. Add writes only with validation, backups, and narrow commands.
- Before architectural work, read `AGENTS.md`, `CONTEXT.md`, and the relevant files under `docs/`.

## Routine commands

```powershell
git switch master
git pull --ff-only upstream master
git switch codex/kontar-edition
git merge master
npm ci
npm run i18n:check
npm run build
npm test -- --run
```

## Known notes

- The initial Russian catalog was machine-seeded and core terminology was reviewed manually. Rare dialogs may still need editorial polishing in `ru.json`.
- `npm ci` currently reports 3 inherited audit findings: 1 low and 2 high. Do not run a breaking automatic fix without review.
- The pre-commit lint hook can touch many upstream files because of line endings. Inspect `git status` after it runs and avoid committing unrelated formatting churn.
- The first `.map` draft is tracked in Git. Keep additional backups before manual edits.
- This is a geographic baseline, not a canonical political map. Generated borders, settlements, minor names, and routes require review.

## Next work

1. Review and correct the draft's coastlines, scale, major relief, and island placement with the user.
2. Replace generated borders, settlements, cultures, routes, and minor names with canonical Kontar data.
3. Document the `.map` fields the integration must read.
4. Build a read-only adapter that exports a stable Kontar snapshot from the map.
5. Add a local MCP server with discovery and read-only world queries.
6. Add validated, backup-first mutations for approved map operations.
7. Add live synchronization with the browser/Electron app only after file-based integration is stable.

## History

- 2026-09-30 — cloned upstream, renamed the official remote to `upstream`, created `codex/kontar-edition`.
- 2026-09-30 — added centralized Russian localization and completed build, test, and browser verification.
- 2026-09-30 — established this development log as the cross-chat project memory.
- 2026-09-30 — generated the first editable Kontar `.map` from the world notes and verified a clean save/load round-trip.
- 2026-09-30 — rejected per-primitive scaling because it fragmented Valeyn and Kaishi into extra islands.
- 2026-09-30 — scaled Valeyn and Kaishi as whole groups to 50%, kept equatorial islands centered, and removed generated sea ice.
- 2026-09-30 — added and verified a one-click second-monitor launcher for the current Kontar map.
- 2026-09-30 — fixed Playwright downloads being trapped under UUID names in its temporary folder; launcher now copies them to the real Downloads folder with the suggested filename.
- 2026-09-30 — fixed Russian localization preventing `Risk`, `Keep`, and `Erase` heightmap edits from being applied on exit.
- 2026-09-30 — completed Russian data terminology and added Cyrillic transliteration for generated names and all name-base corpora.
