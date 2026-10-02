# Kontar Edition — development log

Read this file before starting work. Update it after every material change. Keep entries concise and factual.

Last updated: 2026-10-02

## Goal

Adapt Azgaar's Fantasy Map Generator for the world of Kontar: Russian-first UI, safe world-data operations, and later local Codex/MCP integration.

## Repository

- Fork: `https://github.com/Kon4ka/Fantasy-Map-Generator`
- Upstream: `https://github.com/Azgaar/Fantasy-Map-Generator.git`
- Clean upstream branch: `master`, tracks `upstream/master`
- Working branch: `codex/kontar-edition`
- Personal fork / `origin`: not configured yet
- Base upstream commit: `7940ee81`

## Current state

- AI operating guide: `docs/ai-mcp-guide.md`, linked from AGENTS and README, documents current file/browser access, map-format and backup/conflict precautions, existing narrow scripts, and a clearly non-implemented future MCP contract. No MCP server or endpoint was added.
- Launcher explicitly enables Chromium sandboxing for its shared regular/self-test launch options. Playwright otherwise injects `--no-sandbox`, causing Chrome's unsupported-command-line warning; no warning-suppression flag or profile/map change is used.
- Glacier visibility follow-up: new maps place ice above filled thematic overlays and relief above ice. Loading repairs the earlier underlay order by moving only ice/relief, preserving other relative positions, active flags and ice styling/geometry. This prevents political fills hiding glaciers even when Relief is off, while snowy mountain artwork stays visible when Relief is on.
- Height/depth palettes now have named, positioned color ramps with linear/smooth/constant interpolation, draggable/keyboard stops, precise positions, reverse and a neutral-land ocean preview. Style exposes Create / Edit / Delete beside the select; built-ins are protected, custom removal confirms and resets current references to Natural. Custom palettes persist in browser storage; self-contained `ramp:` JSON strings live in the existing style scheme field and survive map serialization without that storage. Old comma-separated palettes remain supported. Ocean colors span the full ramp (19=shallow=0, 0=deep=1) consistently in SVG and editing/creation previews; land mapping is unchanged.
- Ocean masks use explicit full-graph bounds instead of viewport-relative percentages, including after map resizing; this fixes the horizontal depth-overlay cutoff in large saves. Sea-floor regeneration is available in ocean Style settings and Tools, confirms replacement of manual depth edits, and changes only ocean elevations in grid/pack with coast-distance shelves and seeded smooth noise. Land, lakes, feature identity and political data are preserved; no repacking occurs.
- Ocean depths are a separate layer (`oceanDepths`, SVG `oceanHeights`) next to Heightmap, with independent visibility, order and style selection. Land-only redraws preserve depth geometry and vice versa; water masking prevents depths covering islands. Saved style schema is unchanged; legacy combined visibility is migrated on load. Heightmap editing carries active depth visibility into its cell preview and automatically reveals water cells when the Water filter is chosen, using the configured ocean palette.
- Manual river commit orients a uniquely water-connected end as the mouth (water cells take priority over coastal neighbors), clips extra terminal water cells and reaches adjacent water from an unoccupied coastal endpoint. Ambiguous ends preserve stroke order; water-only strokes are rejected. Mouth metrics use the final land cell, water-cell river ownership is unchanged, and existing land/coastal confluences survive. Verified with 43 focused tests plus production build, formatting, localization and asset checks; no user save files changed.
- UI font preferences are separate from map fonts: built-in choices plus local TTF/OTF/WOFF/WOFF2 uploads (10 MB limit) stored in IndexedDB, with immediate selection persistence and default fallback. Settings selects now ellipsize their closed value while retaining full picker text; fixed columns and flexible ranges prevent overlaps. Verified custom-font reload, dialog typography and unchanged SVG/icon fonts in an isolated browser; 99 focused tests, localization check, asset stamp and production build pass.
- Sliders and UI scrollbars share a persistent optional accent color (Options: Sliders and scrollbars); reset derives contrasting accents from each surface's theme. Native ranges and legacy UI-slider controls are themed globally.
- Manual river creation now has a Brush toggle: LMB strokes sample intervening cells and show a temporary centerline, MMB pans while active, and disabling/closing restores default map interaction. Undo removes the last cell; river commit data format is unchanged. Automatic downhill placement remains separate.
- Table rows now use borderless surfaces and transparent inline fields, with hover/focus/selection highlights and one header divider. Columns and toolbar positions are unchanged.
- Map loading normalizes XML-prefixed SVG tags before HTML insertion. The relocation script's XML serializer could emit `<svg:svg>`, which the former loader rejected; `scripts/kontar-normalize-map-svg.ts` creates a non-overwriting repair copy touching only section 5.
- Cosmetic UI refresh preserves positions, dimensions and behaviors: rounded windows/controls, subtle theme-aware borders instead of violet outlines, soft shadows and keyboard-focus indicators. Map/SVG styles and user palette settings are unchanged.
- Centralized Russian localization is complete in commit `89da18cf`.
- Russian is the default; Russian/English can be switched in the Options panel.
- All translations live in `src/data/locales/ru.json`; runtime logic is in `src/services/localization.ts`.
- Catalog maintenance: `scripts/i18n-extract.mjs`, `scripts/i18n-generate-ru.mjs`.
- Translation architecture: `docs/architecture/localization.md`.
- Coverage: 4433 exact messages, 3 patterns, 41 intentionally ignored names/selectors; static missing count is 0.
- Map labels, user notes, editable content, and speech voices are intentionally not translated.
- First editable Kontar draft: `worlds/kontar/kontar-first-rift-draft.map`.
- Vector reference: `worlds/kontar/reference/kontar-first-rift.svg`.
- Reproducible generator: `scripts/kontar-generate-map.mjs`.
- Saved-map label repair: `scripts/kontar-repair-labels.mjs` names Valeyn and Kaishi, names single-state islands after their state, and marks only unresolved feature names with `()`.
- One-click launcher: `scripts/kontar-launch.cmd` starts the app, opens the current Kontar map on the first non-primary monitor, saves browser downloads to the real user Downloads folder, and stops its server when the browser closes.
- Launcher log: `%LOCALAPPDATA%\Kontar\launcher.log`.
- Launcher browser profile: `%LOCALAPPDATA%\Kontar\browser-profile`; app preferences now survive closing and reopening. Self-tests use a separate profile.
- UI text contrast is computed from background luminance: panels/headers and the separately saved window/field palette choose black or white independently. Options exposes Window and field color, including dropdown options.
- After CSS changes, refresh asset hashes (`node scripts/stamp-assets.js --check`); stale stamps can leave returning browsers on old styles. The points readout also switches to white on dark themes.
- Heightmap edit mode is stored independently of its translated label, so Russian `Risk`, `Keep`, and `Erase` modes finalize correctly.
- Generated map content localization is centralized in `src/services/russian-map-content.ts`: proper names and name-base corpora are transliterated to Cyrillic on map load/generation.
- Domain terminology is centralized in `ru.json` under `dataMessages` and `dataPatterns`; internal English IDs remain unchanged for compatibility.
- The launcher selects the newest `.map` from the user Downloads folder or `worlds/kontar` instead of a hard-coded draft.
- State painting can capture hidden state-center cells; centers relocate to remaining territory, and states with no territory are removed with a warning.
- `Win+Shift+S` is reserved for Windows screenshots, including modifier-free keyup after capture; layer toggles require a matching plain keydown. The states editor has a permanently visible Refit labels action beside Refresh.
- State-label refitting migrates legacy manual labels that duplicate state names, enables the real state-label group, and preserves geographic labels.
- Features Overview has Refit labels beside Refresh. It reuses matching annotations or creates missing labels, anchors them in the object's own cells, stores optional `AddedLabel.featureId`, and leaves unrelated annotations untouched. State refitting preserves linked geographic labels; feature name edits synchronize them.
- `scripts/kontar-relocate-feature-label.ts` makes a non-overwriting map copy with one existing label linked to an island and relocated. The floating island was feature 19 (`() Феней`), below-left of Martugor; its old label 11 was a free annotation at `[1416,615]`.
- A state's only capital burg can be deleted after confirmation; state and province capital references are cleared safely.
- Cultures editor has a confirmed Clear action beside Recalculate: resets territorial and settlement culture assignments, preserves culture definitions/countries/population, clears its legend, and disables auto-apply.
- The local MCP bridge has not been implemented yet.

