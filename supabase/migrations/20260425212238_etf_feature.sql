-- ETF matching feature: adds two tables and extends `stocks`.
-- Apply via Supabase Studio SQL editor (config.toml has schema_paths = []).
--
-- Idempotent: safe to re-run. Drop blocks at top if you need a clean slate.

-- ── 1. etf_universe ──────────────────────────────────────────────────────────
create table if not exists public.etf_universe (
  ticker        text primary key,
  name          text not null,
  aum_usd       bigint,
  rank_by_aum   int,
  last_seen_at  date not null default (now() at time zone 'utc')::date,
  is_active     boolean not null default true,
  added_at      date not null default (now() at time zone 'utc')::date
);
create index if not exists idx_etf_universe_rank
  on public.etf_universe (rank_by_aum) where is_active;

alter table public.etf_universe enable row level security;
drop policy if exists "etf_universe public read" on public.etf_universe;
create policy "etf_universe public read" on public.etf_universe
  for select using (true);

-- ── 2. etfs ──────────────────────────────────────────────────────────────────
create table if not exists public.etfs (
  ticker           text primary key references public.etf_universe(ticker) on delete cascade,
  name             text not null,
  expense_ratio    real,
  aum_usd          bigint,
  current_price    real not null,
  yoy_pct          real not null,
  returns_1y       real[] not null,
  last_close_date  date  not null,
  updated_at       timestamptz not null default now()
);
create index if not exists idx_etfs_last_close on public.etfs (last_close_date);

alter table public.etfs enable row level security;
drop policy if exists "etfs public read" on public.etfs;
create policy "etfs public read" on public.etfs
  for select using (true);

-- ── 3. extend stocks ─────────────────────────────────────────────────────────
alter table public.stocks add column if not exists market_cap bigint;
alter table public.stocks add column if not exists returns_1y real[];

-- Sanity check (run manually):
-- select polname, polcmd from pg_policies
--  where schemaname = 'public' and tablename in ('etf_universe','etfs');
