"""Batched yfinance downloads with curl_cffi chrome impersonation.

Used by `etfs.py` and `script.py` to fetch daily-close history for many
tickers in fewer HTTP fingerprints. yfinance still issues one chart request
per ticker internally, but threads + a shared curl_cffi session minimize
TLS-fingerprint exposure to Yahoo's bot detection.

Returns dates alongside closes so callers can splice incrementally without
guessing trading-day calendars.

Rate-limit handling: Yahoo throttles to ~2000 req/hr/IP. When we detect a
429-class response (raised as YFRateLimitError by yfinance ≥0.2.50) we
**abort** the rest of the loop — re-trying immediately makes things worse.
Callers see a partial result dict and can decide whether to retry next run.
"""
import random, sys, time

import yfinance as yf
from curl_cffi import requests as curl_requests


# yfinance's rate-limit class lives under yfinance.exceptions. Older versions
# don't have it; fall back to detecting "Rate limited" in the error string.
try:
    from yfinance.exceptions import YFRateLimitError as _YFRate
except Exception:  # pragma: no cover
    _YFRate = None


def _is_rate_limit(exc: Exception) -> bool:
    if _YFRate is not None and isinstance(exc, _YFRate):
        return True
    msg = str(exc).lower()
    return "too many requests" in msg or "rate limited" in msg or "429" in msg


def _new_session(impersonate: str = "chrome124"):
    """A curl_cffi session that yfinance can use as drop-in for requests.Session."""
    return curl_requests.Session(impersonate=impersonate)


def batched_download(
    tickers: list[str],
    period: str = "5d",
    chunk_size: int = 100,
    sleep_between: float = 2.0,
    threads: bool = True,
    auto_adjust: bool = True,
) -> dict[str, list[tuple[str, float]]]:
    """Download daily closes for many tickers, returning ticker -> [(date_iso, close), ...].

    - Replaces '.' with '-' for Yahoo (BRK.B → BRK-B), restores it in the result keys.
    - Skips silently on per-chunk failure (other chunks still succeed).
    - Closes are sorted oldest→newest; NaN closes are dropped.
    """
    out: dict[str, list[tuple[str, float]]] = {}
    if not tickers:
        return out

    session = _new_session()
    yahoo = [t.replace(".", "-") for t in tickers]
    yahoo_to_orig = {y: o for y, o in zip(yahoo, tickers)}

    rate_limited = False
    for i in range(0, len(yahoo), chunk_size):
        chunk = yahoo[i : i + chunk_size]
        try:
            df = yf.download(
                chunk,
                period=period,
                threads=threads,
                auto_adjust=auto_adjust,
                progress=False,
                session=session,
                group_by="ticker",     # always MultiIndex (ticker, field)
            )
        except Exception as e:
            if _is_rate_limit(e):
                print(f"  [yf_batch] RATE LIMITED at chunk {i}; aborting "
                      f"({len(out)} tickers fetched so far)", file=sys.stderr)
                rate_limited = True
                break
            print(f"  [yf_batch] chunk {i}-{i+len(chunk)} failed: {e}", file=sys.stderr)
            time.sleep(sleep_between + random.uniform(0, 1.5))
            continue

        if df is None or df.empty:
            # Empty result with no exception is sometimes a soft rate-limit signal
            # from Yahoo (chart endpoint silently returns no data). Track and bail
            # if we see two empties in a row at the start.
            print(f"  [yf_batch] chunk {i}-{i+len(chunk)} returned empty", file=sys.stderr)
            if i == 0 and len(out) == 0:
                # First chunk empty → abort; almost certainly rate-limited or DNS issue
                print(f"  [yf_batch] first chunk empty — aborting to avoid wasted retries",
                      file=sys.stderr)
                rate_limited = True
                break
            time.sleep(sleep_between + random.uniform(0, 1.5))
            continue

        # yfinance always returns MultiIndex columns. They may be in either
        # order: (ticker, field) when group_by='ticker', or (field, ticker)
        # for single-ticker downloads where it ignores group_by silently.
        # Detect by checking whether 'Close' is in the outer level.
        outer = list(df.columns.get_level_values(0).unique())
        close_outer = "Close" in outer
        for t in chunk:
            try:
                series = (df["Close"][t] if close_outer else df[t]["Close"]).dropna()
                if series.empty:
                    continue
                out[yahoo_to_orig[t]] = [
                    (idx.date().isoformat(), float(v))
                    for idx, v in series.items()
                ]
            except (KeyError, IndexError):
                continue

        if i + chunk_size < len(yahoo):
            time.sleep(sleep_between + random.uniform(0, 1.5))

    if rate_limited:
        # Tag the dict so callers can detect partial result. Sentinel key is
        # an empty string which is never a valid ticker.
        out[""] = "rate_limited"  # type: ignore
    return out


def was_rate_limited(result: dict) -> bool:
    """Check if a batched_download() result was truncated by rate limiting."""
    return result.pop("", None) == "rate_limited"


def compute_simple_returns(closes: list[float]) -> list[float]:
    """[c0, c1, c2, ...] → [r1, r2, ...] where r_i = (c_i - c_{i-1}) / c_{i-1}."""
    out: list[float] = []
    for i in range(1, len(closes)):
        prev = closes[i - 1]
        if prev and prev > 0:
            out.append(round((closes[i] - prev) / prev, 6))
    return out
