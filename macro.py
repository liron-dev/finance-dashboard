#!/usr/bin/env python3
"""Macro indicators, spot prices, credit managers, and COT positioning → Supabase.

Powers panels: Money Printing, Credit Crisis, Credit Managers, Institutional Positioning.
"""
import argparse, os, sys
from datetime import date, timedelta

import pandas as pd, requests, yfinance as yf
from fredapi import Fred

# ── Config ────────────────────────────────────────────────────────────────────
FRED_SERIES = ["M2SL", "BAMLH0A0HYM2", "DFF", "T10Y2Y", "PAYEMS", "PCEPI", "BAMLC0A4CBBB"]
FRED_HISTORY_YEARS = 2
SPOT_TICKERS = {"GOLD_SPOT": "GC=F", "SILVER_SPOT": "SI=F"}
SPOT_HISTORY_YEARS = 5
CREDIT_MANAGERS = ["BLK", "BX", "OWL", "APO", "KKR", "ARES"]
COT_URL = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json"
COT_METALS = {"gold": "GOLD", "silver": "SILVER"}
COT_HISTORY_YEARS = 5
COT_INDEX_LOOKBACK_YEARS = 3
OZ_PER_CONTRACT = {"gold": 100, "silver": 5000}

# ── Supabase helper ──────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)

# ── 1. FRED series ───────────────────────────────────────────────────────────
def fetch_fred(api_key: str) -> list[dict]:
    fred = Fred(api_key=api_key)
    start = date.today() - timedelta(days=FRED_HISTORY_YEARS * 365)
    rows = []
    for sid in FRED_SERIES:
        try:
            s = fred.get_series(sid, observation_start=start)
            for dt, val in s.dropna().items():
                rows.append({"series_id": sid, "date": dt.strftime("%Y-%m-%d"), "value": round(float(val), 6)})
            print(f"  FRED {sid}: {len(s.dropna())} points")
        except Exception as e:
            print(f"  [!] FRED {sid}: {e}", file=sys.stderr)
    return rows

# ── 2. Spot prices (gold/silver, 5yr daily) ─────────────────────────────────
def fetch_spot_prices() -> list[dict]:
    rows = []
    start = date.today() - timedelta(days=SPOT_HISTORY_YEARS * 365)
    for series_id, ticker in SPOT_TICKERS.items():
        try:
            df = yf.download(ticker, start=start.isoformat(), progress=False)
            if df.empty:
                print(f"  [!] {series_id}: no data", file=sys.stderr)
                continue
            # Handle multi-level columns from yfinance
            close = df["Close"].squeeze() if isinstance(df["Close"], pd.DataFrame) else df["Close"]
            for dt, val in close.dropna().items():
                rows.append({"series_id": series_id, "date": dt.strftime("%Y-%m-%d"), "value": round(float(val), 4)})
            print(f"  {series_id}: {len(close.dropna())} daily prices")
        except Exception as e:
            print(f"  [!] {series_id}: {e}", file=sys.stderr)
    return rows

# ── 3. Credit managers ──────────────────────────────────────────────────────
def fetch_credit_managers() -> tuple[list[dict], list[dict]]:
    today = date.today()
    year_start = f"{today.year}-01-01"
    managers, history = [], []
    for sym in CREDIT_MANAGERS:
        try:
            t = yf.Ticker(sym)
            info = t.info or {}
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            name = info.get("shortName") or info.get("longName") or sym

            # YTD daily history (first trading day = jan1_price)
            hist = yf.download(sym, start=year_start, progress=False)
            if hist.empty or price is None:
                print(f"  [!] {sym}: missing data", file=sys.stderr)
                continue
            close = hist["Close"].squeeze() if isinstance(hist["Close"], pd.DataFrame) else hist["Close"]
            jan1_price = float(close.iloc[0])
            ytd_pct = round((price / jan1_price - 1) * 100, 2)

            managers.append({
                "ticker": sym, "name": name[:50], "price": round(price, 2),
                "jan1_price": round(jan1_price, 2), "ytd_pct": ytd_pct,
                "updated_at": today.isoformat()
            })
            for dt, val in close.dropna().items():
                history.append({"ticker": sym, "date": dt.strftime("%Y-%m-%d"), "close": round(float(val), 2)})
            print(f"  {sym}: ${price:.2f} (YTD {ytd_pct:+.1f}%)")
        except Exception as e:
            print(f"  [!] {sym}: {e}", file=sys.stderr)
    return managers, history

