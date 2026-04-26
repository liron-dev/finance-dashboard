#!/usr/bin/env python3
"""Refresh `returns_1y` for S&P 500 stocks → Supabase `stocks`.

Runs in daily-etfs.yml AFTER etfs.py (separate runner from script.py),
so stocks' returns_1y stays decoupled from script.py's fundamentals run
and uses Yahoo's per-IP rate budget on a fresh runner.

Logic mirrors etfs.py:
  • Existing rows: pull last 10 days, splice newer closes onto stored array.
  • Missing rows (no returns_1y yet): fetch 2y, build full array. Capped at
    MAX_FULL_BACKFILL per run via --full-backfill so a 503-stock seed splits
    across multiple workflow invocations.

Free-tier safe: ~503 chart requests in incremental mode, ~200 in backfill mode.
"""
import argparse, os, sys, time
from datetime import date

from yf_batch import batched_download, compute_simple_returns, was_rate_limited

# ── Config ────────────────────────────────────────────────────────────────────
MAX_FULL_BACKFILL = 200           # cap new-stock backfills per run
RETURNS_LEN = 252
INCREMENTAL_PERIOD = "10d"
BACKFILL_PERIOD = "2y"
INCREMENTAL_CHUNK = 50
INCREMENTAL_SLEEP = 3.0
BACKFILL_CHUNK = 25
BACKFILL_SLEEP = 4.0


# ── Supabase ─────────────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)


# ── Helpers ──────────────────────────────────────────────────────────────────
def _last_close_date_from_returns(prev_close: float | None, dated_closes: list) -> str | None:
    """Best-effort: find the date that matches our stored prev_close."""
    if prev_close is None or prev_close <= 0:
        return None
    for d, c in dated_closes:
        if abs(c - prev_close) < 0.01:
            return d
    return None


def make_updated_returns(prev_returns: list[float], prev_close: float,
                         fetched: list[tuple[str, float]]) -> tuple[list[float], float, str | None] | None:
    """Splice newer closes onto prev_returns. Returns (new_array, last_close, last_date)
    or None if no fresh data available."""
    if not fetched or prev_close is None or prev_close <= 0:
        return None
    # The last fetched close is today's; older closes are 1..N days back.
    # Find the close in `fetched` that matches prev_close — anything AFTER it is new.
    anchor_idx = None
    for i, (_, c) in enumerate(fetched):
        if abs(c - prev_close) < max(0.01, prev_close * 0.0001):
            anchor_idx = i
    if anchor_idx is None:
        # No anchor match (e.g. price drift in 5d window) — use last fetched as
        # both anchor and new: skip update this run.
        return None
    new_dated = fetched[anchor_idx + 1:]
    if not new_dated:
        return None  # no new days
    appended = []
    cursor = prev_close
    for _, close in new_dated:
        if cursor > 0:
            appended.append(round((close - cursor) / cursor, 6))
        cursor = close
    rolled = (list(prev_returns) + appended)[-RETURNS_LEN:]
    last_date, last_close = new_dated[-1]
    return rolled, last_close, last_date


def make_new_returns(closes: list[tuple[str, float]]) -> tuple[list[float], float, str] | None:
    if len(closes) < 60:
        return None
    closes_only = [c for _, c in closes]
    rets = compute_simple_returns(closes_only)[-RETURNS_LEN:]
    if len(rets) < 60:
        return None
    return rets, closes[-1][1], closes[-1][0]


