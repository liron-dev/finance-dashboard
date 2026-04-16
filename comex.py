#!/usr/bin/env python3
"""COMEX warehouse inventory (gold + silver registered/eligible) → Supabase.

Downloads daily Excel reports from CME Group, parses TOTAL row.
Graceful failure: exits 0 on download errors to avoid blocking other scripts.
"""
import argparse, os, sys
from datetime import date
from io import BytesIO

import pandas as pd, requests

# ── Config ────────────────────────────────────────────────────────────────────
CME_BASE = "https://www.cmegroup.com/delivery_reports"
METALS = {"gold": "Gold_Stocks.xls", "silver": "Silver_stocks.xls"}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.cmegroup.com/clearing/operations-and-deliveries/nymex-delivery-notices.html",
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
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        resp = session.get(url, timeout=30)
        if resp.status_code == 403:
            print(f"  [!] {metal}: CME returned 403 (Cloudflare blocked)", file=sys.stderr)
            return None
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  [!] {metal}: download failed: {e}", file=sys.stderr)
        return None

    try:
        df = pd.read_excel(BytesIO(resp.content), engine="xlrd")
        # Find TOTAL row by string matching
        total_mask = df.apply(lambda row: row.astype(str).str.strip().str.upper().eq("TOTAL").any(), axis=1)
        if not total_mask.any():
            print(f"  [!] {metal}: no TOTAL row found in Excel", file=sys.stderr)
            return None

        total_row = df[total_mask].iloc[0]
        # Find Registered and Eligible columns by header matching
        headers = df.iloc[0] if len(df) > 0 else pd.Series()
        reg_col, elig_col = None, None
        for i, h in enumerate(df.columns):
            col_str = str(headers.get(h, h)).upper().strip()
            if "REGISTERED" in col_str and reg_col is None:
                reg_col = h
            elif "ELIGIBLE" in col_str and elig_col is None:
                elig_col = h

        # Fallback: try numeric columns from total row
        if reg_col is None or elig_col is None:
            nums = pd.to_numeric(total_row, errors="coerce").dropna()
            if len(nums) >= 2:
                registered = float(nums.iloc[0])
                eligible = float(nums.iloc[1])
            else:
                print(f"  [!] {metal}: couldn't parse registered/eligible", file=sys.stderr)
                return None
        else:
            registered = float(pd.to_numeric(total_row[reg_col], errors="coerce"))
            eligible = float(pd.to_numeric(total_row[elig_col], errors="coerce"))

        # Sanity check
        if registered <= 0 or eligible <= 0:
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

    print("── COMEX inventory ──")
    records = []
    for metal, filename in METALS.items():
        result = fetch_comex(metal, filename)
        if result:
            records.append(result)

    if not records:
        print("\n[warn] No COMEX data fetched. Existing data preserved.", file=sys.stderr)
        return  # exit 0 — graceful failure

    if args.push:
        push_comex(records)
    else:
        print("\n(dry run — use --push to write to Supabase)")

if __name__ == "__main__":
    main()
