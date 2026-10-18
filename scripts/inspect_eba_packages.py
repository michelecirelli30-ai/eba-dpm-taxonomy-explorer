#!/usr/bin/env python3
"""Inspect OFFICIAL EBA DPM release 4.3 archives from GitHub Actions.
No executable files are run; report records a bounded archive manifest.
"""
import collections
import datetime
import hashlib
import json
import os
import pathlib
import tempfile
import urllib.error
import urllib.request
import zipfile
from urllib.parse import urlsplit

URLS={
 "dpm_database_2_0":"https://ebprstaewspublic01.blob.core.windows.net/public/tools-prod/documents/Big_Files/files/Reporting%20framework%204.3/DPM2%20Database_v%204_3.zip",
 "dpm_table_layouts":"https://www.eba.europa.eu/sites/default/files/2026-07/71f710c3-111a-4976-9731-bc9bdaa2036c/c.%20DPM%20Table%20Layouts%20and%20data%20point%20categorisation.zip"
}
ROOT=pathlib.Path(__file__).resolve().parents[1]
TARGET=ROOT/"docs"/"data"/"official_package_manifest.json"
MAX_BYTES=700*1024*1024

def inspect(name,url,tempdir):
 output={"url":url,"state":"not_downloaded"}
 dest=tempdir/(name+".zip")
 try:
  request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36","Accept":"application/zip,application/octet-stream,*/*"})
  with urllib.request.urlopen(request,timeout=90) as r,open(dest,"wb") as w:
   output["http_status"]=r.status
   output["content_type"]=r.headers.get("Content-Type")
   digest=hashlib.sha256();size=0
   while True:
    block=r.read(1024*1024)
    if not block:break
    size+=len(block)
    if size>MAX_BYTES:raise ValueError("Archive exceeds inspection size limit")
    digest.update(block);w.write(block)
   output["download_bytes"]=size
   output["sha256"]=digest.hexdigest()
  with zipfile.ZipFile(dest) as z:
   infos=z.infolist()
   by_ext=collections.Counter(pathlib.PurePosixPath(i.filename).suffix.lower() or "(none)" for i in infos if not i.is_dir())
   output["state"]="downloaded_and_readable"
   output["entries_count"]=len(infos)
   output["uncompressed_bytes"]=sum(i.file_size for i in infos)
   output["extensions"]=dict(by_ext.most_common())
   output["sample_entries"]=[{"path":i.filename,"bytes":i.file_size} for i in infos[:170]]
   output["candidate_database_files"]=[{"path":i.filename,"bytes":i.file_size} for i in infos if pathlib.PurePosixPath(i.filename).suffix.lower() in (".accdb",".mdb",".sqlite",".db",".msi",".csv",".xlsx",".zip")][:100]
  print(name,output["state"],output["download_bytes"],"bytes",output["entries_count"],"entries")
 except Exception as e:
  output["state"]="unavailable_or_unreadable"
  output["error"]=(type(e).__name__+": "+str(e))[:500]
  print(name,output["state"],output["error"])
 finally:
  if dest.exists():dest.unlink()
 return output

def main():
 import tempfile
 output={"checked_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"source":"EBA Reporting framework 4.3 > 3.A DPM 4.3.1","archive_content_not_committed":True,"packages":{}}
 with tempfile.TemporaryDirectory() as t:
  for name,url in URLS.items():output["packages"][name]=inspect(name,url,pathlib.Path(t))
 TARGET.parent.mkdir(parents=True,exist_ok=True)
 TARGET.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("Wrote",TARGET)

if __name__=="__main__":main()
