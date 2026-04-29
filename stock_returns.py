#!/usr/bin/env python3
"""Refresh `returns_1y` for S&P 500 stocks → Supabase `stocks`.

Runs in daily-etfs.yml (separate runner from script.py).

Strategy: refetch a full 14-month window for every stock each run, recompute
the 252-day return series from scratch, and replace the column. This is the
**same yfinance call count** as the prior 10-day-incremental approach
(~503 chart requests), but avoids the price-anchor matching that previously
made the splice silently fail (stocks.price is intraday `currentPrice`, not
the 4 PM ET daily close, so the price anchor never matched any fetched close
and the array was effectively frozen at the initial backfill date).

Free-tier safe: still ~503 chart requests in a single workflow run.
"""
import argparse, os, sys, time

from yf_batch import batched_download, compute_simple_returns, was_rate_limited

# ── Config ────────────────────────────────────────────────────────────────────
RETURNS_LEN = 252
PERIOD = "14mo"           # gives a comfortable buffer beyond 252 trading days
CHUNK = 50
SLEEP_BETWEEN = 3.0
MIN_LEN = 60              # stocks with fewer days are not useful for matching


# ── Supabase ─────────────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)


# ── Main ─────────────────────────────────────────────────────────────────────
def run(push: bool = False) -> int:
    sb = _sb()

    # Read tickers (only need ticker; we replace the whole returns_1y column)
    all_stocks = []
    page = 0
    while True:
        chunk = sb.table("stocks").select("ticker, price") \
                  .gt("price", 0).range(page * 1000, page * 1000 + 999).execute().data or []
        if not chunk:
            break
        all_stocks.extend(chunk)
        if len(chunk) < 1000:
            break
        page += 1
    if not all_stocks:
        print("[stock_returns] no stocks in DB — run script.py --push first.")
        return 0

    tickers = [s["ticker"] for s in all_stocks]
    print(f"[stock_returns] {len(tickers)} stocks; fetching {PERIOD} closes for all …")

    t0 = time.monotonic()
    fetched = batched_download(tickers, period=PERIOD,
                                chunk_size=CHUNK, sleep_between=SLEEP_BETWEEN)
    rate_hit = was_rate_limited(fetched)
    print(f"  fetched {len(fetched)}/{len(tickers)} in {time.monotonic()-t0:.0f}s"
          + (" (rate-limited)" if rate_hit else ""))

    updates: list[dict] = []
    too_short = 0
    for t in tickers:
        dated = fetched.get(t, [])
        if len(dated) < MIN_LEN:
            too_short += 1
            continue
        closes = [c for _, c in dated]
        rets = compute_simple_returns(closes)[-RETURNS_LEN:]
        if len(rets) < MIN_LEN:
            too_short += 1
            continue
        updates.append({"ticker": t, "returns_1y": rets})
    print(f"  → {len(updates)} stocks ready to refresh "
          f"({too_short} too-short / not fetched)")

    if push and updates:
        # UPDATE per-ticker (UPSERT would null other NOT NULL columns)
        for u in updates:
            sb.table("stocks").update({"returns_1y": u["returns_1y"]}) \
              .eq("ticker", u["ticker"]).execute()
        print(f"[Supabase] stocks.returns_1y: {len(updates)} rows refreshed")
    elif updates:
        print(f"\n(dry run — would refresh {len(updates)} rows. Use --push.)")

    return len(updates)


def main():
    ap = argparse.ArgumentParser(description="Refresh stocks.returns_1y → Supabase (full-replace each run)")
    ap.add_argument("--push", action="store_true", help="Write to Supabase")
    # --full-backfill kept as a no-op for backward-compat with the workflow file
    ap.add_argument("--full-backfill", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()
    n = run(push=args.push)
    if not n:
        print("[stock_returns] no rows refreshed.")


if __name__ == "__main__":
    main()
