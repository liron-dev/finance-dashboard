#!/usr/bin/env python3
"""Refresh the top ~1000 US ETFs by AUM into Supabase `etf_universe`.

Source: https://stockanalysis.com/etf/screener/ ships its full ETF list
(~5100 funds, sorted by AUM descending) as a JS-literal array inside a
SvelteKit data script. We fetch the page once with curl_cffi (chrome
impersonation) and parse the array with a tolerant regex.

Falls back to a bundled CSV (`etf_universe_seed.csv`) if the scrape fails;
falls back to existing DB rows if even that is unavailable.

Free-tier safe: one HTTP request (~880 KB), <5 s wall time.
"""
import argparse, csv, os, re, sys
from datetime import date

from curl_cffi import requests as curl_requests

# ── Config ────────────────────────────────────────────────────────────────────
SCREENER_URL = "https://stockanalysis.com/etf/screener/"
IMPERSONATE = "chrome124"
TARGET_COUNT = 2000
SEED_CSV = os.path.join(os.path.dirname(__file__), "etf_universe_seed.csv")
HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Tolerant parser: matches `{s:"TICKER",n:"NAME",assetClass:"...",aum:NUMBER`
# Handles double-quoted strings with backslash escapes; assetClass tolerates
# any single-quoted-string contents. We don't care about fields beyond aum.
ITEM_RE = re.compile(
    r'\{s:"((?:[^"\\]|\\.)*)",'
    r'n:"((?:[^"\\]|\\.)*)",'
    r'assetClass:"[^"]*",'
    r'aum:([0-9.eE+-]+)'
)


# ── Primary: scrape stockanalysis.com /etf/screener/ ─────────────────────────
def _extract_data_array(html: str) -> str | None:
    """Return the substring `[...]` immediately following `count:NNN,data:`."""
    m = re.search(r'count:\d+,data:\[', html)
    if not m:
        return None
    start = m.end() - 1  # index of '['
    depth = 0
    in_str = False
    quote = ""
    escape = False
    for i in range(start, len(html)):
        c = html[i]
        if escape:
            escape = False
            continue
        if in_str:
            if c == "\\":
                escape = True
            elif c == quote:
                in_str = False
            continue
        if c in ('"', "'"):
            in_str = True
            quote = c
        elif c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return html[start : i + 1]
    return None


def scrape_stockanalysis() -> list[dict]:
    print("  fetching", SCREENER_URL)
    try:
        resp = curl_requests.get(
            SCREENER_URL, headers=HEADERS, impersonate=IMPERSONATE, timeout=30
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"  [!] download failed: {e}", file=sys.stderr)
        return []

    arr = _extract_data_array(resp.text)
    if not arr:
        print("  [!] data array not found in page (layout changed?)", file=sys.stderr)
        return []

    rows: list[dict] = []
    seen: set[str] = set()
    for sym, name, aum in ITEM_RE.findall(arr):
        sym = sym.strip().upper()
        if not sym or sym in seen:
            continue
        seen.add(sym)
        try:
            aum_int = int(float(aum))
        except (TypeError, ValueError):
            aum_int = None
        # Unescape JS-literal sequences: \" \\ \/ \n
        clean_name = name.replace('\\"', '"').replace("\\\\", "\\").replace("\\/", "/").replace("\\n", " ")
        rows.append({"ticker": sym, "name": clean_name.strip(), "aum_usd": aum_int})

    # Already sorted by AUM in the source; keep that order, but be defensive:
    rows.sort(key=lambda r: (r["aum_usd"] is None, -(r["aum_usd"] or 0)))
    print(f"  parsed {len(rows)} ETFs from page (taking top {TARGET_COUNT})")
    return rows[:TARGET_COUNT]


# ── Fallback: bundled CSV ────────────────────────────────────────────────────
def load_seed_csv() -> list[dict]:
    if not os.path.exists(SEED_CSV):
        return []
    out = []
    with open(SEED_CSV, newline="") as f:
        for r in csv.DictReader(f):
            try:
                aum = int(r["aum_usd"]) if r.get("aum_usd") else None
            except ValueError:
                aum = None
            out.append({"ticker": r["ticker"].strip().upper(),
                        "name": r["name"].strip(), "aum_usd": aum})
    return out[:TARGET_COUNT]


# ── Supabase ─────────────────────────────────────────────────────────────────
def _sb():
    from supabase import create_client
    url, key = os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", "")
    if not url or not key:
        sys.exit("[error] Set SUPABASE_URL and SUPABASE_KEY env vars.")
    return create_client(url, key)


def upsert_universe(rows: list[dict]):
    sb = _sb()
    today = date.today().isoformat()
    payload = []
    for i, r in enumerate(rows, start=1):
        if not r["ticker"] or not r["name"]:
            continue
        payload.append({
            "ticker": r["ticker"],
            "name": r["name"][:200],
            "aum_usd": r["aum_usd"],
            "rank_by_aum": i,
            "last_seen_at": today,
            "is_active": True,
        })

    # Upsert in chunks of 500
    for i in range(0, len(payload), 500):
        sb.table("etf_universe").upsert(payload[i:i+500], on_conflict="ticker").execute()

    # Mark anything not seen today as inactive
    sb.table("etf_universe").update({"is_active": False}) \
      .neq("last_seen_at", today).execute()
    print(f"[Supabase] etf_universe: {len(payload)} rows upserted "
          f"(rank 1..{len(payload)}, others marked inactive)")


def write_seed_csv(rows: list[dict]):
    """Save a fresh seed CSV from the latest scrape (manual use)."""
    with open(SEED_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["ticker", "name", "aum_usd"])
        w.writeheader()
        for r in rows:
            w.writerow({"ticker": r["ticker"], "name": r["name"],
                        "aum_usd": r["aum_usd"] if r["aum_usd"] is not None else ""})
    print(f"[seed] wrote {len(rows)} rows to {SEED_CSV}")


# ── Entry point ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Refresh ETF universe → Supabase")
    ap.add_argument("--push",       action="store_true", help="Write to Supabase")
    ap.add_argument("--write-seed", action="store_true",
                    help="Save the latest scrape to etf_universe_seed.csv")
    ap.add_argument("--use-seed",   action="store_true",
                    help="Skip scrape, load directly from seed CSV")
    args = ap.parse_args()

    rows: list[dict] = []
    if not args.use_seed:
        print("── Scraping stockanalysis.com /etf/screener/ ──")
        rows = scrape_stockanalysis()

    if not rows:
        print("\n── Falling back to seed CSV ──")
        rows = load_seed_csv()
        print(f"  loaded {len(rows)} ETFs from seed")

    if not rows:
        print("[fatal] No ETFs from any source. Existing DB rows preserved.",
              file=sys.stderr)
        sys.exit(1)

    print(f"\n── Top 10 by AUM ──")
    for r in rows[:10]:
        aum = f"${r['aum_usd']/1e9:.1f}B" if r["aum_usd"] else "—"
        print(f"  {r['ticker']:<6}  {aum:>8}  {r['name'][:60]}")
    print(f"\n── Bottom of top {len(rows)} ──")
    last = rows[-1]
    aum_l = f"${last['aum_usd']/1e6:.0f}M" if last["aum_usd"] else "—"
    print(f"  rank {len(rows)}: {last['ticker']:<6}  {aum_l:>8}  {last['name'][:60]}")

    if args.write_seed:
        write_seed_csv(rows)

    if args.push:
        upsert_universe(rows)
    else:
        print("\n(dry run — use --push to write to Supabase)")


if __name__ == "__main__":
    main()
