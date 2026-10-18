#!/usr/bin/env python3
"""Validate EBA COREP_OF multi-template extract and write a small audit manifest."""
import collections
import datetime
import json
from pathlib import Path
source=Path("docs/data/corep_of_multitemplate.json")
if not source.exists():raise SystemExit("Official multi-template extract missing")
data=json.loads(source.read_text(encoding="utf-8"))
tables=data.get("table_versions") or []
cells=data.get("cells") or []
codes={t["code"] for t in tables}
if data["source"]["reporting_family"]!="COREP_OF":raise SystemExit("Unexpected reporting family")
for prefix in ("C_01.00","C_02.00","C_03.00","C_04.00"):
 if not any(c==prefix or c.startswith(prefix+".") for c in codes):
  raise SystemExit("Missing official table family "+prefix)
table_vids={t["table_vid"]:t["code"] for t in tables}
if not cells:raise SystemExit("No official cells")
if any(c.get("table_code")!=table_vids.get(c.get("table_vid")) for c in cells):
 raise SystemExit("Mismatch between cell table and TableVID")
if any(c.get("cell_id") is None or c.get("variable_vid") is None for c in cells):
 raise SystemExit("An extracted cell lacks its source CellID/VariableVID")
grouped=collections.Counter(c["table_code"] for c in cells)
missing_coords=collections.Counter(c["table_code"] for c in cells if not c.get("row") or not c.get("column"))
unique_ids=len({(c["table_vid"],c["cell_id"]) for c in cells})
if unique_ids!=len(cells):raise SystemExit("Duplicate table+cell identifiers")
manifest={
 "provenance":"EBA DPM 4.3 release, COREP_OF official Access database",
 "generated_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "status":"validated",
 "source":{"release_code":data["source"]["release_code"],"zip_sha256":data["source"]["zip_sha256"],"reporting_family":"COREP_OF"},
 "byte_size":source.stat().st_size,
 "number_of_template_variants":len(tables),
 "total_cells":len(cells),
 "validation_expressions":len(data.get("validation_rules",[])),
 "cells_missing_row_or_column":dict(missing_coords),
 "table_versions":[{"code":t["code"],"name":t.get("name"),"table_vid":t["table_vid"],"cell_count":grouped[t["code"]]} for t in tables],
 "scope_note":"Validation expression list is still limited to formulas referencing C_01.00; other-template rule imports are pending.",
 "source_file":"docs/data/corep_of_multitemplate.json"
}
out=Path("docs/data/corep_of_multitemplate_manifest.json")
out.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({k:v for k,v in manifest.items() if k not in ("table_versions","source")},indent=2))
print("Tables:", [(t["code"],t["cell_count"]) for t in manifest["table_versions"]])
