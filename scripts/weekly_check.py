#!/usr/bin/env python3
"""Check official source reachability and flag potential EBA taxonomy releases.
No automatic interpretation of legal maturity or import of DPM data.
"""
import datetime as dt
import html
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
CATALOG = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
OUTPUT = DATA / "source_health.json"
NOW = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def inspect_source(item):
    request = urllib.request.Request(item["url"], headers={
        "User-Agent": "Mozilla/5.0 (compatible; DPMTaxonomyExplorerResearch/1.0)",
        "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=20) as response:
        code = response.status
        body = response.read(850000).decode("utf-8", "replace")
    if len(body.strip()) < 100:
        raise RuntimeError("Empty or truncated response")
    clean = html.unescape(re.sub("<[^>]+>", " ", body))
    versions = sorted(set(re.findall(
        r"(?:reporting[- ]framework|release|framework[- ])\s*(?:v\.?\s*)?(4\.\d+)", clean, re.I)))
    return {"state": "reachable", "http_status": code, "checked_utc": NOW,
            "possible_versions_in_page": versions}

def main():
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
    entries = {}
    discovered = set()
    for item in CATALOG["sources"]:
        try:
            result = inspect_source(item)
            discovered.update(result["possible_versions_in_page"])
        except Exception as exc:
            result = {"state": "unavailable", "checked_utc": NOW,
                      "error": (type(exc).__name__ + ": " + str(exc))[:250]}
        entries[item["id"]] = result
    known = {item["id"] for item in CATALOG["releases"]}
    candidates = set(previous.get("new_release_candidates_for_manual_review", []))
    candidates.update(x for x in discovered if re.fullmatch(r"4\.\d+", x) and x not in known)
    status = {
        "last_run_utc": NOW,
        "note": "Source availability does not guarantee exhaustive coverage or import of taxonomy packages.",
        "sources": entries,
        "curated_release_count": len(known),
        "new_release_candidates_for_manual_review": sorted(candidates)}
    OUTPUT.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    reachable = sum(v["state"] == "reachable" for v in entries.values())
    print(f"Sources reachable: {reachable}/{len(entries)}. New candidate versions: {sorted(candidates)}")
    if not reachable:
        print("All institutional sources inaccessible; do not infer that no updates occurred.")

if __name__ == "__main__":
    main()
