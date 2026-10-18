#!/usr/bin/env python3
"""Temporary official EBA connectivity probe; stores metadata, not third-party content."""
import datetime,json,re,urllib.request,urllib.error,html
from pathlib import Path
url="https://www.eba.europa.eu/risk-and-data-analysis/reporting/reporting-frameworks/reporting-framework-43"
r={"url":url,"checked_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"status":"unknown"}
try:
 request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36","Accept":"text/html,application/xhtml+xml","Accept-Language":"en-GB,en;q=0.9"})
 with urllib.request.urlopen(request,timeout=35) as resp:
  page=resp.read(8000000).decode("utf-8","replace")
  r["http_status"]=resp.status;r["html_bytes"]=len(page);r["status"]="html_accessible"
  a=re.search(r"3[.]A DPM 4[.]3[.]1",re.sub(r'<[^>]+>',' ',page),re.I)
  links=re.findall(r'<a\b[^>]*href=["\x27]([^"\x27]+)["\x27][^>]*>(.*?)</a>',page,re.I|re.S)
  r["links_count"]=len(links)
  r["candidate_links"]=[{"href":html.unescape(href),"label":re.sub(r'<[^>]+>',' ',label).strip()[:120]} for href,label in links if re.search(r'dpm|categorization|database|data.point',href+' '+label,re.I)][:60]
  r["mentions"]= []
  for m in list(re.finditer(r'DPM database 2[.]0|data point categorization',page,re.I))[:8]:
   r["mentions"].append(re.sub(r"\s+"," ",page[max(0,m.start()-800):m.end()+900])[:1700])
except Exception as e:
 r["status"]="blocked_or_unavailable";r["error"]=type(e).__name__+": "+str(e)[:400]
p=Path("docs/data/eba_4_3_download_probe.json")
p.parent.mkdir(parents=True,exist_ok=True)
p.write_text(json.dumps(r,indent=2,ensure_ascii=False)+"\n")
print("EBA connectivity status",r["status"],r.get("http_status"),"links",r.get("links_count"))
