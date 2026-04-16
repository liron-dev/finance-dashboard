#!/usr/bin/env python3
"""COMEX warehouse inventory (gold + silver registered/eligible) → Supabase.

Uses curl_cffi to impersonate a real Chrome browser's TLS fingerprint, which
bypasses CME Group's Cloudflare bot protection that blocks plain `requests`.
Graceful failure: exits 0 on download errors to avoid blocking other scripts.
"""
import argparse, os, sys
from datetime import date
from io import BytesIO

import pandas as pd
from curl_cffi import requests as curl_requests

# ── Config ────────────────────────────────────────────────────────────────────
CME_BASE = "https://www.cmegroup.com/delivery_reports"
METALS = {"gold": "Gold_Stocks.xls", "silver": "Silver_stocks.xls"}
IMPERSONATE = "chrome124"  # curl_cffi impersonation profile
HEADERS = {
    "Accept": "application/vnd.ms-excel,application/octet-stream,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.cmegroup.com/markets/metals/precious/gold.quotes.html",
}

# ── Supabase helper ──────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)

# ── Download + parse ─────────────────────────────────────────────────────────
def fetch_comex(metal: str, filename: str) -> dict | None:
    url = f"{CME_BASE}/{filename}"
    try:
        # curl_cffi with chrome impersonation defeats Cloudflare TLS fingerprinting
        resp = curl_requests.get(url, headers=HEADERS, impersonate=IMPERSONATE, timeout=30)
        if resp.status_code == 403:
            print(f"  [!] {metal}: 403 even with curl_cffi — CME may have tightened", file=sys.stderr)
            return None
        resp.raise_for_status()
    except Exception as e:
        print(f"  [!] {metal}: download failed: {e}", file=sys.stderr)
        return None

    try:
        # Read with no header — the file has a multi-row banner and per-depository blocks
        df = pd.read_excel(BytesIO(resp.content), engine="xlrd", header=None)
        # Find the grand-total rows: "TOTAL REGISTERED" and "TOTAL ELIGIBLE"
        # Column 0 holds the label; column 7 ("TOTAL TODAY") holds the current-day value.
        labels = df[0].astype(str).str.strip().str.upper()
        reg_rows = df[labels == "TOTAL REGISTERED"]
        elig_rows = df[labels == "TOTAL ELIGIBLE"]
        if reg_rows.empty or elig_rows.empty:
            print(f"  [!] {metal}: missing TOTAL REGISTERED / TOTAL ELIGIBLE row", file=sys.stderr)
            return None

        registered = float(pd.to_numeric(reg_rows.iloc[0, 7], errors="coerce"))
        eligible = float(pd.to_numeric(elig_rows.iloc[0, 7], errors="coerce"))

        if not (registered > 0 and eligible > 0):
            print(f"  [!] {metal}: invalid values reg={registered} elig={eligible}", file=sys.stderr)
            return None

        print(f"  {metal}: registered={registered:,.0f} oz, eligible={eligible:,.0f} oz")
        return {"metal": metal, "date": date.today().isoformat(),
                "registered": registered, "eligible": eligible}
    except Exception as e:
        print(f"  [!] {metal}: parse error: {e}", file=sys.stderr)
        return None

# ── Push to Supabase ─────────────────────────────────────────────────────────
def push_comex(records: list[dict]):
    sb = _sb()
    sb.table("comex_inventory").upsert(records).execute()
    print(f"[Supabase] comex_inventory: {len(records)} rows upserted")

# ── Entry point ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="COMEX warehouse inventory → Supabase")
    ap.add_argument("--push", action="store_true", help="Push data to Supabase")
    args = ap.parse_args()

    print("── COMEX inventory (curl_cffi + chrome impersonation) ──")
    records = []
    for metal, filename in METALS.items():
        result = fetch_comex(metal, filename)
        if result:
            records.append(result)

    if not records:
        print("\n[warn] No COMEX data fetched. Existing data preserved.", file=sys.stderr)
        return

    if args.push:
        push_comex(records)
    else:
        print("\n(dry run — use --push to write to Supabase)")

if __name__ == "__main__":
    main()
