#!/usr/bin/env python3
"""Daily S&P 500 metrics → Supabase (single snapshot, no history).

Metrics: price, gross_margin, roic, fcf_margin, int_coverage, pe_ratio.
See README.md for SQL schema, setup, and usage details.
"""
import argparse, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from io import StringIO

import pandas as pd, requests, yfinance as yf

# ── Config ────────────────────────────────────────────────────────────────────
WORKERS, MAX_RETRIES, RETRY_DELAY = 4, 2, 3
BATCH_SIZE, BATCH_PAUSE = 50, 3  # pause 3s every 50 tickers to avoid rate limits
METRIC_COLS = ["price", "gross_margin", "roic", "fcf_margin", "int_coverage", "pe_ratio"]
MIN_SUCCESS_RATE = 0.90  # only replace DB data if ≥90% of tickers succeeded
EST_INTEREST_RATE = 0.05   # fallback rate when interest data missing but debt exists
INT_COV_CAP = 999.99       # cap for debt-free companies

# ── Helpers ───────────────────────────────────────────────────────────────────
def _first(stmt: pd.DataFrame | None, *keys: str) -> float | None:
    """Latest-period value for the first key whose value is not NaN."""
    if stmt is None or stmt.empty: return None
    for k in keys:
        if k in stmt.index:
            v = stmt.loc[k].iloc[0]
            try:
                if pd.notna(v): return float(v)
            except (TypeError, ValueError): pass
    return None

def _r(val, d: int = 4) -> float | None:
    if val is None: return None
    try: return round(float(val), d)
    except (TypeError, ValueError): return None

# ── 1. Ticker list ────────────────────────────────────────────────────────────
def get_sp500_df() -> pd.DataFrame:
    resp = requests.get(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
        timeout=15)
    resp.raise_for_status()
    df = pd.read_html(StringIO(resp.text), attrs={"id": "constituents"})[0]
    df["Symbol"] = df["Symbol"].str.replace(".", "-", regex=False)
    return df

# ── 2. Interest / EBIT resolvers ─────────────────────────────────────────────
def _resolve_int_exp(inc, t):
    """Annual → derived (IntInc − NetInt) → quarterly ×4."""
    v = _first(inc, "Interest Expense", "Interest Expense Non Operating")
    if v is not None: return v
    ii = _first(inc, "Interest Income", "Interest Income Non Operating")
    ni = _first(inc, "Net Interest Income")
    if ii is not None and ni is not None: return ii - ni
    q = _first(t.quarterly_income_stmt, "Interest Expense", "Interest Expense Non Operating")
    return q * 4 if q is not None else None

def _resolve_ebit(inc, int_exp):
    """Direct EBIT → Pretax + |IntExp| (financial companies)."""
    v = _first(inc, "EBIT", "Operating Income")
    if v is not None: return v
    pt = _first(inc, "Pretax Income")
    return pt + abs(int_exp) if pt is not None and int_exp is not None else None

# ── 3. Per-ticker fetch ──────────────────────────────────────────────────────
def fetch_metrics(symbol: str, sector: str) -> dict:
    row = {"ticker": symbol, "name": symbol, "sector": sector,
           **{k: None for k in METRIC_COLS}}
    for attempt in range(MAX_RETRIES + 1):
        try:
            t    = yf.Ticker(symbol)
            info = t.info or {}
            row["name"] = info.get("shortName") or info.get("longName") or symbol

            # Price
            price = info.get("currentPrice")
            if price is None: price = info.get("regularMarketPrice")
            row["price"] = _r(price, 2)
            # Gross margin (info fast path)
            row["gross_margin"] = _r(info.get("grossMargins"))
            # PE ratio: compute ourselves (handles negative EPS)
            eps = info.get("trailingEps")
            if price is not None and eps is not None and eps != 0:
                row["pe_ratio"] = _r(price / eps)
            else:
                fwd = info.get("forwardPE")
                row["pe_ratio"] = _r(fwd if fwd is not None else info.get("priceEpsCurrentYear"))

            # Financial statements (inner try preserves info-dict values on failure)
            try:
                inc, bal, cf = t.income_stmt, t.balance_sheet, t.cashflow
                revenue    = _first(inc, "Total Revenue")
                net_income = _first(inc, "Net Income")
                cogs   = _first(inc, "Cost Of Revenue", "Reconciled Cost Of Revenue")
                equity = _first(bal, "Stockholders Equity", "Total Equity Gross Minority Interest")
                debt   = _first(bal, "Total Debt", "Long Term Debt And Capital Lease Obligation")
                fcf    = _first(cf,  "Free Cash Flow")
                int_exp = _resolve_int_exp(inc, t)
                ebit    = _resolve_ebit(inc, int_exp)

                if row["gross_margin"] is None and revenue and cogs is not None:
                    row["gross_margin"] = _r((revenue - cogs) / revenue)
                if net_income is not None and equity is not None:
                    capital = equity + (debt or 0)
                    if capital: row["roic"] = _r(net_income / capital)
                if fcf is not None and revenue:
                    row["fcf_margin"] = _r(fcf / revenue)
                # Int coverage: standard → debt-estimate → debt-free cap
                if ebit is not None and int_exp is not None and int_exp != 0:
                    row["int_coverage"] = _r(ebit / abs(int_exp))
                elif ebit is not None:
                    if debt is not None and debt > 0 and int_exp is None:
                        row["int_coverage"] = _r(ebit / (debt * EST_INTEREST_RATE))
                    else:
                        row["int_coverage"] = INT_COV_CAP if ebit > 0 else 0.0
            except Exception: pass

            # Fill remaining nulls with defaults (user requires 100% coverage)
            defaults = {"gross_margin": 0.0, "roic": 0.0, "fcf_margin": 0.0,
                        "int_coverage": INT_COV_CAP, "pe_ratio": 0.0}
            for k, v in defaults.items():
                if row[k] is None:
                    row[k] = v
            return row
        except Exception as e:
            if attempt < MAX_RETRIES: time.sleep(RETRY_DELAY * (attempt + 1))
            else: print(f"  [!] {symbol}: {e}", file=sys.stderr)
    # Fill defaults even for fully-failed tickers
    defaults = {"price": 0.0, "gross_margin": 0.0, "roic": 0.0, "fcf_margin": 0.0,
                "int_coverage": INT_COV_CAP, "pe_ratio": 0.0}
    for k, v in defaults.items():
        if row[k] is None:
            row[k] = v
    return row

