#!/usr/bin/env python3
"""Extract official COREP_OF C_01.00 through C_04.00 table versions from EBA 4.3.1.

Runs on GitHub Actions with mdbtools. All identifier values originate from the
published Access database, not from illustrative IFRS bridge mappings.
The large Access archive is used temporarily and is never committed.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"docs"/"data"/"corep_of_multitemplate.json"
URL="https://ebprstaewspublic01.blob.core.windows.net/public/tools-prod/documents/Big_Files/files/Reporting%20framework%204.3/DPM2%20Database_v%204_3.zip"
MAX_DOWNLOAD=750_000_000
ROW_RE=re.compile(r"\br(\d{3,4})\b",re.I)
COL_RE=re.compile(r"\bc(\d{3,4})\b",re.I)
TABLE_RE=re.compile(r"^C_0[1-4][.]00(?:$|[.])",re.I)

def number(value):
 try:return int(value)
 except (ValueError,TypeError):return None

def rows(db,table):
 """Return mdb-export rows as a stream; never materialize a large table."""
 p=subprocess.Popen(["mdb-export",str(db),table],stdout=subprocess.PIPE,
     stderr=subprocess.PIPE,encoding="utf-8",errors="replace",bufsize=1024*1024)
 try:
  for row in csv.DictReader(p.stdout):
   yield {k:(v if v!="" else None) for k,v in row.items() if k is not None}
 finally:
  if p.stdout:p.stdout.close()
  try:status=p.wait(timeout=30)
  except subprocess.TimeoutExpired:p.kill();status=p.wait()
  if status!=0:
   err=p.stderr.read(800) if p.stderr else ""
   raise RuntimeError("mdb-export "+table+" failed ("+str(status)+"): "+err)
  if p.stderr:p.stderr.close()

def current(record,release_id):
 start=number(record.get("StartReleaseID"))
 end=number(record.get("EndReleaseID"))
 return (start is None or start<=release_id) and (end is None or end>release_id)

def first_match(text,regex):
 m=regex.search(text or "")
 return m.group(1).zfill(4) if m else None

def download_archive(folder):
 archive=folder/"original.zip"
 req=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0 (compatible; EBA-DPM-Research/1.0)"})
 size=0
 digest=hashlib.sha256()
 with urllib.request.urlopen(req,timeout=120) as response,archive.open("wb") as stream:
  while True:
   block=response.read(2*1024*1024)
   if not block:break
   size+=len(block)
   if size>MAX_DOWNLOAD:raise ValueError("Archive larger than safety bound")
   digest.update(block)
   stream.write(block)
 with zipfile.ZipFile(archive) as bundle:
  members=[i for i in bundle.infolist() if i.filename.lower().endswith(".accdb")]
  if len(members)!=1:raise ValueError("Official ZIP must contain exactly one Access database")
  if members[0].file_size>1_200_000_000:raise ValueError("Access file too large")
  db=folder/"dpm.accdb"
  with bundle.open(members[0]) as src,db.open("wb") as out:shutil.copyfileobj(src,out)
 return db,{"source_url":URL,"zip_sha256":digest.hexdigest(),"zip_bytes":size,"access_filename":members[0].filename}

def build(db,provenance):
 releases=list(rows(db,"Release"))
 version=[r for r in releases if (r.get("Code") or "").startswith("4.3")]
 if not version:
  raise RuntimeError("No official 4.3 release code; inspect Release table before importing")
 release=max(version,key=lambda x:number(x.get("ReleaseID")) or 0)
 rid=number(release["ReleaseID"])
 print("Selected release:",release["Code"],rid)
 module_versions=[m for m in rows(db,"ModuleVersion") if (m.get("Code") or "").upper()=="COREP_OF"]
 active_modules=[m for m in module_versions if current(m,rid)]
 selected_modules=active_modules if active_modules else []
 modvids={number(m.get("ModuleVID")) for m in selected_modules}
 print("COREP_OF module versions:",len(module_versions),"active:",len(active_modules))
 table_versions=[t for t in rows(db,"TableVersion") if TABLE_RE.search(t.get("Code") or "")]
 active_tables=[t for t in table_versions if current(t,rid)]
 print("COREP capital adequacy table versions:",len(table_versions),"active:",len(active_tables))
 if not active_tables:raise RuntimeError("No COREP C 01-04 TableVersion active in selected EBA release")
 active_vids={number(t["TableVID"]) for t in active_tables}
 composition=[r for r in rows(db,"ModuleVersionComposition")
              if number(r.get("ModuleVID")) in modvids and number(r.get("TableVID")) in active_vids]
 linked_vids={number(c["TableVID"]) for c in composition}
 # Fail closed rather than falsely claiming a COREP_OF module link.
 if not linked_vids:
  raise RuntimeError("No active capital adequacy table linked to COREP_OF in this release")
 # Fail closed if any target template is not actually linked to COREP_OF.
 for prefix in ("C_01.00","C_02.00","C_03.00","C_04.00"):
  if not any((t.get("Code") or "")==prefix or (t.get("Code") or "").startswith(prefix+".")
             for t in active_tables if number(t.get("TableVID")) in linked_vids):
   raise RuntimeError("Expected COREP_OF template absent from DPM 4.3: "+prefix)
 table_by_vid={number(t["TableVID"]):t for t in active_tables if number(t["TableVID"]) in linked_vids}
 versions=[t for t in active_tables if number(t["TableVID"]) in linked_vids]
 cells=[]
 for c in rows(db,"TableVersionCell"):
  if number(c.get("TableVID")) not in linked_vids:continue
  code=c.get("CellCode") or ""
  row=first_match(code,ROW_RE);col=first_match(code,COL_RE)
  cells.append({"table_vid":number(c["TableVID"]),"table_code":table_by_vid[number(c["TableVID"])]["Code"],"cell_id":number(c["CellID"]),
      "variable_vid":number(c.get("VariableVID")),"cell_code":code,
      "row":row,"column":col,"is_excluded":number(c.get("IsExcluded")),
      "is_void":number(c.get("IsVoid")),"is_nullable":number(c.get("IsNullable")),
      "sign":c.get("Sign")})
 if not cells:raise RuntimeError("No actual cells found for chosen TableVID")
 print("Actual selected cells:",len(cells))
 vv_ids={c["variable_vid"] for c in cells if c["variable_vid"] is not None}
 versions_by_vid={}
 for v in rows(db,"VariableVersion"):
  vid=number(v.get("VariableVID"))
  if vid in vv_ids:
   versions_by_vid[vid]={"variable_vid":vid,"variable_id":number(v.get("VariableID")),
     "property_id":number(v.get("PropertyID")),"subcategory_vid":number(v.get("SubCategoryVID")),
     "context_id":number(v.get("ContextID")),"key_id":number(v.get("KeyID")),
     "code":v.get("Code"),"name":v.get("Name"),
     "start_release_id":number(v.get("StartReleaseID")),"end_release_id":number(v.get("EndReleaseID"))}
 contexts={x["context_id"] for x in versions_by_vid.values() if x["context_id"] is not None}
 context_members={}
 for r in rows(db,"ContextComposition"):
  ctx=number(r.get("ContextID"))
  if ctx in contexts:
   context_members.setdefault(ctx,[]).append({"property_id":number(r.get("PropertyID")),"item_id":number(r.get("ItemID"))})
 property_ids={v["property_id"] for v in versions_by_vid.values() if v["property_id"] is not None}
 item_ids=set()
 for parts in context_members.values():
  for part in parts:
   item_ids.add(part["item_id"])
   property_ids.add(part["property_id"])
 props={}
 for p in rows(db,"Property"):
  pid=number(p.get("PropertyID"))
  if pid in property_ids:
   props[pid]={"property_id":pid,"is_metric":number(p.get("IsMetric")),
               "data_type_id":number(p.get("DataTypeID")),"period_type":p.get("PeriodType")}
 items={}
 for i in rows(db,"Item"):
  iid=number(i.get("ItemID"))
  if iid in item_ids or iid in property_ids:
   items[iid]={"item_id":iid,"name":i.get("Name"),"description":i.get("Description")}
 item_categories={}
 for it in rows(db,"ItemCategory"):
  iid=number(it.get("ItemID"))
  if iid in item_ids and current(it,rid):
   item_categories.setdefault(iid,[]).append({"code":it.get("Code"),"signature":it.get("Signature"),"category_id":number(it.get("CategoryID"))})
 cellids={c["cell_id"] for c in cells}
 cell_layout={}
 headerids=set()
 for c in rows(db,"Cell"):
  cid=number(c.get("CellID"))
  if cid in cellids:
   rowid=number(c.get("RowID"));colid=number(c.get("ColumnID"));sheetid=number(c.get("SheetID"))
   cell_layout[cid]={"row_header_id":rowid,"column_header_id":colid,"sheet_header_id":sheetid}
   headerids.update(i for i in (rowid,colid,sheetid) if i is not None)
 headers={}
 for h in rows(db,"HeaderVersion"):
  hid=number(h.get("HeaderID"))
  if hid in headerids and current(h,rid):
   headers.setdefault(hid,[]).append({"code":h.get("Code"),"label":h.get("Label"),
      "header_vid":number(h.get("HeaderVID")),"context_id":number(h.get("ContextID"))})
 # Find official validation operations which actually contain tC_01.00.
 # Version state is read from DPM, NOT interpreted as EBA active/disabled filing status.
 ops=[]
 for v in rows(db,"OperationVersion"):
  expr=v.get("Expression") or ""
  if "C_01.00" in expr and current(v,rid):
   ops.append({"operation_id":number(v.get("OperationID")),"operation_vid":number(v.get("OperationVID")),
     "expression":expr[:18000],"description":(v.get("Description") or "")[:3000],
     "start_release_id":number(v.get("StartReleaseID")),"end_release_id":number(v.get("EndReleaseID")),
     "endorsement":v.get("Endorsement"),"variant_approved_flag":number(v.get("IsVariantApproved"))})
 opids={o["operation_id"] for o in ops}
 op_codes={}
 for o in rows(db,"Operation"):
  oid=number(o.get("OperationID"))
  if oid in opids:
   op_codes[oid]={"code":o.get("Code"),"type":o.get("Type"),"source":o.get("Source")}
 for o in ops:o.update(op_codes.get(o["operation_id"],{}))
 ops=sorted(ops,key=lambda x:x.get("code") or "")
 print("Official rules referencing C_01.00:",len(ops))
 for c in cells:
  v=versions_by_vid.get(c["variable_vid"])
  c["variable"]=v
  c["layout"]=cell_layout.get(c["cell_id"])
  if c["layout"]:
   c["headers"]={a:headers.get(i,[]) for a,i in c["layout"].items()}
  c["context_dimensions"]=[]
  if v:
   if v["property_id"] in props:
    c["metric_property"]=props[v["property_id"]]
   if v["property_id"] in items:
    c["metric_item_name"]=items[v["property_id"]].get("name")
   for part in context_members.get(v["context_id"],[]):
    property_id=part["property_id"];item_id=part["item_id"]
    c["context_dimensions"].append({"property_id":property_id,"item_id":item_id,
      "property":props.get(property_id),"member":items.get(item_id),
      "item_categories":item_categories.get(item_id,[])})
 cells=sorted(cells,key=lambda c:(c["table_code"],c["row"] or "",c["column"] or "",c["table_vid"],c["cell_id"]))
 return {"dataset":"EBA official DPM 2.0 COREP_OF C_01.00 through C_04.00",
  "generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
  "source":{**provenance,"release_code":release.get("Code"),"release_id":rid,
    "release_date":release.get("Date"),"reporting_family":"COREP_OF",
    "not_a_filing_engine":True},
  "module_versions":[{"module_vid":number(m["ModuleVID"]),"code":m.get("Code"),
    "name":m.get("Name"),"version":m.get("VersionNumber"),
    "from_ref_date":m.get("FromReferenceDate"),"to_ref_date":m.get("ToReferenceDate")}
    for m in selected_modules],
  "table_versions":[{"table_vid":number(t["TableVID"]),"table_id":number(t["TableID"]),
    "code":t.get("Code"),"name":t.get("Name"),"start_release_id":number(t.get("StartReleaseID")),
    "end_release_id":number(t.get("EndReleaseID"))} for t in versions],
  "table_module_links":[{"module_vid":number(t["ModuleVID"]),"table_vid":number(t["TableVID"])} for t in composition],
  "stats":{"cells":len(cells),"cells_per_template":{t["Code"]:sum(c["table_code"]==t["Code"] for c in cells) for t in versions},"variable_versions_found":len(versions_by_vid),
     "cells_without_variable_version":sum(c["variable"] is None for c in cells),
     "context_count":len(contexts),"rules":len(ops)},
  "cells":cells,"validation_rules":ops,
  "limitations":["Numbers such as CellID, TableVID and VariableVID are native Access DPM model IDs; not XBRL QNames.",
     "Metric and dimensional relationship reconstructed from VariableVersion and ContextComposition; any additional key/subcategory qualifiers require deeper DPM modeling.",
     "A rule present in a DPM snapshot is not proof that the rule is enabled for current filing.",
     "IFRS examples are separate editorial learning material, not present in the EBA database."]}

def main():
 with tempfile.TemporaryDirectory() as name:
  db,provenance=download_archive(pathlib.Path(name))
  result=build(db,provenance)
  OUTPUT.parent.mkdir(parents=True,exist_ok=True)
  OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
  print("Wrote",OUTPUT,"bytes",OUTPUT.stat().st_size)

if __name__=="__main__":
 main()
