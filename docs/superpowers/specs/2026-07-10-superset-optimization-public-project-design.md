# Superset Optimization Public Project Design

## Status

Approved project direction. This document defines the repository boundary and
migration rules that must be reviewed before implementation starts.

## Objective

Create a public repository named `hersj/superset-optimization` that preserves
Apache Superset history and contains reusable Superset product and performance
improvements currently maintained on the Sellerfox production server.

The project must become the sole source repository for Superset application
customizations. Sellerfox remains responsible for business data pipelines,
warehouse schemas, and data correctness.

## Repository Model

The repository is a full fork of Apache Superset rather than a patch-only
overlay. Its Git remotes are:

- `origin`: `https://github.com/hersj/superset-optimization.git`
- `upstream`: `https://github.com/apache/superset.git`

Apache history is retained. The current production base commit,
`cc066b3576`, is used as the migration baseline. Public customizations are
rebuilt as focused commits on top of that baseline instead of publishing the
production server's dirty working tree as one snapshot.

The default branch remains `master` to simplify comparison and synchronization
with Apache Superset. Migration work is prepared on a `codex/` branch and
merged only after verification.

## Ownership Boundary

The public project owns:

- native-filter behavior, state persistence, cascade option loading, and
  dashboard load-performance changes;
- CustomTime and SmartDate user-interface and formatting behavior;
- Pivot Table formatting, totals, conditional formatting, and public chart
  properties;
- Big Number comparison ranges and display properties;
- reusable Superset backend APIs, cache behavior, translations, tests, and
  generic deployment templates;
- documentation for development, testing, upstream synchronization, release,
  and rollback.

Sellerfox continues to own:

- ODS, DWD, DWS, profit calculations, synchronization jobs, and business data
  repair;
- warehouse table definitions and indexes for Sellerfox-owned tables;
- private dashboard metadata, production credentials, RLS assignments tied to
  internal users, and business-specific SQL or identifiers.

When a change spans both repositories, each repository contains only its owned
half and the release notes link the two changes.

## Public-Safety Rules

No production working-tree file may be copied wholesale into the public
repository. Every candidate file is reviewed before staging.

The following are excluded:

- passwords, secret keys, database URLs, tokens, private IP configuration, and
  user identities;
- `.env` files, live `superset_config.py` values, logs, compiled assets, cache
  data, SQL dumps, and backup files;
- dashboard parameter backups and business-specific chart or dataset metadata;
- Sellerfox table samples, customer data, internal metric values, and private
  operating procedures.

Configuration is published only as environment-variable-driven examples.
Repository history and the staged diff are scanned for secrets before the
first push.

## Migration Structure

Production changes are reconstructed in this order:

1. Generic runtime and configuration templates.
2. Filter-state persistence and initialization behavior.
3. Cascade-filter batching, caching, and request reduction.
4. CustomTime and SmartDate behavior.
5. Pivot Table public formatting properties.
6. Big Number comparison properties.
7. Chinese translation improvements.
8. Tests, operational documentation, and release tooling.

Each commit includes a concise description and the author. Temporary `.orig`,
`.bak`, build-log, and generated translation files are not migrated.

## Sellerfox Cleanup

Sellerfox cleanup happens only after the corresponding public files are
committed and verified. Superset-specific design documents, temporary source
copies, translation assets, and Superset metadata scripts are removed from the
Sellerfox working tree when ownership has transferred.

Data migrations remain in Sellerfox if they alter Sellerfox-owned warehouse
objects. Superset metadb or application-only migrations move to
`superset-optimization` after private identifiers are parameterized.

Uncommitted Sellerfox business changes are left untouched throughout the
migration.

## Verification

Before creating or pushing the public repository:

- compare every migrated source file with the production working tree;
- run focused frontend Jest and backend pytest suites for each customization;
- run the Superset frontend production build;
- start the Docker stack from sanitized configuration and verify health;
- scan tracked files and Git history for secrets and production-only values;
- confirm no Sellerfox customer data or private dashboard metadata is tracked.

Before switching production deployment:

- deploy the built revision to a staging or parallel container;
- verify representative dashboards, native filters, CustomTime, Pivot Table,
  Big Number, translations, and dashboard load behavior;
- record the exact commit and image tag;
- preserve the current production checkout and image as the rollback target.

## Rollout and Failure Handling

Creating the public repository does not change the live Superset deployment.
Production switches to the public repository only after all verification gates
pass.

If a production customization cannot be generalized without exposing private
business details, it stays outside the public repository and is documented as
a private deployment extension. If a reconstructed commit changes behavior or
fails its tests, that module is held back without blocking already verified
modules.

## Success Criteria

The migration is complete when:

- `hersj/superset-optimization` is public and has Apache Superset configured as
  `upstream`;
- all approved reusable production customizations exist as reviewed commits;
- tests, build, container health, and secret scans pass;
- Sellerfox no longer contains Superset application source or Superset-only
  working artifacts;
- production can be deployed and rolled back using documented versioned
  revisions from the new repository.