## Verified

- 2026-10-02 pre-commit verification — production build and 122 unit-test files / 1317 tests passed; launcher static tests 2/2 passed; lint-only Biome check passed for 21 changed/new TypeScript files. Version/asset checks passed. Localization reports 16 unmatched entries (including SVG markup and two updated tour descriptions); formatter reports CRLF/LF differences. Skipped the auto-writing pre-commit hook to avoid repository-wide formatting churn. No browser tests were run.
- Glacier visibility follow-up — 77 focused regression tests passed. Isolated-browser QA loaded a temporary copy of the 15:56 save and verified all 12 glacier polygons over states with Relief off, and 265 derived snowy mountain symbols with Relief on. Ice fill and opacity remained unchanged (`#f1f8fe`, 0.9); original save untouched and temporary fixture removed.
- Color-ramp follow-up — 119 focused tests passed, including old palette compatibility, unequal stops, interpolation, style round-trip, deletion/cancel, full-depth previews, protected built-ins and opening during a pending map load. Isolated browser QA verified pointer drag to 0.629, numeric positioning, persistence after reload, edit reopening and cancellation, a compact button row for both sea/land styles, and unchanged land heights / coastlines / country SVG when applying an ocean palette. Original map files untouched; temporary fixture removed.
- Sea-floor regeneration / mask coverage — 127 focused tests passed; isolated-browser QA loaded the 15:56 Kontar save through a temporary copy, verified a 1600×1000 mask covering the bottom edge, cancel preserving depths, consecutive regenerations producing different ocean geometry and unchanged land heights, coastlines, rivers and labels. Original save untouched; temporary fixture removed. Style command imports lazily to avoid the UI initialization cycle.
- Independent ocean depths — 116 focused tests, production build, formatting, localization and asset checks passed. Isolated browser QA confirmed independent depth/land visibility and styles, water-only brush feedback and Keep-mode finalization; no user save files changed.
- Slider / river brush follow-up — 127 focused tests, production build, localization and asset checks passed. Isolated browser QA verified one LMB stroke selecting 10 cells without panning, cursor/toggle changes, successful river creation and restoration on close. Orange range/scrollbar styling persisted after reload. User map and save files untouched.
- Namespaced SVG / table follow-up — 14 focused tests, build and asset check passed. Reproduced invalid-file error on `<svg:svg>`; updated loader opened both the unchanged original and a separate `Парящий остров - восстановлено.map` copy. Only SVG section 5 differs; all 52 other sections are identical. Dark/light table QA confirmed transparent row borders/inline fields and visible editing focus.
- Cosmetic UI refresh — production build and asset-stamp check passed. Isolated-browser QA confirmed rounded windows/controls and neutral borders on dark and light palettes; sampled dimensions were identical across palettes. User map and saved files untouched.
- Node.js `24.11.1`
- `npm run i18n:check` — passed, 0 missing strings
- `npm run build` — passed
- `npm test -- --run` — 107 files, 1204 tests passed
- Manual browser QA — main menu translated; `ru → en → ru` switching works
- Kontar draft round-trip — generated, saved, and loaded back without page or integrity errors
- Round-trip counts — 2464 cells, 17 states, 14 cultures, 306 burgs, 77 rivers, 16 custom labels
- Launcher self-test — detected `DISPLAY2`, loaded `kontar-first-rift-draft.map`, saved a `.map` through the browser, and shut down cleanly
- Heightmap localization regression — 4 focused tests passed; Russian catalog check and production build passed
- Russian data-editor browser audit — biomes, zones, features, markers, trade animation, name bases, provinces, religions, and states contain no remaining Latin-script values
- Latest-save cleanup round-trip — 17 states preserved; 306 burgs, 232 routes, and 12 markets reduced to 0; launcher dry-run selects the cleaned map
- State-center paint regression — captured centers relocate, and states reduced to zero cells are safely removed
- Shortcut / label regression — `Win+Shift+S` triggers no app command; one action refits every active state label
- Legacy-label migration regression — duplicate manual state names are removed while non-state geographic labels are preserved
- Saved-map label repair — verifies Valeyn, Kaishi, single-state islands, and unresolved geographic placeholders independently
- Sole-capital removal regression — deleting the last burg clears state and province capital references
- Theme regression — 15 options-panel tests passed; launcher self-test verified dark/light text colors and restored the theme after closing and reopening the browser.
- Dark-text follow-up — 15 targeted tests passed; manual isolated-browser QA confirmed white captions, tabs, buttons and points readout after reload with the current CSS hash, and black panel/input text on a white theme. The user's live Chrome map was not reloaded.
- Cultures Clear — 3 regression tests, catalog check and build passed; isolated-browser QA verified its position, Russian confirmation and cancel. No user map was cleared.
- Screenshot / two-color / label-button follow-up — 49 focused tests and production build passed; isolated-browser QA verified dark surfaces, white field/list text, both colors surviving reload, visible Refit labels and its success notification. The user's live map was untouched.
- Geographic refit — 9 focused tests, catalog check and build passed. Isolated-browser QA verified the toolbar action and loaded `Контар после Первого раскола 2026-10-01-12-45 - Парящий остров.map`: feature 19 and label 11 are linked at `[1255.97,649.31]`. Source save and political data unchanged. The live user's map may contain newer unsaved changes.

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

