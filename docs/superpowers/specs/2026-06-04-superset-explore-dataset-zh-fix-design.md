# Superset Explore And DatasetList Chinese Translation Fix Design

## Goal

Repair the remaining untranslated or machine-translated Chinese strings visible in Superset's chart configuration flows and dataset list flows on the deployment host, without changing database behavior, page logic, or unrelated services.

## Confirmed Source Chain

- `Explore` and `DatasetList` are frontend SPA routes rendered through `render_app_template()`.
- The frontend preamble fetches `/superset/language_pack/<lang>/`.
- The endpoint returns `superset/translations/zh/LC_MESSAGES/messages.json`.
- Some outer menu and bootstrap labels still come from backend `menu_data`, but the chart configuration body and dataset list body mostly use frontend `t(...)` strings from the shared language pack.

## Scope

This change will only cover runtime user-visible text in:

- `superset-frontend/src/explore/**`
- `superset-frontend/src/pages/DatasetList/**`

The fix will update the shared Chinese translation artifacts by extending the local translation rebuild script and regenerating remote `po/json/mo` files.

## Explicit Exclusions

This change will not translate or modify:

- test files and fixture-only strings
- protocol or format identifiers such as `WMS`, `WFS`, `XYZ`, `1D`, `1H`
- numeric literals and pure enum codes
- backend logic, database timezone, task scheduling, or non-translation frontend behavior

## Selection Rule For Keys

Only keys that meet all of the following will be translated:

- appear in runtime code paths for `Explore` or `DatasetList`
- are visible to end users in dialogs, labels, buttons, tooltips, errors, or empty states
- are currently missing from `zh/messages.json` or present with a blank value

Keys will be skipped if they are clearly:

- test-only
- fixture-only
- internal technical constants not intended for translation

## Implementation Approach

1. Compute the `Explore + DatasetList` translation gap against the active `zh/messages.json`.
2. Filter the gap down to runtime user-visible strings only.
3. Add explicit overrides to `build_zh.py`.
4. Extend `tests/test_build_zh_overrides.py` with representative regression coverage.
5. Rebuild remote `messages.po`, `messages.json`, and `messages.mo`.
6. Restart only `superset-superset-1`.
7. Verify selected keys through `/superset/language_pack/zh/` and spot-check the affected pages after refresh.

## Verification

Verification must include:

- a code-level diff of newly added overrides
- remote language-pack checks for representative `Explore` and `DatasetList` keys
- container health check after restart

Success means the previously blank or English runtime keys now resolve to Chinese through the shared language pack, and the affected pages pick them up after a hard refresh.

## Risks And Mitigation

- Risk: translating internal constants could create noise or regress tests.
  - Mitigation: exclude test, fixture, protocol, and enum-like keys.
- Risk: a visible string may come from a non-`t(...)` source.
  - Mitigation: keep this round focused on shared language-pack keys and report any non-language-pack outliers separately.
- Risk: frontend asset caching may mask the update.
  - Mitigation: verify through the language-pack endpoint first, then require a hard refresh for UI confirmation.
