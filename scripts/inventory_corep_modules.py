#!/usr/bin/env python3
"""Inventory active EBA 4.3 COREP reporting modules and linked template versions."""
import collections
import datetime
import json
import pathlib
import tempfile
from extract_corep_of_multitemplate import download_archive, rows, number, current
TARGET=pathlib.Path("docs/data/corep_official_inventory.json")
IMPLEMENTED={"C_01.00","C_02.00.a","C_02.00.b","C_03.00","C_04.00"}

def main():
 with tempfile.TemporaryDirectory() as folder:
  db,source=download_archive(pathlib.Path(folder))
  releases=[x for x in rows(db,"Release") if (x.get("Code") or "").startswith("4.3")]
  release=max(releases,key=lambda x:number(x.get("ReleaseID")) or -1)
  rid=number(release["ReleaseID"])
  modules=[x for x in rows(db,"ModuleVersion")
    if (x.get("Code") or "").upper().startswith("COREP_") and current(x,rid)]
  modules_by_vid={number(m["ModuleVID"]):m for m in modules}
  links=collections.defaultdict(set)
  for record in rows(db,"ModuleVersionComposition"):
   mid=number(record.get("ModuleVID"))
   if mid in modules_by_vid:links[mid].add(number(record["TableVID"]))
  vids=set().union(*links.values()) if links else set()
  tables={}
  for t in rows(db,"TableVersion"):
   vid=number(t.get("TableVID"))
   if vid in vids and current(t,rid):
    tables[vid]={"code":t.get("Code"),"name":t.get("Name"),"table_vid":vid,
      "table_id":number(t.get("TableID"))}
  out={"generated_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
       "provenance":"Official EBA DPM Access 4.3 technical package",
       "release_code":release.get("Code"),"release_id":rid,
       "archive_sha256":source["zip_sha256"],
       "scope":"active ModuleVersion and linked active TableVersion records",
       "modules":[]}
  for m in sorted(modules,key=lambda x:x.get("Code") or ""):
   mid=number(m.get("ModuleVID"))
   records=sorted((tables[v] for v in links[mid] if v in tables),
                  key=lambda x:(x["code"] or "",x["table_vid"]))
   out["modules"].append({"module_code":m.get("Code"),"module_name":m.get("Name"),
    "module_vid":mid,"module_version":m.get("VersionNumber"),
    "from_reference_date":m.get("FromReferenceDate"),
    "to_reference_date":m.get("ToReferenceDate"),
    "table_count":len(records),
    "tables":[dict(t,already_imported=t["code"] in IMPLEMENTED) for t in records]})
  target=next((m for m in out["modules"] if m["module_code"]=="COREP_OF"),None)
  if not target:raise RuntimeError("Official COREP_OF module missing")
  out["corep_of_summary"]={"table_count":target["table_count"],
    "imported_table_versions":sum(1 for x in target["tables"] if x["already_imported"]),
    "missing_table_versions":sum(1 for x in target["tables"] if not x["already_imported"]),
    "missing_tables":[{"code":x["code"],"name":x["name"]}
       for x in target["tables"] if not x["already_imported"]]}
  TARGET.parent.mkdir(parents=True,exist_ok=True)
  TARGET.write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
  print("Found COREP module codes:",[m["module_code"] for m in out["modules"]])
  print("COREP_OF linked table count:",target["table_count"])
  print("COREP_OF not imported:",out["corep_of_summary"]["missing_table_versions"])
  print("Saved",TARGET)

if __name__=="__main__":main()
