#!/usr/bin/env python3
"""
finance-dashboard/script.py
────────────────────────────────────────────────────────────────────────────
Daily S&P 500 fundamental metrics collector.

Metrics per ticker
  price         – current market price
  gross_margin  – (Revenue − COGS) / Revenue
  roic          – Net Income / (Equity + Debt)
  fcf_margin    – Free Cash Flow / Revenue
  int_coverage  – EBIT / |Interest Expense|
  pe_ratio      – Price / EPS (trailing)

Supabase schema  (run once in SQL editor)
─────────────────────────────────────────
  CREATE TABLE stocks (
      id      UUID PRIMARY KEY,
      ticker  TEXT UNIQUE NOT NULL,
      name    TEXT,
      sector  TEXT
  );

  CREATE TABLE stock_metrics (
      stock_id      UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
      date          DATE NOT NULL,
      price         REAL,
      gross_margin  REAL,
      roic          REAL,
      fcf_margin    REAL,
      int_coverage  REAL,
      pe_ratio      REAL,
      PRIMARY KEY (stock_id, date)
  );
  CREATE INDEX ON stock_metrics (date DESC);

  -- RLS: frontend (anon key) gets read-only access.
  -- The script uses service_role key which bypasses RLS.
  ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE stock_metrics ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "public read" ON stocks FOR SELECT USING (true);
  CREATE POLICY "public read" ON stock_metrics FOR SELECT USING (true);

  -- Handy view for Vercel frontend (latest day per stock)
  CREATE VIEW latest_metrics AS
  SELECT s.ticker, s.name, s.sector, m.*
  FROM   stock_metrics m
  JOIN   stocks s ON s.id = m.stock_id
  WHERE  m.date = (SELECT MAX(date) FROM stock_metrics);
─────────────────────────────────────────
Storage: ~25 MB/year (with indexes) → ~20 years on Supabase free tier (500 MB).

Usage
  python script.py                # print table
  python script.py --limit 10     # first 10 tickers (fast dev test)
  python script.py --seed-stocks  # one-time: seed stocks table in Supabase
  python script.py --push         # daily: fetch + upsert metrics

GitHub Actions env vars (--seed-stocks / --push)
  SUPABASE_URL   – project URL
  SUPABASE_KEY   – service_role key (NOT the anon key)
"""

import argparse
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from io import StringIO

import pandas as pd
import requests
import yfinance as yf

# ── Config ────────────────────────────────────────────────────────────────────

WORKERS     = 8
MAX_RETRIES = 2
RETRY_DELAY = 3     # seconds × attempt number (linear backoff)

STOCK_NS    = uuid.UUID("b1a8c3f0-9d2e-4f71-8e55-1a3c6d8e9f20")
METRIC_COLS = ["price", "gross_margin", "roic", "fcf_margin", "int_coverage", "pe_ratio"]

# Conservative assumed rate when a company has debt but yfinance
# reports no interest expense in any statement (rare data gap).
EST_INTEREST_RATE = 0.05

# Interest coverage cap for debt-free companies (industry convention).
INT_COV_CAP = 999.99


# ── Helpers ───────────────────────────────────────────────────────────────────

def ticker_uuid(ticker: str) -> str:
    """Deterministic UUID5 — same ticker always produces the same id."""
    return str(uuid.uuid5(STOCK_NS, ticker))


def _first(stmt: pd.DataFrame | None, *keys: str) -> float | None:
    """Latest-period value for the first key whose value is not NaN."""
    if stmt is None or stmt.empty:
        return None
    for key in keys:
        if key in stmt.index:
            val = stmt.loc[key].iloc[0]
            try:
                if pd.notna(val):
                    return float(val)
            except (TypeError, ValueError):
                pass
    return None


def _r(val, d: int = 4) -> float | None:
    """Round to *d* decimals; None in → None out."""
    if val is None:
        return None
    try:
        return round(float(val), d)
    except (TypeError, ValueError):
        return None


# ── 1. Ticker list ────────────────────────────────────────────────────────────

def get_sp500_df() -> pd.DataFrame:
    """S&P 500 constituents from Wikipedia."""
    resp = requests.get(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
        },
        timeout=15,
    )
    resp.raise_for_status()
    df = pd.read_html(StringIO(resp.text), attrs={"id": "constituents"})[0]
    df["Symbol"] = df["Symbol"].str.replace(".", "-", regex=False)  # BRK.B → BRK-B
    return df


# ── 2. Per-ticker fetch ──────────────────────────────────────────────────────

