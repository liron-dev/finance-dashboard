-- ETF expansion: top 2000 by AUM + add Morningstar category + price-to-book.
-- Sharpe is computed client-side from returns_1y (no column needed).

alter table public.etfs add column if not exists category text;
alter table public.etfs add column if not exists pb_ratio real;
alter table public.etfs add column if not exists metadata_at date;  -- last .info refresh
