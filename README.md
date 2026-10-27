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

## Deterministic EBA Validation Rule Translator (P1, in progress)

A syntax-aware JavaScript parser is available at `docs/data/eba_rule_translator.js` and is integrated into the **Official COREP DPM Data** rule panel. It produces:

- Plain-English and business-formula interpretations using imported official DPM row labels, when all references and grammar can be resolved.
- A technical breakdown of source `with` scope and original default/interval settings, without claiming to execute full DPM interval or missing-value semantics.
- An explicit **Requires technical review** result for unsupported grammar, references to other templates or unknown cell labels.
- Original expressions and source metadata remain available without modification.

Run `node tests/test_rule_translator.cjs` to test known fixtures and assess the 52-rule corpus. CI: `.github/workflows/test-rule-translator.yml`.

**Limitations:** This is a deterministic *explanation aid*, not a full EBA validation execution engine. Cross-template formulas are not falsely translated against missing DPM modules; true current rule status must be verified from the official status package. Scope defaults and interval handling are described, not simulated. Technical parser coverage must be checked from the CI output before claiming broader support. Track completion in [Issue #1](../../issues/1).


## Official COREP DPM Explorer — C 01 through C 10 (EBA release 4.3)

The **Official COREP DPM Data** screen uses the European Banking Authority's DPM 2.0 Access database, release 4.3, linked to the `COREP_OF` module.

### C 01–04: Own Funds and Capital Adequacy

The original source `docs/data/corep_of_multitemplate.json` contains five navigable table variants (C_01.00, C_02.00.a, C_02.00.b, C_03.00, C_04.00): **471** official DPM cell positions, including **31 excluded** positions.

### C 05–10: Transitional Provisions, Group Solvency and Credit Risk

As a second imported batch, `docs/data/corep_creditrisk_manifest.json` lists **26 navigable table variants** with **4,879** DPM source positions:

| COREP family | Area | Navigable variants |
| --- | --- | ---: |
| C 05 | Transitional provisions | 2 |
| C 06 | Group solvency | 2 |
| C 07 | Credit risk, Standardised Approach (SA) | 4 |
| C 08 | Credit risk, Internal Ratings-Based (IRB) | 11 |
| C 09 | Geographical breakdown / buffers | 4 |
| C 10 | IRB output floor and equity | 3 |

**Note:** The variant counts above are generated by the manifest, not manually assumed; the authoritative counts are in the dataset. The DPM source includes **902 excluded positions** and **3,977 non-excluded positions**. Some source coordinates are parameterised, e.g. `r*` or `s*`. These are open DPM cell templates, **not** instantiated individual filing values.

Four official grouping versions contain no own positions: `C_07.00`, `C_08.01`, `C_08.05.1`, `C_09.01`. They do not appear as empty selector options; their child table versions do.

The **Reporting template** selector lazily fetches `docs/data/corep_creditrisk/C_XX.XX[.variant].json` only when required. Each selected variant supports searching source cell positions, native DPM IDs, label/metric/dimension inspection and per-template CSV/JSON export. Large results show the first 250 positions until search narrows them.

Regenerate and audit the import through:
- `scripts/extract_corep_creditrisk.py` and `.github/workflows/corep-creditrisk.yml`: official Access download, checksum verification, per-template source extraction and publication
- `tests/test_corep_creditrisk_data.py` and `.github/workflows/test-corep-creditrisk.yml`: validate expected source variants, non-reportable/excluded positions, cell identities and corpus integrity

**Total navigable across C 01–10: 31 table variants and 5,350 original DPM positions**, not 5,350 necessarily reportable instantiated facts. These values refer to EBA DPM 4.3, not every newer or upcoming EBA release.

**Validation limitation:** The integrated **52 validation rules plus 7 preconditions** are still the curated C 01.00 source corpus; they are intentionally *not* represented as complete coverage for C 05–10. Cross-template rule imports, manual interpretations, current EBA rule status and rule execution remain separate future work. IFRS bridges are editorial learning examples, not official EBA fields.
