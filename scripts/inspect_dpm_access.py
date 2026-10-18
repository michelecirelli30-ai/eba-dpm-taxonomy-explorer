#!/usr/bin/env python3
"""Inspect the authentic EBA 4.3.1 Microsoft Access DPM 2.0 schema.
Access file is downloaded to a temporary directory and not committed.
Requires mdbtools (mdb-tables, mdb-schema) on the GitHub runner.
"""
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

URL="https://ebprstaewspublic01.blob.core.windows.net/public/tools-prod/documents/Big_Files/files/Reporting%20framework%204.3/DPM2%20Database_v%204_3.zip"
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"docs"/"data"/"dpm_431_access_schema.json"
KEYWORDS=re.compile(r"(table|template|cell|metric|dimension|module|validation|variable|hierarchy|package|release|datapoint|data.point|framework|ordinate|axis|item|member|version)",re.I)
MAX_SCHEMA_TABLES=48
MAX_ARCHIVE=750_000_000

def run(args,timeout=80):
 res=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 return {"status":res.returncode,"stdout":res.stdout[:12000],"stderr":res.stderr[:1200]}

def main():
 report={"checked_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"source":"Official EBA DPM 4.3.1 Access archive","source_url":URL,"status":"started","full_database_not_published":True}
 try:
  with tempfile.TemporaryDirectory() as work:
   folder=pathlib.Path(work)
   archive=folder/"dpm.zip"
   request=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0 (compatible; EBA-DPM-Research/1.0)"})
   size=0;digest=hashlib.sha256()
   with urllib.request.urlopen(request,timeout=90) as response,archive.open("wb") as sink:
    while True:
     b=response.read(2*1024*1024)
     if not b:break
     size+=len(b)
     if size>MAX_ARCHIVE:raise ValueError("Archive exceeds resource limit")
     sink.write(b);digest.update(b)
   report["zip_bytes"]=size
   report["zip_sha256"]=digest.hexdigest()
   with zipfile.ZipFile(archive) as zipf:
    dbs=[i for i in zipf.infolist() if i.filename.lower().endswith((".accdb",".mdb"))]
    if len(dbs)!=1:raise ValueError("Expected precisely one Access database")
    dbinfo=dbs[0]
    if dbinfo.file_size>1_200_000_000:raise ValueError("Access DB unexpectedly large")
    db=folder/"official.accdb"
    with zipf.open(dbinfo) as src,db.open("wb") as dest:shutil.copyfileobj(src,dest)
    report["database_name"]=dbinfo.filename
    report["database_bytes"]=dbinfo.file_size
   tables=run(["mdb-tables","-1",str(db)],timeout=140)
   report["mdb_tables"]={"exit_status":tables["status"],"stderr":tables["stderr"]}
   if tables["status"]!=0:raise RuntimeError("mdb-tables failed: "+tables["stderr"][:350])
   names=[s.strip() for s in tables["stdout"].splitlines() if s.strip()]
   # mdb-tables output may be truncated by helper; use an uncapped subprocess for table listing.
   listing=subprocess.run(["mdb-tables","-1",str(db)],capture_output=True,text=True,timeout=140,check=True)
   names=[x.strip() for x in listing.stdout.splitlines() if x.strip()]
   report["table_count"]=len(names)
   report["table_names"]=names
   important=[x for x in names if KEYWORDS.search(x)]
   report["relevant_table_names"]=important
   # Write DDL for selected candidate schema tables only; avoid storing private or large real reporting data.
   selection=important[:MAX_SCHEMA_TABLES]
   report["schema_inspected"]={}
   for t in selection:
    try:
     result=run(["mdb-schema",str(db),"sqlite",t],timeout=25)
     report["schema_inspected"][t]={"exit_status":result["status"],"ddl":result["stdout"][:6500],"stderr":result["stderr"][:300]}
    except Exception as e:report["schema_inspected"][t]={"error":str(e)[:200]}
   report["schema_inspected_count"]=len(selection)
   report["status"]="schema_extracted"
 except Exception as e:
  report["status"]="failed"
  report["error"]=type(e).__name__+": "+str(e)[:400]
 OUTPUT.parent.mkdir(parents=True,exist_ok=True)
 OUTPUT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
 print("DPM Access schema status:",report["status"],"tables:",report.get("table_count"),"DDL:",report.get("schema_inspected_count"),"error:",report.get("error"))

if __name__=="__main__":main()