def _resolve_interest_expense(
    inc: pd.DataFrame | None,
    t: yf.Ticker,
) -> float | None:
    """
    Multi-source interest expense resolution:
      1. Annual: "Interest Expense" / "Interest Expense Non Operating"
      2. Derive: Interest Income − Net Interest Income
      3. Quarterly (annualized ×4)
    """
    val = _first(inc, "Interest Expense", "Interest Expense Non Operating")
    if val is not None:
        return val

    int_inc = _first(inc, "Interest Income", "Interest Income Non Operating")
    net_int = _first(inc, "Net Interest Income")
    if int_inc is not None and net_int is not None:
        return int_inc - net_int

    qinc = t.quarterly_income_stmt
    q_val = _first(qinc, "Interest Expense", "Interest Expense Non Operating")
    if q_val is not None:
        return q_val * 4

    return None


def _resolve_ebit(
    inc: pd.DataFrame | None,
    int_exp: float | None,
) -> float | None:
    """
    EBIT resolution:
      1. Direct: "EBIT" / "Operating Income"
      2. Financial companies: Pretax Income + |Interest Expense|
    """
    val = _first(inc, "EBIT", "Operating Income")
    if val is not None:
        return val

    pretax = _first(inc, "Pretax Income")
    if pretax is not None and int_exp is not None:
        return pretax + abs(int_exp)

    return None


def fetch_metrics(symbol: str) -> dict:
    """
    All six metrics for *symbol* with retry + graceful degradation.
    Targets zero NULLs via multi-source fallback chains.
    """
    row: dict = {
        "stock_id": ticker_uuid(symbol),
        "ticker":   symbol,
        **{k: None for k in METRIC_COLS},
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            t    = yf.Ticker(symbol)
            info = t.info or {}

            # ── price ──────────────────────────────────────────────
            price = info.get("currentPrice")
            if price is None:
                price = info.get("regularMarketPrice")
            row["price"] = _r(price, 2)

            # ── gross_margin (info fast path) ──────────────────────
            row["gross_margin"] = _r(info.get("grossMargins"))

            # ── pe_ratio: Price / EPS ──────────────────────────────
            # Compute ourselves — yfinance returns None for trailingPE
            # when EPS is negative, but trailingEps IS available.
            eps = info.get("trailingEps")
            if price is not None and eps is not None and eps != 0:
                row["pe_ratio"] = _r(price / eps)
            else:
                fwd = info.get("forwardPE")
                row["pe_ratio"] = _r(
                    fwd if fwd is not None
                    else info.get("priceEpsCurrentYear")
                )

            # ── financial statements ───────────────────────────────
            # Inner try: statement failure preserves info-dict values.
            try:
                inc = t.income_stmt
                bal = t.balance_sheet
                cf  = t.cashflow

                revenue    = _first(inc, "Total Revenue")
                net_income = _first(inc, "Net Income")
                cogs       = _first(inc, "Cost Of Revenue",
                                         "Reconciled Cost Of Revenue")
                equity     = _first(bal, "Stockholders Equity",
                                         "Total Equity Gross Minority Interest")
                debt       = _first(bal, "Total Debt",
                                         "Long Term Debt And Capital Lease Obligation")
                fcf        = _first(cf,  "Free Cash Flow")

                # Interest expense (multi-source)
                int_exp = _resolve_interest_expense(inc, t)

                # EBIT (with financial-company fallback)
                ebit = _resolve_ebit(inc, int_exp)

                # ── gross_margin fallback from statements ──────────
                if row["gross_margin"] is None and revenue and cogs is not None:
                    row["gross_margin"] = _r((revenue - cogs) / revenue)

                # ── roic ───────────────────────────────────────────
                if net_income is not None and equity is not None:
                    capital = equity + (debt or 0)
                    if capital:
                        row["roic"] = _r(net_income / capital)

                # ── fcf_margin ─────────────────────────────────────
                if fcf is not None and revenue:
                    row["fcf_margin"] = _r(fcf / revenue)

                # ── int_coverage ───────────────────────────────────
                if ebit is not None and int_exp is not None and int_exp != 0:
                    row["int_coverage"] = _r(ebit / abs(int_exp))
                elif ebit is not None:
                    has_debt = debt is not None and debt > 0
                    if has_debt and int_exp is None:
                        # Company has debt but yfinance has no interest
                        # data at all → conservative estimate
                        est = debt * EST_INTEREST_RATE
                        row["int_coverage"] = _r(ebit / est)
                    else:
                        # Debt-free or negligible interest
                        row["int_coverage"] = INT_COV_CAP if ebit > 0 else 0.0

            except Exception:
                pass

            return row

        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                print(f"  [!] {symbol}: {e}", file=sys.stderr)

    return row


# ── 3. Build DataFrame ───────────────────────────────────────────────────────

def build_df(tickers: list[str]) -> pd.DataFrame:
    results: dict[str, dict] = {}
    total = len(tickers)

    print(f"\nFetching {total} tickers ({WORKERS} workers) …\n", flush=True)
    t0 = time.monotonic()

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_metrics, sym): sym for sym in tickers}
        for i, future in enumerate(as_completed(futures), 1):
            sym = futures[future]
            r   = future.result()
            results[sym] = r
            filled = sum(1 for k in METRIC_COLS if r[k] is not None)
            print(f"  {i:>3}/{total}  {sym:<6}  {filled}/6", flush=True)

    elapsed = time.monotonic() - t0
    print(f"\nDone in {elapsed:.0f}s  ({elapsed / total:.1f}s/ticker)", flush=True)

    return pd.DataFrame([results[s] for s in tickers])


