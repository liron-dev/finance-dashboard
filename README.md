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
