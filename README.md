# finance-dashboard

Daily S&P 500 fundamental metrics collector with Supabase storage and Vercel-ready frontend.

## Metrics

| Metric | Formula |
|--------|---------|
| `price` | Current market price |
| `gross_margin` | (Revenue - COGS) / Revenue |
| `roic` | Net Income / (Equity + Debt) |
| `fcf_margin` | Free Cash Flow / Revenue |
| `int_coverage` | EBIT / \|Interest Expense\| |
| `pe_ratio` | Price / Trailing EPS |

## Usage

```bash
# Dev: fetch first 10 tickers, print table only
python script.py --limit 10

# Daily run: fetch all 500 + replace Supabase data
python script.py --push
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Service-role key (NOT anon) |

## SQL Schema

Run once in the Supabase SQL editor:

```sql
CREATE TABLE stocks (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  price REAL,
  gross_margin REAL,
  roic REAL,
  fcf_margin REAL,
  int_coverage REAL,
  pe_ratio REAL,
  updated_at DATE
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON stocks FOR SELECT USING (true);
```

## Data Model

Single table, no history. Each daily run replaces all rows with fresh data.
If a run fails (< 90% of tickers succeed), existing data is preserved.

## GitHub Actions

The workflow at `.github/workflows/daily-metrics.yml` runs `script.py --push` every weekday at 15:00 UTC (6 PM Israel IDT). Add `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub Settings > Secrets and variables > Actions.

Manual runs are available via the "Run workflow" button in the Actions tab.

## ETF Matching

The `/stocks` page has a **Find Matching ETFs** button that ranks the top 1000 US ETFs against a market-cap-weighted portfolio of the currently-filtered stocks (R² of 1y daily-return correlation, capped at 0 for inverse-correlated funds).

### Tables (apply via Supabase Studio SQL editor)

`supabase/migrations/0001_etf_feature.sql` creates `etf_universe`, `etfs`, and adds `market_cap` + `returns_1y` columns to `stocks`. Idempotent — safe to re-run.

### Daily pipeline (in workflow)

| Script | Purpose |
|--------|---------|
| `etf_universe_scraper.py --push` | Scrape top 1000 ETFs by AUM from stockanalysis.com → `etf_universe` |
| `script.py --push` | S&P 500 fundamentals + `market_cap` + 1y daily returns |
| `macro.py --push`, `comex.py --push` | Existing flows; now also call retention cleanup |
| `etfs.py --push` | Incremental ETF close refresh (5d window, splices into stored `returns_1y`); auto-backfills new tickers (max 50/run) |

### One-time backfill

After applying the SQL migration, trigger the workflow manually with `backfill = true`:
- GitHub → Actions → "Daily S&P 500 Metrics" → Run workflow → ☑ backfill → Run.
- This causes `etfs.py --full-backfill` to fetch 2y of closes for all 1000 tickers (~20 min, one-time).

### Retention

`retention.py` is invoked at the end of each script and prunes:
- `macro_indicators`: 2y for daily FRED (DFF, BAML*), 5y for monthly + spot.
- `cot_positioning`: 5y (feeds 156-week Williams %R lookback).
- `comex_inventory`: 2y. `credit_manager_history`: 400 days. `etfs`: drops inactive tickers.

Total DB size after retention is ≈5 MB — well under the 0.5 GB free tier.

### Free-tier footprint

GitHub Actions: ~22 min/day × 22 weekdays ≈ 485 min/month (24% of 2000-min quota).
yfinance: requests batched in chunks of 50–100 with curl_cffi chrome impersonation and 2–5 s jitter.
