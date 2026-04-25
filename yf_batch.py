"""Batched yfinance downloads with curl_cffi chrome impersonation.

Used by `etfs.py` and `script.py` to fetch daily-close history for many
tickers in fewer HTTP fingerprints. yfinance still issues one chart request
per ticker internally, but threads + a shared curl_cffi session minimize
TLS-fingerprint exposure to Yahoo's bot detection.

Returns dates alongside closes so callers can splice incrementally without
guessing trading-day calendars.
"""
import random, sys, time

import yfinance as yf
from curl_cffi import requests as curl_requests


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
            print(f"  [yf_batch] chunk {i}-{i+len(chunk)} failed: {e}", file=sys.stderr)
            time.sleep(sleep_between + random.uniform(0, 1.5))
            continue

        if df is None or df.empty:
            print(f"  [yf_batch] chunk {i}-{i+len(chunk)} returned empty", file=sys.stderr)
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

    return out


def compute_simple_returns(closes: list[float]) -> list[float]:
    """[c0, c1, c2, ...] → [r1, r2, ...] where r_i = (c_i - c_{i-1}) / c_{i-1}."""
    out: list[float] = []
    for i in range(1, len(closes)):
        prev = closes[i - 1]
        if prev and prev > 0:
            out.append(round((closes[i] - prev) / prev, 6))
    return out
