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

# First-time setup: populate stocks table
python script.py --seed-stocks --push

# Daily run: fetch all 500 + upsert metrics
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
  id UUID PRIMARY KEY,
  ticker TEXT UNIQUE NOT NULL,
  name TEXT,
  sector TEXT
);

CREATE TABLE stock_metrics (
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  price REAL,
  gross_margin REAL,
  roic REAL,
  fcf_margin REAL,
  int_coverage REAL,
  pe_ratio REAL,
  PRIMARY KEY (stock_id, date)
);

CREATE INDEX ON stock_metrics (date DESC);

-- Row Level Security (frontend reads via anon key)
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON stocks FOR SELECT USING (true);
CREATE POLICY "public read" ON stock_metrics FOR SELECT USING (true);

-- View for frontend (joins latest metrics with stock info)
CREATE VIEW latest_metrics AS
  SELECT s.ticker, s.name, s.sector, m.*
  FROM stock_metrics m JOIN stocks s ON s.id = m.stock_id
  WHERE m.date = (SELECT MAX(date) FROM stock_metrics);
```

## Storage Estimate

Using `REAL` (4-byte) columns: ~25 MB/year including indexes. The Supabase free tier (500 MB) supports ~20 years of daily data.

## GitHub Actions

The workflow at `.github/workflows/daily-metrics.yml` runs `script.py --push` every weekday at 15:00 UTC (6 PM Israel IDT). Add `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub Settings > Secrets and variables > Actions.

Manual runs are available via the "Run workflow" button in the Actions tab.