# ── 4. CFTC COT positioning ─────────────────────────────────────────────────
def fetch_cot() -> list[dict]:
    rows = []
    cutoff = (date.today() - timedelta(days=COT_HISTORY_YEARS * 365)).isoformat()
    for metal_key, commodity_name in COT_METALS.items():
        try:
            resp = requests.get(COT_URL, params={
                "$where": f"commodity_name='{commodity_name}' AND report_date_as_yyyy_mm_dd>'{cutoff}'",
                "$order": "report_date_as_yyyy_mm_dd ASC",
                "$limit": 5000,
                "$select": "report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all,open_interest_all"
            }, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if not data:
                print(f"  [!] COT {metal_key}: no data", file=sys.stderr)
                continue

            # Parse and deduplicate by report_date (API may return multiple rows per date)
            by_date: dict[str, dict] = {}
            for r in data:
                rd = r["report_date_as_yyyy_mm_dd"][:10]
                mm_long = int(r["m_money_positions_long_all"])
                mm_short = int(r["m_money_positions_short_all"])
                by_date[rd] = {
                    "metal": metal_key, "report_date": rd,
                    "mm_long": mm_long, "mm_short": mm_short,
                    "mm_net": mm_long - mm_short,
                    "open_interest": int(r["open_interest_all"]),
                    "cot_index": None
                }
            parsed = list(by_date.values())

            # Compute COT Index: 100 * (current_net - min_3yr) / (max_3yr - min_3yr)
            lookback_cutoff = (date.today() - timedelta(days=COT_INDEX_LOOKBACK_YEARS * 365)).isoformat()
            nets_3yr = [p["mm_net"] for p in parsed if p["report_date"] >= lookback_cutoff]
            if nets_3yr:
                min_net, max_net = min(nets_3yr), max(nets_3yr)
                for p in parsed:
                    if p["report_date"] >= lookback_cutoff:
                        if max_net == min_net:
                            p["cot_index"] = 50.0
                        else:
                            p["cot_index"] = round(100 * (p["mm_net"] - min_net) / (max_net - min_net), 2)

            rows.extend(parsed)
            latest = parsed[-1]
            print(f"  COT {metal_key}: {len(parsed)} weeks, latest index={latest['cot_index']}")
        except Exception as e:
            print(f"  [!] COT {metal_key}: {e}", file=sys.stderr)
    return rows

# ── 5. Push to Supabase ─────────────────────────────────────────────────────
def push_all(macro_rows, spot_rows, managers, history, cot_rows):
    sb = _sb()
    all_macro = macro_rows + spot_rows
    today = date.today().isoformat()

    # macro_indicators: upsert
    if all_macro:
        # Batch upsert in chunks of 500
        for i in range(0, len(all_macro), 500):
            sb.table("macro_indicators").upsert(all_macro[i:i+500]).execute()
        print(f"[Supabase] macro_indicators: {len(all_macro)} rows upserted")

    # credit_managers: upsert (avoids delete gap)
    if managers:
        sb.table("credit_managers").upsert(managers).execute()
        print(f"[Supabase] credit_managers: {len(managers)} rows upserted")

    # credit_manager_history: upsert
    if history:
        for i in range(0, len(history), 500):
            sb.table("credit_manager_history").upsert(history[i:i+500]).execute()
        print(f"[Supabase] credit_manager_history: {len(history)} rows upserted")

    # cot_positioning: upsert
    if cot_rows:
        for i in range(0, len(cot_rows), 500):
            sb.table("cot_positioning").upsert(cot_rows[i:i+500]).execute()
        print(f"[Supabase] cot_positioning: {len(cot_rows)} rows upserted")

# ── 6. Entry point ──────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Macro indicators + credit managers + COT → Supabase")
    ap.add_argument("--push", action="store_true", help="Push data to Supabase")
    ap.add_argument("--limit", type=int, default=0, help="Limit credit managers (dev)")
    args = ap.parse_args()

    fred_key = os.getenv("FRED_API_KEY", "")
    if not fred_key:
        sys.exit("[error] Set FRED_API_KEY env var.")

    print("── FRED series ──")
    macro_rows = fetch_fred(fred_key)

    print("\n── Spot prices (5yr) ──")
    spot_rows = fetch_spot_prices()

    print("\n── Credit managers ──")
    managers, history = fetch_credit_managers()

    print("\n── COT positioning ──")
    cot_rows = fetch_cot()

    # Summary
    print(f"\n── Summary ──")
    print(f"  FRED rows:    {len(macro_rows)}")
    print(f"  Spot rows:    {len(spot_rows)}")
    print(f"  Managers:     {len(managers)}")
    print(f"  History rows: {len(history)}")
    print(f"  COT rows:     {len(cot_rows)}")

    if args.push:
        push_all(macro_rows, spot_rows, managers, history, cot_rows)
    else:
        print("\n(dry run — use --push to write to Supabase)")

if __name__ == "__main__":
    main()
