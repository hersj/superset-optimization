# Sellerfox Superset Archive

This directory contains Superset-specific assets moved out of the Sellerfox data
pipeline repository.

- `translation/` preserves the former Sellerfox translation rebuild script,
  regression test, and missing-key inventory. The repository-root translation
  tooling remains the server-aligned active version.
- `pivot_fix/` preserves an earlier Pivot Table implementation and test snapshot
  for historical comparison only.
- Superset RLS migration SQL is maintained under `deploy/sql/`.
- Sanitized design and implementation documents are maintained under
  `docs/superpowers/`.

Dashboard parameter, query-context, and SQL backups are private operational
artifacts. They are stored locally under `.migration-private/sellerfox/` and are
excluded from Git.