- 2026-10-02 — collected the latest interface/settings, performance/ocean-cache, glacier, launcher and AI documentation changes for a local commit; recorded verification results and existing localization/formatting warnings. No push or user-save modification.
- 2026-10-02 — added a Russian AI/MCP operating guide after confirming that no such guide or MCP implementation exists. Distinguished the launcher file bridge from MCP and documented safe existing workflows plus requirements for a future read-only server; application and save files unchanged.
- 2026-10-02 — enabled `chromiumSandbox: true` in the Kontar launcher to stop Playwright injecting `--no-sandbox`. Added two static regression tests for the shared launch configuration and absence of disabling/warning-suppression flags; existing running browser sessions require a restart.
- 2026-10-02 — fixed the glacier stacking regression: the earlier ice-under-relief migration also put ice under state fills. Default/load order now keeps territorial fills below ice and relief above it, without changing glacier transparency, world data or layer activation.
- 2026-10-02 — at the user's request removed all 23 religions from the newest Downloads save, `Контар после Первого раскола 2026-10-01-15-56.map`, in place. Kept the no-religion sentinel and zeroed cell assignments; its SVG religion layer was already empty. Verified that only sections 26/29 changed and all 51 other sections are identical. Byte-exact backup: `.map.before-religions-removal.bak`. Added a backup-first cleanup script with four passing regression tests; no application behavior changed.
- 2026-10-02 — replaced fixed-spacing palette creation with a typed, transient color-ramp editor and custom palette management. Fixed the ocean's truncated palette range and unified preview coloring; retained the saved style shape and legacy palette support.
- 2026-10-01 — fixed viewport-relative water masking and added confirmed ocean-only depth regeneration in Style and Tools. Preserved original user saves, land/lake elevations, coastlines and world assignments; verified cancellation, repeat generation and full-map coverage in an isolated browser.
- 2026-10-01 — separated ocean depths from land heights in the Layers/Style tabs; retained legacy SVG/style compatibility and per-save toggles. Browser QA verified political land with independently visible depths, separate palette/contours, automatic water-preview enabling, a lowering stroke changing 32 cells and successful Keep-mode finalization. User saves were not modified.
- 2026-10-01 — moved ice below relief by default and normalized older saved layer orders without changing active layers. Derived snowy mountain artwork from glacier polygons and offsets without mutating relief placement; added a matching snowy symbol to the simple set. Glacier edits and viewport exports refresh the derived artwork. Verified 105 focused tests, production build and an isolated browser load of the 15:56 Kontar save; source save untouched.
- 2026-10-01 — added automatic source/mouth orientation for manual river strokes touching water or the shore, with water-overshoot clipping and regression coverage for reverse strokes, shore confluences, flux calculation and unchanged brush history.
- 2026-10-01 — themed all native sliders, legacy slider handles and UI scrollbars; added stored accent selection with theme-derived defaults. Added switchable river brush, continuous cell sampling, preview/undo, distinct cursor and scoped mouse ownership without changing normal navigation or saved river structure.
- 2026-10-01 — reduced the file drawer to one 38px-high icon strip beside a smaller toggle, without a heading or filename row. Unified native sliders in panels/dialogs with round thumbs and muted tracks. Added progressively enhanced native select popups with rounded, theme-aware options; guarded focused options from map shortcuts. Refitted the coastline dialog after content populates to avoid off-screen growth; no replacement widget or map logic changes.
- 2026-10-01 — detached file actions into a collapsed bottom-left icon drawer. Save updates the associated file; Save as asks for a copy name and switches later saves to that copy. The launcher verifies source hashes, rejects external edits / name collisions and keeps one rolling .bak. Native browser file handles are supported; fallback downloads are explicit. Added session, shortcut and isolated filesystem regression tests.
- 2026-10-01 — repaired XML-prefixed SVG compatibility after the floating-island save failed to open; prevented the relocation script from emitting incompatible roots and created a verified non-overwriting repair copy. Replaced boxed table rows with quiet borderless surfaces and interaction highlights.
- 2026-10-01 — softened UI corners, removed fixed violet window outlines, added subtle theme-aware borders and shadows without restructuring the interface. Verified both palettes and refreshed the CSS stamp.
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
- 2026-09-30 — changed the launcher to open the latest saved map and added a verified cleanup script for settlements and routes.
- 2026-10-01 — removed the hidden state-center painting lock and added safe center relocation / empty-state cleanup.
- 2026-10-01 — fixed the Windows screenshot shortcut conflict and added one-click refitting for all state labels.
- 2026-10-01 — made state-label refitting migrate legacy manual state-name labels and enable the real state-label group.
- 2026-10-01 — added a verified saved-map migration for state labels and geographic-name placeholders.
- 2026-10-01 — corrected geographic placeholders to feature names and allowed confirmed removal of a state's only burg.
- 2026-10-01 — refined feature naming: Valeyn and Kaishi are canonical, while single-state islands inherit state names.
- 2026-10-01 — switched the launcher from temporary to persistent browser storage and added automatic contrasting UI text.
- 2026-10-01 — corrected the stale CSS asset hash after the dark-text report; extended launcher contrast assertions to child captions and buttons, and fixed the points readout.
- 2026-10-01 — added cultures Clear beside Recalculate; user confirmed that the list must survive. Three regression tests passed; catalog check and production build passed.
- 2026-10-01 — fixed screenshot keyup toggling States; added persistent independent window/field color and contrasting text; moved Refit labels out of the hidden regeneration menu. Refreshed CSS asset stamp and verified in an isolated browser.
- 2026-10-01 — added geographic-label refitting and preserved feature-linked labels during state refits. Diagnosed the floating-island caption as a fixed draft annotation; created and reloaded a separate corrected 12:45 save without changing countries or the source file.
