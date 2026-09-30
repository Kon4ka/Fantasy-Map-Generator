# Interface localization

Kontar Edition keeps translations outside feature code so upstream changes remain easy to merge.

## Runtime

- English source strings remain the fallback and are not rewritten across the codebase.
- `src/services/localization.ts` translates static and dynamically inserted UI nodes, supported attributes and dialog content.
- User-authored labels, notes and free text are excluded from automatic translation.
- Generated proper names, map object names and name-base source data are transliterated to Cyrillic by `src/services/russian-map-content.ts` when a map is generated or loaded in Russian mode.
- Internal enum and group identifiers remain English for compatibility; editors render their Russian labels from the shared catalog.
- The selected interface language is stored in the browser under `kontar.interfaceLocale`.
- Russian is the default; English can be selected in Options → Language.

## Russian catalog

All Russian text is stored in `src/data/locales/ru.json`:

- `messages` contains exact source-to-translation pairs;
- `patterns` handles parameterized and composed messages;
- `dataMessages` contains biome, feature, marker, state, province, religion and name-base terminology;
- `dataPatterns` handles generated zone and religion name templates;
- `ignored` lists proper names and technical values that must not be translated.

Edit this file to improve wording. Do not scatter Russian strings through controllers and templates.

## Keeping up with upstream

Run the catalog check after each upstream merge:

```sh
npm run i18n:check
```

Run `node scripts/kontar-verify-russian-data.mjs` with the development server active to load the Kontar map and verify that the affected data editors contain no remaining Latin-script values.

The command scans static HTML, TypeScript UI templates, dialogs, notifications and confirmations. It fails when newly introduced interface strings are missing from the Russian catalog.

`node scripts/i18n-generate-ru.mjs` can generate an initial machine translation for missing strings. It is a maintenance helper, not a runtime dependency. Review generated wording and add important domain terms to `manualTranslations` in the script before accepting the update.

## Git update workflow

The official Azgaar repository is configured as `upstream`. Keep `master` clean and merge it into the Kontar branch:

```sh
git switch master
git pull --ff-only upstream master
git switch codex/kontar-edition
git merge master
npm ci
npm run i18n:check
npm run build
npm test -- --run
```
