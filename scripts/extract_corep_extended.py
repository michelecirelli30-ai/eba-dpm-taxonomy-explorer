#!/usr/bin/env python3
"""Import official EBA DPM 4.3 COREP_OF C32-C36 templates (incl. SEC, OPR, MR, CVA).
No invented cells; produces GitHub Pages JSON files and a verified manifest.
Requires mdbtools and network access to official EBA source.
"""
import collections
import datetime as dt
import json
import pathlib
import re
import tempfile
import extract_corep_of_multitemplate as base

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/data/corep_extended"
MANIFEST=ROOT/"docs/data/corep_extended_manifest.json"
SOURCE_MANIFEST=ROOT/"docs/data/corep_creditrisk_manifest.json"
INVENTORY=ROOT/"docs/data/corep_official_inventory.json"
RX=re.compile(r"^C_3[2-6]\.\d{2}(?:\.\d+)?(?:\.[a-z])?$",re.I)
def main():
 inv=json.loads(INVENTORY.read_text())
 m=next(m for m in inv["modules"] if m["module_code"]=="COREP_OF")
 expected={t["code"] for t in m["tables"] if RX.fullmatch(t["code"])}
 if len(expected)<10:raise ValueError("Incomplete official C32-C36 inventory")
 pinned=json.loads(SOURCE_MANIFEST.read_text())["source"]["zip_sha256"]
 with tempfile.TemporaryDirectory() as temp:
  db,src=base.download_archive(pathlib.Path(temp))
  if src["zip_sha256"]!=pinned:raise ValueError("Official source checksum changed: manual provenance review required")
  data=base.build(db,src,target_table_re=RX,required_prefixes=(),include_c0100_rules=False)
 if data["source"]["reporting_family"]!="COREP_OF" or data["source"]["release_code"]!="4.3":
  raise ValueError("Incompatible reporting family or release")
 codes={t["code"]:t for t in data["table_versions"]}
 if not expected.issubset(codes):raise ValueError("Missing official table versions: "+str(sorted(expected-set(codes))))
 OUT.mkdir(parents=True,exist_ok=True)
 entries=[]
 for code,t in sorted(codes.items()):
  subset=[c for c in data["cells"] if c["table_vid"]==t["table_vid"]]
  if not subset:continue
  if len(subset)!=len({c["cell_id"] for c in subset}):raise ValueError("Duplicate CellID "+code)
  for c in subset:
   if c["table_code"]!=code or not c["cell_code"] or (c.get("variable_vid") is None and c.get("is_excluded")!=1):
    raise ValueError("Invalid official cell "+str(c))
  excluded=sum(c["is_excluded"]==1 for c in subset)
  content={"dataset":"EBA official DPM 2.0 COREP_OF "+code,"source":data["source"],
    "module_versions":data["module_versions"],"table_versions":[t],
    "stats":{"cells":len(subset),"excluded":excluded,"reportable":len(subset)-excluded},
    "cells":subset,"validation_rules":[],
    "limitations":["Official DPM source coordinates; not complete Excel layout.","Validation expressions and current rule status not imported.","No filing engine."]}
  file=OUT/(code+".json")
  file.write_text(json.dumps(content,ensure_ascii=False,separators=(",",":"))+"\n")
  entries.append({"code":code,"name":t["name"],"table_vid":t["table_vid"],"cell_count":len(subset),
                  "excluded_count":excluded,"reportable_count":len(subset)-excluded,
                  "file":"data/corep_extended/"+code+".json","bytes":file.stat().st_size})
 if not entries:raise ValueError("No actual source cells")
 manifest={"status":"validated","reporting_family":"COREP_OF","scope":"Official C32-C36 COREP_OF variants",
  "generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
  "source":{"release_code":"4.3","zip_sha256":pinned},
  "official_inventory_variant_count":len(expected),"table_variants_with_cells":len(entries),
  "empty_technical_versions":sorted(expected-set(x["code"] for x in entries)),
  "total_cells":sum(x["cell_count"] for x in entries),"templates":entries,
  "rule_import_status":"not_imported",
  "note":"Counterparty credit risk also appears in existing C07-C10 templates. Only official cells are displayed."}
 MANIFEST.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n")
 print("Imported",len(entries),"table variants;",manifest["total_cells"],"source positions")
if __name__=="__main__":main()
