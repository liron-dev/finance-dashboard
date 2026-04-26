#!/usr/bin/env python3
"""Daily ETF refresh → Supabase `etfs`.

Reads the active universe from `etf_universe`, then for each ticker:
  • Existing rows: pulls the last 5 trading days, splices any new closes
    onto the stored returns_1y array (rolls to keep length ≤ 252).
  • New rows: pulls 2y of closes, computes full returns array, fetches
    metadata (name / expense_ratio / aum) once.

Free-tier safe:
  • ~1000 chart requests per daily run, batched in chunks of 100 with
    ~2 s jitter — well under Yahoo's informal ~2000 req/hr/IP threshold.
  • New-ticker backfills capped at 50/run (configurable). Defer extras.
  • No per-ticker .info calls for known tickers (only for new entries).

Use --full-backfill (via workflow_dispatch) for one-time initial seed.
"""
import argparse, math, os, random, sys, time
from datetime import date

import yfinance as yf
from curl_cffi import requests as curl_requests

from yf_batch import batched_download, compute_simple_returns, _new_session, was_rate_limited
import retention

# ── Config ────────────────────────────────────────────────────────────────────
# yfinance rate limit is ~2000 req/hr/IP. Each ticker = 1 chart request.
# Caps below assume etfs.py runs in a workflow that's NOT stacked with
# script.py on the same IP — see daily-etfs.yml.
MAX_NEW_PER_RUN = 50           # incremental daily: backfill up to 50 new tickers
MAX_FULL_BACKFILL = 200        # --full-backfill: cap at 200/run (5 runs = 1000)
RETURNS_LEN = 252              # rolling window length
INCREMENTAL_PERIOD = "10d"     # generous window so missed runs still recover
BACKFILL_PERIOD = "2y"         # need >= 1y; 2y gives buffer for trading-day count
INCREMENTAL_CHUNK = 50         # smaller chunks → gentler on rate limit
INCREMENTAL_SLEEP = 3.0        # 3s + 0..1.5s jitter between chunks
BACKFILL_CHUNK = 25
BACKFILL_SLEEP = 4.0
META_RETRY_DELAY = 1.5
META_MAX_RETRIES = 1


# ── Supabase ─────────────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)


# ── Metadata fetch (only for new tickers) ────────────────────────────────────
def fetch_metadata(ticker: str, session) -> dict:
    """Best-effort info pull. Tolerates missing fields — yfinance returns
    empty dicts for some niche ETFs."""
    name, exp_ratio, aum = ticker, None, None
    yh_ticker = ticker.replace(".", "-")
    for attempt in range(META_MAX_RETRIES + 1):
        try:
            t = yf.Ticker(yh_ticker, session=session)
            info = t.info or {}
            name = info.get("longName") or info.get("shortName") or ticker
            exp_ratio = info.get("annualReportExpenseRatio") or info.get("netExpenseRatio")
            aum = info.get("totalAssets")
            break
        except Exception as e:
            if attempt < META_MAX_RETRIES:
                time.sleep(META_RETRY_DELAY)
            else:
                print(f"  [meta!] {ticker}: {e}", file=sys.stderr)
    return {"name": (name or ticker)[:200],
            "expense_ratio": _r(exp_ratio),
            "aum_usd": int(aum) if isinstance(aum, (int, float)) and aum else None}


def _r(v) -> float | None:
    if v is None: return None
    try:
        f = float(v)
        if math.isnan(f): return None
        return round(f, 6)
    except (TypeError, ValueError):
        return None


# ── Row builders ─────────────────────────────────────────────────────────────
def _yoy_from_returns(returns: list[float]) -> float:
    """Compound the array to get period total return as a percent."""
    if not returns: return 0.0
    cum = 1.0
    for r in returns:
        cum *= (1.0 + r)
    return round((cum - 1.0) * 100, 4)


