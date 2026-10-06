# C4/C5 r3 source compatibility

This change is based on upstream `e4a763483e734de5c2d78c32c6c77fd9fbb0fba3` (3.5.4). It publishes the source-code portion of the local C4/C5 r3 revision only. A clean public checkout does not include the revised story text or images.

## What changes

- Two revised C5 battle translations receive matching display-only heading ranges.
- All 12 original text variants remain supported; the two revised variants are additional records (14 variants, 344 ranges total).
- Each range stores a fingerprint instead of literal heading text. Visible text always comes from the locally installed story data. The existing UTF-16 FNV-1a identity check is a drift guard, not a security or authenticity guarantee.
- Main and second-screen pages refresh the renderer and optional resource mapping. The main page also refreshes the local story and entity-index cache keys.
- Docker, Android, TTS, table rendering, existing media handling and resource import code are unchanged.

## Local resources and publication boundary

Obtain resources through an authorized private channel and retain their existing relative paths. Follow the application's existing local resource installation or `.atopack` workflow; this PR does not create a resource package or change its importer. Do not force-add ignored material to Git.

These existing, ignored local resource paths stay outside this PR:

- `story/data/storybook-data.js`
- `story/data/entity-index.js` and `story/data/entity-index.json`
- `story/assets/mixed-media/mapping.js`
- `story/assets/mixed-media/images/`

Use the manifest supplied with your authorized local resource set to verify its files privately. Resource filenames, checksums, source excerpts and download links are not published here.

The local dataset and its matching mapping/images are required for the translation corrections, standalone-entry changes, entity excerpts and replacement ciphers. Those changes are not supplied by merging this source-only PR. Existing resources referenced by the local mapping remain prerequisites and are not duplicated here.

When integrating r3, keep this PR's renderer: it supports both old and revised text variants. Do not overwrite it with the renderer from an older local incremental archive. Back up local resources and saves first. Apply the private files as one compatible set, restart the app and refresh both screens. Cache-key changes alone do not install or download any resources.

If resources are absent, public placeholder behavior remains. Unknown or changed text receives no forced headings; failed media continues to use the existing text fallback. To roll back the resource update, restore the backed-up local files and refresh. No save data needs to be changed.

## Checks

Run the public, synthetic regressions without private resources:

```sh
node --test story/tests/c5-heading-compat.test.cjs story/tests/mixed-media.test.cjs story/tests/story-pipe-tables.test.cjs
python tools/test_story_code_in_git.py
python tools/test_packaging_exclusions.py
```

The new heading tests exercise old and revised variants, source drift, range fingerprint checks, immutable metadata, repeated formatting, split text nodes, Unicode/entities, native heading/table markup and non-mutating fallback. Existing media tests exercise missing/failed resources and interrupted rendering.

For authorized local-data QA, check both revised C5 battle entries on both screens, independently open C4 4172, and verify each updated cipher appears once. Confirm copying and narration retain the original text, missing images leave readable fallback, and switching entries while an image loads cannot insert stale content. Automated DOM tests do not replace real browser or Android/Windows device testing.