# ── Main ─────────────────────────────────────────────────────────────────────
def run(full_backfill: bool = False, push: bool = False) -> int:
    sb = _sb()

    # Read all stocks (one query, ≤503 rows for S&P 500)
    all_stocks = []
    page = 0
    while True:
        chunk = sb.table("stocks").select("ticker, price, returns_1y") \
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

    print(f"[stock_returns] {len(all_stocks)} stocks in DB")

    has_returns = [s for s in all_stocks if s.get("returns_1y") and len(s["returns_1y"]) >= 200]
    needs_backfill = [s for s in all_stocks
                      if not s.get("returns_1y") or len(s["returns_1y"]) < 200]

    if full_backfill:
        # Treat all "needs_backfill" as backfill candidates; cap per run
        target_backfill = needs_backfill[:MAX_FULL_BACKFILL]
        target_update = []
        print(f"[stock_returns] full-backfill: {len(needs_backfill)} pending; "
              f"this run = {len(target_backfill)}")
    else:
        target_backfill = needs_backfill[:MAX_FULL_BACKFILL]
        target_update = has_returns
        print(f"[stock_returns] incremental: {len(target_update)} updates + "
              f"{len(target_backfill)} backfills (of {len(needs_backfill)} pending)")

    upserts: list[dict] = []

    # ── 1. Incremental for tickers with stored returns ──────────────────────
    if target_update:
        tickers = [s["ticker"] for s in target_update]
        t0 = time.monotonic()
        fetched = batched_download(tickers, period=INCREMENTAL_PERIOD,
                                   chunk_size=INCREMENTAL_CHUNK,
                                   sleep_between=INCREMENTAL_SLEEP)
        rate_hit = was_rate_limited(fetched)
        print(f"  fetched {len(fetched)}/{len(tickers)} in "
              f"{time.monotonic()-t0:.0f}s"
              + (" (rate-limited)" if rate_hit else ""))
        for s in target_update:
            t = s["ticker"]
            prev_returns = s.get("returns_1y") or []
            prev_close = float(s["price"] or 0)
            result = make_updated_returns(prev_returns, prev_close, fetched.get(t, []))
            if result is None:
                continue
            rolled, last_close, last_date = result
            upserts.append({"ticker": t, "returns_1y": rolled})
        print(f"  → {len(upserts)} stocks gained new returns")
        if rate_hit:
            print("[stock_returns] skipping backfill due to rate limit")
            target_backfill = []

    # ── 2. Backfill for stocks missing returns ──────────────────────────────
    if target_backfill:
        tickers = [s["ticker"] for s in target_backfill]
        t0 = time.monotonic()
        bf = batched_download(tickers, period=BACKFILL_PERIOD,
                              chunk_size=BACKFILL_CHUNK, sleep_between=BACKFILL_SLEEP)
        rate_hit = was_rate_limited(bf)
        print(f"  fetched {len(bf)}/{len(tickers)} in "
              f"{time.monotonic()-t0:.0f}s"
              + (" (rate-limited)" if rate_hit else ""))
        added = 0
        for t in tickers:
            closes = bf.get(t, [])
            result = make_new_returns(closes)
            if result is None:
                continue
            rets, _, _ = result
            upserts.append({"ticker": t, "returns_1y": rets})
            added += 1
        print(f"  → {added} stocks backfilled")

    # ── 3. Push (one column update per ticker) ──────────────────────────────
    if push and upserts:
        for r in upserts:
            sb.table("stocks").update({"returns_1y": r["returns_1y"]}) \
              .eq("ticker", r["ticker"]).execute()
        print(f"[Supabase] stocks.returns_1y: {len(upserts)} rows updated")
    elif upserts:
        print(f"\n(dry run — would update {len(upserts)} rows. Use --push.)")

    return len(upserts)


def main():
    ap = argparse.ArgumentParser(description="Refresh stocks.returns_1y → Supabase")
    ap.add_argument("--push",          action="store_true", help="Write to Supabase")
    ap.add_argument("--full-backfill", action="store_true",
                    help="Treat all pending stocks as backfill candidates (cap MAX_FULL_BACKFILL/run)")
    args = ap.parse_args()

    n = run(full_backfill=args.full_backfill, push=args.push)
    if not n:
        print("[stock_returns] no rows produced.")


if __name__ == "__main__":
    main()