def make_new_row(ticker: str, closes: list[tuple[str, float]],
                 universe_meta: dict, fetched_meta: dict) -> dict | None:
    if len(closes) < 60: return None
    closes_only = [c for _, c in closes]
    rets = compute_simple_returns(closes_only)[-RETURNS_LEN:]
    if len(rets) < 60: return None
    last_date, last_close = closes[-1]
    name = fetched_meta.get("name") or universe_meta.get("name") or ticker
    aum  = fetched_meta.get("aum_usd") or universe_meta.get("aum_usd")
    return {
        "ticker": ticker,
        "name": name[:200],
        "expense_ratio": fetched_meta.get("expense_ratio"),
        "aum_usd": aum,
        "current_price": round(last_close, 4),
        "yoy_pct": _yoy_from_returns(rets),
        "returns_1y": rets,
        "last_close_date": last_date,
    }


def make_updated_row(ticker: str, prev: dict, closes: list[tuple[str, float]],
                     universe_meta: dict) -> dict | None:
    """Splice newer closes onto stored returns array."""
    if not closes: return None
    prev_returns = list(prev.get("returns_1y") or [])
    prev_last_date = prev.get("last_close_date") or ""
    prev_close = float(prev.get("current_price") or 0.0)

    # Find closes strictly newer than what we've already stored.
    new_dated = [(d, c) for (d, c) in closes if d > prev_last_date]
    if not new_dated:
        # No fresh data — keep prev row as-is (don't bother upserting).
        return None

    # First new return needs the prior close. If we don't have a sane
    # prev_close (e.g., row was created with rets but no current_price match),
    # back it out from the fetched chunk if possible.
    if prev_close <= 0:
        # Try to infer from a date == prev_last_date in the fetched window.
        same = [c for (d, c) in closes if d == prev_last_date]
        if same:
            prev_close = float(same[0])

    if prev_close <= 0:
        # Still no anchor → fall back to first fetched close as anchor and
        # only use returns from subsequent days.
        prev_close = float(new_dated[0][1])
        new_dated = new_dated[1:]
        if not new_dated:
            return None

    appended = []
    for (_, close) in new_dated:
        if prev_close > 0:
            appended.append(round((close - prev_close) / prev_close, 6))
        prev_close = close

    rolled = (prev_returns + appended)[-RETURNS_LEN:]
    last_date, last_close = new_dated[-1]
    name = universe_meta.get("name") or prev.get("name") or ticker
    return {
        "ticker": ticker,
        "name": name[:200],
        # preserve previously-fetched metadata; refreshed AUM from universe
        "expense_ratio": prev.get("expense_ratio"),
        "aum_usd": universe_meta.get("aum_usd") or prev.get("aum_usd"),
        "current_price": round(float(last_close), 4),
        "yoy_pct": _yoy_from_returns(rolled),
        "returns_1y": rolled,
        "last_close_date": last_date,
    }


