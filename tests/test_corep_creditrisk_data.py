#!/usr/bin/env python3
"""Regression audit for all EBA 4.3 COREP_OF C05-C10 JSON cell extracts."""
import collections
import json
import pathlib
import re

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/"docs"/"data"
manifest=json.loads((DATA/"corep_creditrisk_manifest.json").read_text(encoding="utf-8"))
base=json.loads((DATA/"corep_of_multitemplate_manifest.json").read_text(encoding="utf-8"))
inventory=json.loads((DATA/"corep_official_inventory.json").read_text(encoding="utf-8"))
assert manifest["status"]=="validated"
assert manifest["reporting_family"]=="COREP_OF"
assert manifest["source"]["release_code"]=="4.3"
assert manifest["source"]["zip_sha256"]==base["source"]["zip_sha256"]
expected={t["code"] for m in inventory["modules"] if m["module_code"]=="COREP_OF"
          for t in m["tables"] if re.fullmatch(r"C_(?:0[5-9]|10)\.\d{2}(?:\.\d+)?(?:\.[a-z])?",t["code"])}
actual={t["code"] for t in manifest["templates"]}
assert expected==actual|set(manifest["empty_technical_versions"])
assert len(actual)==len(manifest["templates"])
assert all(re.fullmatch(r"C_(?:0[5-9]|10)\.\d{2}(?:\.\d+)?(?:\.[a-z])?",code) for code in actual)
allkeys=set()
counts=collections.Counter()
open_coordinates=0
for t in manifest["templates"]:
    path=ROOT/"docs"/t["file"]
    assert path.resolve().is_relative_to(DATA.resolve()),path
    assert path.exists(),path
    assert path.stat().st_size==t["bytes"],path
    d=json.loads(path.read_text(encoding="utf-8"))
    assert d["source"]["release_code"]=="4.3"
    assert d["source"]["zip_sha256"]==manifest["source"]["zip_sha256"]
    assert len(d["table_versions"])==1
    assert d["table_versions"][0]["code"]==t["code"]
    assert d["table_versions"][0]["table_vid"]==t["table_vid"]
    assert len(d["cells"])==t["cell_count"]
    assert d["validation_rules"]==[]
    excluded=sum(c["is_excluded"]==1 for c in d["cells"])
    assert excluded==t["excluded_count"]
    assert t["reportable_count"]==t["cell_count"]-excluded
    for c in d["cells"]:
        assert c["table_vid"]==t["table_vid"]
        assert c["table_code"]==t["code"]
        assert c["cell_id"] is not None
        assert (t["table_vid"],c["cell_id"]) not in allkeys
        allkeys.add((t["table_vid"],c["cell_id"]))
        assert c.get("cell_code","").startswith("{"+t["code"]+",")
        if c["variable_vid"] is None:assert c["is_excluded"]==1
        else:
            assert c["variable"] is not None
            assert c["variable"]["variable_vid"]==c["variable_vid"]
        if not c["row"] or not c["column"]:
            open_coordinates+=1
    counts[t["code"].split("_")[1][:2]]+=len(d["cells"])
assert len(allkeys)==manifest["total_cells"]
assert manifest["total_excluded"]+manifest["total_reportable"]==manifest["total_cells"]
assert set(counts)=={"05","06","07","08","09","10"}
print("PASS COREP C05–C10:",len(actual),"navigable templates,",
      len(allkeys),"official cell positions,",open_coordinates,"open coordinates")
print("Verified families:",dict(sorted(counts.items())))
