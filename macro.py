#!/usr/bin/env python3
"""Macro indicators, spot prices, credit managers, and COT positioning → Supabase.

Powers panels: Money Printing, Credit Crisis, Credit Managers, Institutional Positioning.
"""
import argparse, bisect, os, sys
from datetime import date, timedelta
from statistics import median

import pandas as pd, requests, yfinance as yf
from fredapi import Fred

# ── Config ────────────────────────────────────────────────────────────────────
FRED_SERIES = ["M2SL", "BAMLH0A0HYM2", "DFF", "T10Y2Y", "PAYEMS", "PCEPI", "BAMLC0A4CBBB"]
FRED_HISTORY_YEARS = 2
# Spot tickers displayed in SpotTicker + charts. S&P 500 / Nasdaq 100 / Brent added for the header strip.
SPOT_TICKERS = {
    "GOLD_SPOT": "GC=F",
    "SILVER_SPOT": "SI=F",
    "SPX_SPOT": "^GSPC",
    "NDX_SPOT": "^NDX",
    "BRENT_SPOT": "BZ=F",
}
SPOT_HISTORY_YEARS = 5
CREDIT_MANAGERS = ["BLK", "BX", "OWL", "APO", "KKR", "ARES"]
COT_URL_COMBINED = "https://publicreporting.cftc.gov/resource/kh3c-gbw2.json"  # Disaggregated Futures+Options Combined
COT_URL_FUTURES_ONLY = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json"  # Disaggregated Futures-Only
COT_METALS = {"gold": ("GOLD", "088691"), "silver": ("SILVER", "084691")}
COT_HISTORY_YEARS = 5
COT_INDEX_LOOKBACK_YEARS = 3
COT_PERF_YEARS = 3  # "What happened next?" table window (Felix/Goat Academy uses 3 years)
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
def _cot_fetch(url: str, contract_code: str, cutoff: str, select: str) -> list[dict]:
    resp = requests.get(url, params={
        "$where": f"cftc_contract_market_code='{contract_code}' AND report_date_as_yyyy_mm_dd>'{cutoff}'",
        "$order": "report_date_as_yyyy_mm_dd ASC",
        "$limit": 5000,
        "$select": select,
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()

def fetch_cot() -> list[dict]:
    """Williams COT Index on Commercial Long Ratio, 3yr rolling min-max.

    Commercial Long Ratio and managed-money positions come from the
    Disaggregated Futures+Options Combined report — this is what matches Felix
    Prehn's "Smart Money Meter" latest values exactly.

    Open interest stored here comes from the Disaggregated Futures-ONLY report
    because that's what the Paper/Physical ratio in Felix's dashboard divides
    by registered COMEX ounces (gold ≈ 2.2×, silver ≈ 7.5×).
    """
    rows = []
    cutoff = (date.today() - timedelta(days=COT_HISTORY_YEARS * 365)).isoformat()
    for metal_key, (commodity_name, contract_code) in COT_METALS.items():
        try:
            combined = _cot_fetch(
                COT_URL_COMBINED, contract_code, cutoff,
                "report_date_as_yyyy_mm_dd,"
                "prod_merc_positions_long,prod_merc_positions_short,"
                "swap_positions_long_all,swap__positions_short_all,"
                "m_money_positions_long_all,m_money_positions_short_all,"
                "open_interest_all"
            )
            if not combined:
                print(f"  [!] COT {metal_key}: no data", file=sys.stderr)
                continue
            fo = _cot_fetch(
                COT_URL_FUTURES_ONLY, contract_code, cutoff,
                "report_date_as_yyyy_mm_dd,open_interest_all"
            )
            fo_by_date = {r["report_date_as_yyyy_mm_dd"][:10]: int(r["open_interest_all"]) for r in fo}

            parsed = []
            for r in combined:
                rd = r["report_date_as_yyyy_mm_dd"][:10]
                pm_long = int(r["prod_merc_positions_long"])
                pm_short = int(r["prod_merc_positions_short"])
                sw_long = int(r["swap_positions_long_all"])
                sw_short = int(r["swap__positions_short_all"])
                mm_long = int(r["m_money_positions_long_all"])
                mm_short = int(r["m_money_positions_short_all"])
                comm_long = pm_long + sw_long
                comm_short = pm_short + sw_short
                comm_lr = comm_long / (comm_long + comm_short) if (comm_long + comm_short) else 0.0
                parsed.append({
                    "metal": metal_key,
                    "report_date": rd,
                    "mm_long": mm_long, "mm_short": mm_short,
                    "mm_net": mm_long - mm_short,
                    # Futures-only OI powers Paper/Physical on the frontend.
                    # Fall back to combined OI only if the Futures-Only report
                    # is missing that specific date (very rare).
                    "open_interest": fo_by_date.get(rd, int(r["open_interest_all"])),
                    "_comm_lr": comm_lr,
                    "cot_index": None,
                })

            # Rolling Williams COT on Commercial Long Ratio: for each row, find
            # min/max over prior N weeks (including itself), then
            # index = 100 * (v - min) / (max - min).
            window = COT_INDEX_LOOKBACK_YEARS * 52
            for i, p in enumerate(parsed):
                start = max(0, i - window + 1)
                w = [q["_comm_lr"] for q in parsed[start:i + 1]]
                mn, mx = min(w), max(w)
                if mx == mn:
                    p["cot_index"] = 50.0
                else:
                    p["cot_index"] = round(100 * (p["_comm_lr"] - mn) / (mx - mn), 2)

            for p in parsed:
                p.pop("_comm_lr", None)

            rows.extend(parsed)
            latest = parsed[-1]
            print(f"  COT {metal_key}: {len(parsed)} weeks, latest index={latest['cot_index']}, "
                  f"OI(FO)={latest['open_interest']:,}")
        except Exception as e:
            print(f"  [!] COT {metal_key}: {e}", file=sys.stderr)
    return rows

# ── 5. Historical performance table (COT score → price changes) ────────────
SCORE_BUCKETS = ["0-20", "21-40", "41-60", "61-80", "81-100"]
METAL_SPOT_MAP = {"gold": "GOLD_SPOT", "silver": "SILVER_SPOT"}

def _find_nearest_price(target: str, by_date: dict, sorted_dates: list) -> float | None:
    """Find price on target date or nearest trading day within 5 days."""
    if target in by_date:
        return by_date[target]
    idx = bisect.bisect_left(sorted_dates, target)
    best, best_diff = None, 6
    for i in (idx, idx - 1):
        if 0 <= i < len(sorted_dates):
            diff = abs((date.fromisoformat(sorted_dates[i]) - date.fromisoformat(target)).days)
            if diff < best_diff:
                best, best_diff = sorted_dates[i], diff
    return by_date[best] if best else None

def _bucket(score: float) -> str:
    if score <= 20: return "0-20"
    if score <= 40: return "21-40"
    if score <= 60: return "41-60"
    if score <= 80: return "61-80"
    return "81-100"

def compute_cot_performance(cot_rows: list[dict], spot_rows: list[dict]) -> list[dict]:
    """Cross-reference COT scores with spot prices to compute median price
    changes at 30-day and 90-day horizons per score bucket.

    This powers the "WHAT HAPPENED NEXT?" table in the gold/silver
    institutional positioning panel (Felix Prehn style 1-100 dashboard).
    """
    # Build price lookup: series_id → {date_str → price}
    prices: dict[str, dict[str, float]] = {}
    for r in spot_rows:
        prices.setdefault(r["series_id"], {})[r["date"]] = r["value"]

    results = []
    for metal in ("gold", "silver"):
        spot_key = METAL_SPOT_MAP[metal]
        by_date = prices.get(spot_key, {})
        if not by_date:
            print(f"  [!] COT perf {metal}: no spot prices", file=sys.stderr)
            continue
        sorted_dates = sorted(by_date)

        # Collect price changes per bucket
        bucket_30: dict[str, list[float]] = {b: [] for b in SCORE_BUCKETS}
        bucket_90: dict[str, list[float]] = {b: [] for b in SCORE_BUCKETS}

        perf_cutoff = (date.today() - timedelta(days=COT_PERF_YEARS * 365)).isoformat()
        metal_cot = [
            r for r in cot_rows
            if r["metal"] == metal
            and r.get("cot_index") is not None
            and r["report_date"] >= perf_cutoff
        ]
        for row in metal_cot:
            base = _find_nearest_price(row["report_date"], by_date, sorted_dates)
            if base is None or base == 0:
                continue
            b = _bucket(row["cot_index"])
            d = date.fromisoformat(row["report_date"])

            p30 = _find_nearest_price((d + timedelta(days=30)).isoformat(), by_date, sorted_dates)
            if p30 is not None:
                bucket_30[b].append((p30 - base) / base * 100)

            p90 = _find_nearest_price((d + timedelta(days=90)).isoformat(), by_date, sorted_dates)
            if p90 is not None:
                bucket_90[b].append((p90 - base) / base * 100)

        for b in SCORE_BUCKETS:
            weeks = max(len(bucket_30[b]), len(bucket_90[b]))
            if weeks == 0:
                continue
            results.append({
                "metal": metal,
                "score_bucket": b,
                "weeks": weeks,
                "median_30d": round(median(bucket_30[b]), 1) if bucket_30[b] else None,
                "median_90d": round(median(bucket_90[b]), 1) if bucket_90[b] else None,
            })

        if metal_cot:
            latest = max(metal_cot, key=lambda r: r["report_date"])
            print(f"  COT perf {metal}: {len(metal_cot)} weeks analyzed, "
                  f"latest bucket={_bucket(latest['cot_index'])}")

    return results

# ── 6. Push to Supabase ─────────────────────────────────────────────────────
def push_all(macro_rows, spot_rows, managers, history, cot_rows, perf_rows):
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

    # cot_performance: replace (small table, always recomputed)
    if perf_rows:
        sb.table("cot_performance").delete().neq("metal", "").execute()
        sb.table("cot_performance").insert(perf_rows).execute()
        print(f"[Supabase] cot_performance: {len(perf_rows)} rows replaced")

# ── 7. Entry point ──────────────────────────────────────────────────────────
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

    print("\n── COT historical performance ──")
    perf_rows = compute_cot_performance(cot_rows, spot_rows)

    # Summary
    print(f"\n── Summary ──")
    print(f"  FRED rows:    {len(macro_rows)}")
    print(f"  Spot rows:    {len(spot_rows)}")
    print(f"  Managers:     {len(managers)}")
    print(f"  History rows: {len(history)}")
    print(f"  COT rows:     {len(cot_rows)}")
    print(f"  Perf rows:    {len(perf_rows)}")

    if args.push:
        push_all(macro_rows, spot_rows, managers, history, cot_rows, perf_rows)
    else:
        print("\n(dry run — use --push to write to Supabase)")

if __name__ == "__main__":
    main()