# ── Main pipeline ────────────────────────────────────────────────────────────
def run(full_backfill: bool = False, push: bool = False, limit: int = 0) -> int:
    sb = _sb()
    universe = sb.table("etf_universe").select(
        "ticker, name, aum_usd, rank_by_aum"
    ).eq("is_active", True).order("rank_by_aum").execute().data or []

    if limit > 0:
        universe = universe[:limit]
    if not universe:
        print("[etfs] etf_universe is empty — run etf_universe_scraper.py first.",
              file=sys.stderr)
        return 0

    universe_map = {r["ticker"]: r for r in universe}
    tickers = list(universe_map.keys())[:1000]
    print(f"[etfs] active universe: {len(tickers)} tickers")

    existing_rows: list[dict] = []
    page = 0
    while True:
        chunk = sb.table("etfs").select(
            "ticker, returns_1y, last_close_date, current_price, name, "
            "expense_ratio, aum_usd"
        ).in_("ticker", tickers).range(page * 1000, page * 1000 + 999).execute().data or []
        if not chunk:
            break
        existing_rows.extend(chunk)
        if len(chunk) < 1000:
            break
        page += 1
    existing_map = {r["ticker"]: r for r in existing_rows}
    print(f"[etfs] existing rows: {len(existing_map)}")

    if full_backfill:
        # Treat tickers without complete returns_1y as still-needing-backfill.
        # This lets us split a 1000-ticker backfill across multiple workflow runs.
        needs_backfill = [
            t for t in tickers
            if t not in existing_map
            or not existing_map[t].get("returns_1y")
            or len(existing_map[t]["returns_1y"]) < 200
        ]
        # Cap per-run so we stay under Yahoo's per-IP rate limit
        new_tickers = needs_backfill[:MAX_FULL_BACKFILL]
        update_tickers = []
        print(f"[etfs] full-backfill mode: {len(needs_backfill)} tickers need "
              f"backfill; processing {len(new_tickers)} this run "
              f"(MAX_FULL_BACKFILL={MAX_FULL_BACKFILL})")
    else:
        new_tickers = [t for t in tickers if t not in existing_map]
        update_tickers = [t for t in tickers if t in existing_map]

    upserts: list[dict] = []

    # ── 1. Incremental refresh for known tickers ────────────────────────────
    if update_tickers:
        print(f"[etfs] incremental refresh: {len(update_tickers)} tickers …")
        t0 = time.monotonic()
        fetched = batched_download(
            update_tickers,
            period=INCREMENTAL_PERIOD,
            chunk_size=INCREMENTAL_CHUNK,
            sleep_between=INCREMENTAL_SLEEP,
        )
        rate_hit = was_rate_limited(fetched)
        print(f"  fetched {len(fetched)}/{len(update_tickers)} "
              f"in {time.monotonic()-t0:.0f}s"
              + (" (rate-limited; partial result preserved)" if rate_hit else ""))
        for t in update_tickers:
            row = make_updated_row(t, existing_map[t], fetched.get(t, []),
                                   universe_map[t])
            if row is not None:
                upserts.append(row)
        print(f"  → {len(upserts)} rows with new closes")
        # If we hit the rate limit, skip the new-ticker backfill — it'd just fail.
        if rate_hit:
            print("[etfs] skipping new-ticker backfill due to rate limit")
            new_tickers = []

    # ── 2. Backfill for new tickers ─────────────────────────────────────────
    capped_new = new_tickers if full_backfill else new_tickers[:MAX_NEW_PER_RUN]
    if capped_new:
        print(f"[etfs] backfilling {len(capped_new)} new tickers "
              f"(of {len(new_tickers)} total) …")
        t0 = time.monotonic()
        bf = batched_download(
            capped_new,
            period=BACKFILL_PERIOD,
            chunk_size=BACKFILL_CHUNK,
            sleep_between=BACKFILL_SLEEP,
        )
        rate_hit = was_rate_limited(bf)
        print(f"  fetched {len(bf)}/{len(capped_new)} "
              f"in {time.monotonic()-t0:.0f}s"
              + (" (rate-limited; partial result preserved)" if rate_hit else ""))

        meta_session = _new_session()
        added = 0
        for t in capped_new:
            closes = bf.get(t, [])
            meta = fetch_metadata(t, meta_session)
            row = make_new_row(t, closes, universe_map[t], meta)
            if row is not None:
                upserts.append(row)
                added += 1
            time.sleep(0.3 + random.uniform(0, 0.5))   # gentle on .info endpoint
        print(f"  → {added} new rows ready")

    # ── 3. Push ─────────────────────────────────────────────────────────────
    if push and upserts:
        for i in range(0, len(upserts), 100):
            sb.table("etfs").upsert(upserts[i:i+100], on_conflict="ticker").execute()
        print(f"[Supabase] etfs: {len(upserts)} rows upserted")
    elif upserts:
        print(f"\n(dry run — would upsert {len(upserts)} rows. Use --push.)")

    # ── 4. Retention: drop inactive ETFs ─────────────────────────────────────
    if push:
        retention.cleanup_etfs(sb)

    return len(upserts)


# ── CLI ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Daily ETF refresh → Supabase")
    ap.add_argument("--push",           action="store_true", help="Write to Supabase")
    ap.add_argument("--full-backfill",  action="store_true",
                    help="Treat all universe tickers as new; fetch 2y of closes")
    ap.add_argument("--limit",          type=int, default=0,
                    help="Cap universe size for development")
    args = ap.parse_args()

    n = run(full_backfill=args.full_backfill, push=args.push, limit=args.limit)
    if not n:
        print("[etfs] no rows produced.")


if __name__ == "__main__":
    main()
