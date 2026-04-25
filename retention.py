"""Per-table retention policy. Each script calls its corresponding cleanup_*
at the end of its run. Keeps the Supabase DB well below the 0.5 GB free tier
even after years of accumulation.
"""
import os, sys
from datetime import date, timedelta

# ── Retention windows (days) ────────────────────────────────────────────────
RETENTION_DAYS = {
    "macro_indicators_daily":   730,    # FRED daily series (DFF, T10Y2Y, BAML*)
    "macro_indicators_monthly": 1825,   # 5y for M2, PCEPI, PAYEMS
    "macro_indicators_spot":    1825,   # GOLD/SILVER/SPX/NDX/BRENT spot
    "cot_positioning":          1825,   # 5y to feed 156-week Williams %R
    "comex_inventory":          730,    # 2y
    "credit_manager_history":   400,    # YTD + ~1 month buffer
}

DAILY_FRED   = ["DFF", "T10Y2Y", "BAMLH0A0HYM2", "BAMLC0A4CBBB"]
MONTHLY_FRED = ["M2SL", "PCEPI", "PAYEMS"]
SPOT_SERIES  = ["GOLD_SPOT", "SILVER_SPOT", "SPX_SPOT", "NDX_SPOT", "BRENT_SPOT"]


def _cutoff(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat()


def _safe(label: str, fn):
    try:
        n = fn()
        print(f"[retention] {label}: pruned (cutoff applied)")
        return n
    except Exception as e:
        print(f"[retention] {label}: skipped ({e})", file=sys.stderr)
        return None


# ── Cleanup functions ───────────────────────────────────────────────────────
def cleanup_macro(sb):
    """Prune macro_indicators per series category."""
    _safe("macro_indicators daily", lambda: sb.table("macro_indicators")
          .delete().in_("series_id", DAILY_FRED)
          .lt("date", _cutoff(RETENTION_DAYS["macro_indicators_daily"])).execute())
    _safe("macro_indicators monthly", lambda: sb.table("macro_indicators")
          .delete().in_("series_id", MONTHLY_FRED)
          .lt("date", _cutoff(RETENTION_DAYS["macro_indicators_monthly"])).execute())
    _safe("macro_indicators spot", lambda: sb.table("macro_indicators")
          .delete().in_("series_id", SPOT_SERIES)
          .lt("date", _cutoff(RETENTION_DAYS["macro_indicators_spot"])).execute())


def cleanup_cot(sb):
    _safe("cot_positioning", lambda: sb.table("cot_positioning")
          .delete().lt("report_date", _cutoff(RETENTION_DAYS["cot_positioning"])).execute())


def cleanup_comex(sb):
    _safe("comex_inventory", lambda: sb.table("comex_inventory")
          .delete().lt("date", _cutoff(RETENTION_DAYS["comex_inventory"])).execute())


def cleanup_credit_history(sb):
    _safe("credit_manager_history", lambda: sb.table("credit_manager_history")
          .delete().lt("date", _cutoff(RETENTION_DAYS["credit_manager_history"])).execute())


def cleanup_etfs(sb):
    """Drop rows for tickers no longer in the active universe.
    No time-based retention: returns_1y rolls in place, table is wholesale-replaced.
    """
    try:
        inactive = sb.table("etf_universe").select("ticker") \
                     .eq("is_active", False).execute().data or []
        if inactive:
            tickers = [r["ticker"] for r in inactive]
            for i in range(0, len(tickers), 200):
                sb.table("etfs").delete().in_("ticker", tickers[i:i+200]).execute()
            print(f"[retention] etfs: pruned {len(tickers)} inactive tickers")
    except Exception as e:
        print(f"[retention] etfs: skipped ({e})", file=sys.stderr)


# ── CLI for manual sanity checks ────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)


if __name__ == "__main__":
    sb = _sb()
    cleanup_macro(sb)
    cleanup_cot(sb)
    cleanup_comex(sb)
    cleanup_credit_history(sb)
    cleanup_etfs(sb)
    print("[retention] all cleanups attempted.")