# ── 4. Build DataFrame (batched + parallel) ─────────────────────────────────
def build_df(tickers: list[str], sectors: dict[str, str]) -> pd.DataFrame:
    results: dict[str, dict] = {}
    total = len(tickers)
    print(f"\nFetching {total} tickers ({WORKERS} workers, batches of {BATCH_SIZE}) …\n", flush=True)
    t0, done = time.monotonic(), 0
    for batch_start in range(0, total, BATCH_SIZE):
        batch = tickers[batch_start : batch_start + BATCH_SIZE]
        if batch_start > 0:
            print(f"  — pausing {BATCH_PAUSE}s …", flush=True)
            time.sleep(BATCH_PAUSE)
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(fetch_metrics, sym, sectors.get(sym, "")): sym for sym in batch}
            for future in as_completed(futures):
                sym = futures[future]
                r = future.result()
                results[sym] = r
                done += 1
                filled = sum(1 for k in METRIC_COLS if r[k] is not None)
                print(f"  {done:>3}/{total}  {sym:<6}  {filled}/6", flush=True)
    elapsed = time.monotonic() - t0
    print(f"\nDone in {elapsed:.0f}s  ({elapsed / total:.1f}s/ticker)", flush=True)
    return pd.DataFrame([results[s] for s in tickers])

# ── 5. Print table ───────────────────────────────────────────────────────────
def print_table(df: pd.DataFrame) -> None:
    view = df[["ticker", "name"] + METRIC_COLS].copy()
    view["name"] = view["name"].str[:18]
    view.columns = ["Ticker", "Name", "Price $", "Gross Mgn", "ROIC",
                     "FCF Mgn", "Int Cov", "P/E"]
    fmt_pct = lambda x: f"{x:.2%}" if pd.notna(x) else "–"
    fmt_num = lambda x: f"{x:,.2f}" if pd.notna(x) else "–"
    for c in ["Gross Mgn", "ROIC", "FCF Mgn"]: view[c] = view[c].apply(fmt_pct)
    for c in ["Price $", "Int Cov", "P/E"]:    view[c] = view[c].apply(fmt_num)
    sep = "─" * 95
    print(f"\n{sep}\n  S&P 500 Fundamental Metrics  │  {date.today()}\n{sep}")
    print(view.to_string(index=False, na_rep="–"))
    print(sep)
    n = len(df)
    print("\nCoverage:")
    for col in METRIC_COLS:
        hit = int(df[col].notna().sum())
        print(f"  {col:<15} {hit:>3}/{n}  {'█' * (hit * 20 // n)}")

# ── 6. Supabase ──────────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key: sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)

def push_metrics(df: pd.DataFrame) -> None:
    sb = _sb()
    valid = df.dropna(subset=METRIC_COLS, how="all")
    total, success = len(df), len(valid)
    rate = success / total if total else 0

    if not valid.empty and rate < MIN_SUCCESS_RATE:
        print(f"[Supabase] Only {success}/{total} ({rate:.0%}) succeeded — "
              f"below {MIN_SUCCESS_RATE:.0%} threshold. Keeping existing data.",
              file=sys.stderr)
        return
    if valid.empty:
        print("[Supabase] Nothing to push (all tickers failed).", file=sys.stderr)
        return

    # Build records (NaN → None for JSON-safe serialization)
    today = date.today().isoformat()
    records = []
    for _, r in valid.iterrows():
        rec = {"ticker": r["ticker"], "name": r["name"], "sector": r["sector"],
               "updated_at": today}
        for col in METRIC_COLS:
            v = r[col]
            rec[col] = float(v) if pd.notna(v) else None
        records.append(rec)

    # Replace: delete old data, then insert new
    sb.table("stocks").delete().neq("ticker", "").execute()
    sb.table("stocks").insert(records).execute()
    print(f"[Supabase] Replaced table with {len(records)} rows ({today}).")

# ── 7. Entry point ───────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="Daily S&P 500 metrics collector")
    ap.add_argument("--push",  action="store_true", help="Replace Supabase data with today's metrics")
    ap.add_argument("--limit", type=int, default=0, metavar="N", help="First N tickers only (dev)")
    args = ap.parse_args()

    print("Fetching S&P 500 constituent list …")
    sp500_df = get_sp500_df()
    if args.limit > 0: sp500_df = sp500_df.head(args.limit)
    tickers = sp500_df["Symbol"].tolist()
    sectors = dict(zip(sp500_df["Symbol"], sp500_df.get("GICS Sector", "")))
    print(f"  → {len(tickers)} tickers")

    df = build_df(tickers, sectors)
    print_table(df)

    if args.push:
        push_metrics(df)
    if int(df[METRIC_COLS].notna().any(axis=1).sum()) == 0:
        print("\n[FATAL] All tickers failed.", file=sys.stderr); sys.exit(1)

if __name__ == "__main__":
    main()
