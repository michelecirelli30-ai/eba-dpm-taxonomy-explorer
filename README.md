# EBA DPM & Taxonomy Explorer

An independent EU banking regulatory-reporting research dashboard, conceived and curated by **Michele Cirelli**.

## What this release is

A static interactive explorer of EBA technical framework releases, DPM concept relationships, reporting families and validation-rule lifecycle, based on EBA primary-source documentation. It distinguishes publication dates from first reporting reference dates. EBA framework release 4.4 (Phase 1) was published 12 October 2026; framework 4.3 was finalised 9 July 2026. Confirm later changes with the EBA.

## What it is not

The dashboard **does not yet ingest** the actual EBA DPM 2.0 database, data point/variable IDs, table-cell coordinates, taxonomy entry points, or the individual validation-rule Excel/CSV and formulas. The model graph is conceptual and no such records have been invented. `docs/data/catalog.json` is curated metadata only.

## View locally

Open `docs/index.html` in your browser. It embeds an offline catalog, so the explorer functions without a local server. External official links require internet access and may respond with `403 Forbidden`; the UI provides a second link for searching the source domain by title.

## Publish to GitHub Pages

1. Create a **new public GitHub repository** (e.g. `eba-dpm-taxonomy-explorer`). Do not upload into the separate Prudential Radar repository.
2. Upload all contents of this ZIP to the new repository, retaining the `.github/workflows` and `docs/` directories.
3. In Settings → Pages select **GitHub Actions** as the source.
4. Go to Actions → **Publish DPM Taxonomy Explorer**, run the workflow if not already running, and wait for successful deployment.
5. Open `https://YOUR-GITHUB-USERNAME.github.io/eba-dpm-taxonomy-explorer/`.

## Automated monitoring

- `.github/workflows/weekly-check.yml` runs Mondays at 08:13 UTC and writes `docs/data/source_health.json`, checking available EBA source landing pages and flagging *possible* releases for human review.
- GitHub Pages automatically republishes on updates to `docs/`.
- The job **does not automatically assert legal applicability, patch DPM records, or rewrite the curated release catalog**. Such conclusions would require authoritative source validation.

## Roadmap to real DPM data

1. Download the EBA DPM 2.0 database for the chosen framework version and its table layout / data point categorisation files.
2. Inspect the official archive and database schema, preserving version and table-specific provenance.
3. Extract actual rows into a normalized SQLite/JSON catalog (framework → module → table → ordinate → variable/data point → dimension/property → member/item → metric).
4. Import actual validation rules with rule ID, severity and activation state per release, then cross-link to table cells.
5. Add version diffs and a per-template COREP/FINREP cell inspector based on real imported metadata.

## Rights & disclosure

© 2026 Michele Cirelli. Original editorial/site materials; all rights reserved unless separately licensed. Official EBA documents, trademarks, datasets and metadata remain subject to the rights and reuse terms of their original publisher. No affiliation, approval or endorsement by EBA or any financial institution. AI assistance was used during prototype development. Not legal or supervisory reporting advice.