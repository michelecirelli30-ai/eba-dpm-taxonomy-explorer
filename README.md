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


## Official COREP Capital Adequacy Explorer (C 01–04)

The **Official COREP DPM Data** screen now loads the authentic EBA 4.3 `COREP_OF` Access dataset from `docs/data/corep_of_multitemplate.json`. Use the **Reporting template** selector to navigate:

| EBA table version | Imported source cell positions |
| --- | ---: |
| C_01.00 — Own Funds | 110 |
| C_02.00.a — Risk Exposure Amounts | 109 |
| C_02.00.b — Own Funds Requirements | 107 |
| C_03.00 — Capital Ratios | 28 |
| C_04.00 — Memorandum Items | 117 |
| **Total** | **471** |

Of the 471 template positions, **31 are marked excluded** by the original database and have no reportable `VariableVID`; the other **440** have source variable identifiers. The technical `C_02.00` table version with no cells is excluded from the selector.

Regenerate the dataset with `scripts/extract_corep_of_multitemplate.py` using `mdbtools` on GitHub Actions (`.github/workflows/corep-multitemplate.yml`). The accompanying `docs/data/corep_of_multitemplate_manifest.json` documents its verified versions and record counts.

**Current limitation:** The integrated 52 validation formulas and 7 preconditions are the curated **C 01.00** source corpus only. Other-template rules and cross-template translator support are not yet imported; no XBRL QName, current rule activation state, institution mapping or live filing is claimed.
