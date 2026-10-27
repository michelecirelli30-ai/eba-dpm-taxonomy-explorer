#!/usr/bin/env python3
"""Extract all linked C 05–C 10 COREP_OF template variants from EBA DPM 4.3.

One official Access download; one file per active table with actual cell positions.
Never infer cells or regulatory validation rules. GitHub Pages loads these on demand.
"""
from __future__ import annotations
import collections
import datetime as dt
import json
import pathlib
import re
import tempfile

import extract_corep_of_multitemplate as base

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/"docs"/"data"/"corep_creditrisk"
MANIFEST=ROOT/"docs"/"data"/"corep_creditrisk_manifest.json"
INVENTORY=ROOT/"docs"/"data"/"corep_official_inventory.json"
ORIGINAL=ROOT/"docs"/"data"/"corep_of_multitemplate_manifest.json"
TABLE_RE=re.compile(r"^C_(?:0[5-9]|10)\.\d{2}(?:\.\d+)?(?:\.[a-z])?$",re.I)
FAMILIES=tuple(f"C_{i:02d}." for i in range(5,11))

def audit(data,expected):
    if data["source"].get("reporting_family")!="COREP_OF":
        raise ValueError("Only COREP_OF tables are accepted")
    if data["source"].get("release_code")!="4.3":
        raise ValueError("Expected EBA DPM release 4.3")
    table_codes={t["code"] for t in data["table_versions"]}
    if not expected.issubset(table_codes):
        raise ValueError("Official C05-C10 table versions missing: "+", ".join(sorted(expected-table_codes)))
    cells=data["cells"]
    vids={t["table_vid"]:t["code"] for t in data["table_versions"]}
    if not cells:raise ValueError("No reporting cells extracted")
    if len(cells)!=len({(c["table_vid"],c["cell_id"]) for c in cells}):
        raise ValueError("Duplicate table/CellID pair")
    for c in cells:
        if c["table_code"]!=vids.get(c["table_vid"]):
            raise ValueError("TableVID mismatch for "+str(c.get("cell_code")))
        if not c.get("cell_code") or c.get("cell_id") is None:
            raise ValueError("Missing source cell coordinate/identifier")
        if c.get("variable_vid") is None and c.get("is_excluded")!=1:
            raise ValueError("Non-excluded cell without official VariableVID "+c["cell_code"])
        if c.get("variable_vid") is not None and not c.get("variable"):
            raise ValueError("DPM VariableVersion lookup failed for "+c["cell_code"])
    for family in FAMILIES:
        if not any(c["table_code"].startswith(family) for c in cells):
            raise ValueError("No actual source cells for "+family)
    return collections.Counter(c["table_code"] for c in cells)

def main():
    inventory=json.loads(INVENTORY.read_text(encoding="utf-8"))
    module=next(m for m in inventory["modules"] if m["module_code"]=="COREP_OF")
    expected={t["code"] for t in module["tables"] if TABLE_RE.fullmatch(t["code"])}
    if len(expected)<20:raise ValueError("Unexpectedly short official C05-C10 inventory")
    original=json.loads(ORIGINAL.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as folder:
        db,provenance=base.download_archive(pathlib.Path(folder))
        if provenance["zip_sha256"]!=original["source"]["zip_sha256"]:
            raise ValueError("Source archive checksum changed: review new version explicitly")
        data=base.build(db,provenance,target_table_re=TABLE_RE,
                        required_prefixes=(),include_c0100_rules=False)
    counts=audit(data,expected)
    DEST.mkdir(parents=True,exist_ok=True)
    entries=[]
    for t in sorted(data["table_versions"],key=lambda x:x["code"]):
        code=t["code"]
        subset=[c for c in data["cells"] if c["table_vid"]==t["table_vid"]]
        if not subset:continue  # technical grouping table; no selectable cell positions
        excluded=sum(c.get("is_excluded")==1 for c in subset)
        output={
            "dataset":"EBA official DPM 2.0 COREP_OF "+code,
            "source":data["source"],
            "module_versions":data["module_versions"],
            "table_versions":[t],
            "stats":{"cells":len(subset),"excluded":excluded,"reportable":len(subset)-excluded},
            "cells":subset,
            "validation_rules":[],
            "limitations":[
              "Official DPM Access coordinates/IDs, not XBRL QNames.",
              "Excluded positions are not reportable facts.",
              "Rule expressions, current activation status and filing validation are NOT imported for this template.",
              "ContextComposition may not contain every DPM modeling qualifier."
            ]
        }
        rel="data/corep_creditrisk/"+code+".json"
        filepath=DEST/(code+".json")
        filepath.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
        entries.append({"code":code,"name":t.get("name"),"table_vid":t["table_vid"],
                        "cell_count":len(subset),"excluded_count":excluded,
                        "reportable_count":len(subset)-excluded,"file":rel,
                        "bytes":filepath.stat().st_size})
    empty=sorted(expected-{e["code"] for e in entries})
    manifest={
        "status":"validated","reporting_family":"COREP_OF",
        "scope":"C_05 through C_10, including all linked active table variants",
        "generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
        "source":{"release_code":data["source"]["release_code"],
                  "release_id":data["source"]["release_id"],
                  "zip_sha256":provenance["zip_sha256"]},
        "official_inventory_variant_count":len(expected),
        "table_variants_with_cells":len(entries),
        "empty_technical_versions":empty,
        "total_cells":sum(e["cell_count"] for e in entries),
        "total_excluded":sum(e["excluded_count"] for e in entries),
        "total_reportable":sum(e["reportable_count"] for e in entries),
        "templates":entries,
        "rule_import_status":"not_imported",
        "note":"Original EBA C05-C10 DPM source cells only; not an executable rule engine."
    }
    if manifest["total_cells"]!=len(data["cells"]):
        raise ValueError("Manifest cannot account for all extracted cells")
    MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Published",len(entries),"navigable templates,",manifest["total_cells"],"source cells;",
          len(empty),"empty technical versions")
    print("By family",dict(collections.Counter(e["code"].split("_")[1][:2] for e in entries)))
    print("See",MANIFEST)

if __name__=="__main__":main()