# ── 4. Print table ───────────────────────────────────────────────────────────

def print_table(df: pd.DataFrame) -> None:
    view = df[["ticker"] + METRIC_COLS].copy()
    view.columns = ["Ticker", "Price $", "Gross Mgn", "ROIC",
                     "FCF Mgn", "Int Cov", "P/E"]

    fmt_pct = lambda x: f"{x:.2%}" if pd.notna(x) else "–"
    fmt_num = lambda x: f"{x:,.2f}" if pd.notna(x) else "–"

    for c in ["Gross Mgn", "ROIC", "FCF Mgn"]:
        view[c] = view[c].apply(fmt_pct)
    for c in ["Price $", "Int Cov", "P/E"]:
        view[c] = view[c].apply(fmt_num)

    sep = "─" * 72
    print(f"\n{sep}")
    print(f"  S&P 500 Fundamental Metrics  │  {date.today()}")
    print(sep)
    print(view.to_string(index=False, na_rep="–"))
    print(sep)

    n = len(df)
    print("\nCoverage:")
    for col in METRIC_COLS:
        hit = int(df[col].notna().sum())
        bar = "█" * (hit * 20 // n) if n else ""
        print(f"  {col:<15} {hit:>3}/{n}  {bar}")


# ── 5. Supabase ──────────────────────────────────────────────────────────────

def _sb():
    from supabase import create_client  # noqa: PLC0415
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)


def seed_stocks(sp500_df: pd.DataFrame) -> None:
    """Upsert tickers into stocks table. Deterministic UUIDs — idempotent."""
    sb = _sb()
    records = [
        {
            "id":     ticker_uuid(row["Symbol"]),
            "ticker": row["Symbol"],
            "name":   row.get("Security"),
            "sector": row.get("GICS Sector"),
        }
        for _, row in sp500_df.iterrows()
    ]
    sb.table("stocks").upsert(records, on_conflict="ticker").execute()
    print(f"[Supabase] Seeded {len(records)} stocks.")


def push_metrics(df: pd.DataFrame) -> None:
    """Upsert today's metrics. Skips tickers where every metric is None."""
    sb    = _sb()
    today = date.today().isoformat()
    valid = df.dropna(subset=METRIC_COLS, how="all")

    # NaN → None for JSON-safe serialization (pandas stores missing
    # floats as np.float64(nan); json.dumps(nan) emits invalid "NaN")
    records = []
    for _, r in valid.iterrows():
        rec = {"stock_id": r["stock_id"], "date": today}
        for col in METRIC_COLS:
            v = r[col]
            rec[col] = float(v) if pd.notna(v) else None
        records.append(rec)

    if not records:
        print("[Supabase] Nothing to push (all tickers failed).", file=sys.stderr)
        return

    sb.table("stock_metrics").upsert(records, on_conflict="stock_id,date").execute()
    skipped = len(df) - len(records)
    msg = f"[Supabase] Upserted {len(records)} rows for {today}."
    if skipped:
        msg += f"  Skipped {skipped} failed."
    print(msg)


# ── 6. Entry point ───────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Daily S&P 500 metrics collector")
    ap.add_argument("--push",        action="store_true",
                    help="Upsert metrics into Supabase")
    ap.add_argument("--seed-stocks", action="store_true",
                    help="One-time: populate stocks table (run before --push)")
    ap.add_argument("--limit",       type=int, default=0, metavar="N",
                    help="First N tickers only (dev / smoke test)")
    args = ap.parse_args()

    print("Fetching S&P 500 constituent list …")
    sp500_df = get_sp500_df()
    if args.limit:
        sp500_df = sp500_df.head(args.limit)
    tickers = sp500_df["Symbol"].tolist()
    print(f"  → {len(tickers)} tickers")

    if args.seed_stocks:
        seed_stocks(sp500_df)

    df = build_df(tickers)
    print_table(df)

    if args.push:
        push_metrics(df)

    # Exit code for GitHub Actions — nonzero only if everything failed
    hit = int(df[METRIC_COLS].notna().any(axis=1).sum())
    if hit == 0:
        print("\n[FATAL] All tickers failed.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
