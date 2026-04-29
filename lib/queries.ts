import { supabase } from './supabase';
import { isoAgo } from './format';
import type {
  ComexRow,
  CotPerfRow,
  CotRow,
  CreditManager,
  Etf,
  MacroRow,
  ManagerHistRow,
  Stock,
} from './types';

export type HomeData = {
  goldCot: CotRow | null;
  hySpread: MacroRow | null;
  stocks: Stock[];
  etfHqCount: number | null;     // ETFs ≥ $1B AUM, TER ≤ 0.20%, YoY ≥ 0%
  etfTotal: number | null;
  latestDate: string | null;
};

export async function fetchHomeSnapshot(): Promise<HomeData> {
  const [cotRes, hyRes, stocksRes, etfHqRes, etfTotalRes] = await Promise.all([
    supabase
      .from('cot_positioning')
      .select('*')
      .eq('metal', 'gold')
      .not('cot_index', 'is', null)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'BAMLH0A0HYM2')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stocks')
      .select('ticker, name, sector, price, gross_margin, roic, fcf_margin, int_coverage, pe_ratio, updated_at')
      .gt('price', 0),
    // Server-side counts — no row payload, just a count header.
    // HQ-ish approximation: large, cheap, positive YoY. The full HQ preset
    // also requires Sharpe ≥ 0.5 and Vol ≤ 20% (computed client-side from
    // returns_1y), so /etfs HQ will show fewer matches than this.
    supabase
      .from('etfs')
      .select('*', { count: 'exact', head: true })
      .gte('aum_usd', 1_000_000_000)
      .or('expense_ratio.is.null,expense_ratio.lte.0.20')
      .gte('yoy_pct', 0),
    supabase
      .from('etfs')
      .select('*', { count: 'exact', head: true }),
  ]);

  const dates = [
    cotRes.data?.report_date,
    hyRes.data?.date,
    stocksRes.data?.[0]?.updated_at,
  ].filter(Boolean) as string[];
  const latestDate = dates.sort().reverse()[0] ?? null;

  return {
    goldCot: (cotRes.data as CotRow) ?? null,
    hySpread: (hyRes.data as MacroRow) ?? null,
    stocks: (stocksRes.data as Stock[]) ?? [],
    etfHqCount: etfHqRes.count ?? null,
    etfTotal: etfTotalRes.count ?? null,
    latestDate,
  };
}

export type MetalsData = {
  cotLatest: CotRow[];
  cotPerf: CotPerfRow[];
  comex: ComexRow[];
  spots: MacroRow[];
};

export async function fetchMetals(): Promise<MetalsData> {
  const since = isoAgo(400);
  const [cotRes, perfRes, comexRes, spotRes] = await Promise.all([
    supabase
      .from('cot_positioning')
      .select('*')
      .not('cot_index', 'is', null)
      .order('report_date', { ascending: false })
      .limit(200),
    supabase.from('cot_performance').select('*'),
    supabase
      .from('comex_inventory')
      .select('*')
      .gte('date', since)
      .order('date', { ascending: true }),
    supabase
      .from('macro_indicators')
      .select('*')
      .in('series_id', ['GOLD_SPOT', 'SILVER_SPOT'])
      .gte('date', since)
      .order('date', { ascending: true }),
  ]);

  // Pick latest row per metal
  const latestByMetal = new Map<string, CotRow>();
  for (const r of (cotRes.data as CotRow[]) ?? []) {
    if (!latestByMetal.has(r.metal)) latestByMetal.set(r.metal, r);
  }

  return {
    cotLatest: Array.from(latestByMetal.values()),
    cotPerf: (perfRes.data as CotPerfRow[]) ?? [],
    comex: (comexRes.data as ComexRow[]) ?? [],
    spots: (spotRes.data as MacroRow[]) ?? [],
  };
}

export async function fetchStocks(): Promise<Stock[]> {
  const { data } = await supabase
    .from('stocks')
    .select('ticker, name, sector, price, gross_margin, roic, fcf_margin, int_coverage, pe_ratio, updated_at, market_cap, returns_1y')
    .gt('price', 0)
    .order('ticker', { ascending: true });
  return (data as Stock[]) ?? [];
}

export async function fetchAllEtfs(): Promise<Etf[]> {
  // Universe is up to 2000 ETFs, but PostgREST caps a single page at 1000.
  // Page through with explicit ranges.
  const cols = 'ticker, name, expense_ratio, aum_usd, current_price, yoy_pct, returns_1y, last_close_date, category, pb_ratio';
  const out: Etf[] = [];
  for (let page = 0; page < 4; page++) {
    const from = page * 1000;
    const to = from + 999;
    const { data, error } = await supabase
      .from('etfs')
      .select(cols)
      .order('aum_usd', { ascending: false, nullsFirst: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = (data as Etf[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export type CreditData = {
  m2: MacroRow[];
  dff: MacroRow | null;
  curve: MacroRow | null;
  hy: MacroRow | null;
  bbb: MacroRow | null;
  pce: MacroRow[];
  payems: MacroRow[];
  gold: MacroRow | null;
  silver: MacroRow | null;
  managers: CreditManager[];
  managerHist: ManagerHistRow[];
};

export async function fetchCredit(): Promise<CreditData> {
  const [m2Res, dailyRes, pceRes, payRes, spotRes, mgrRes, histRes] = await Promise.all([
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'M2SL')
      .order('date', { ascending: false })
      .limit(24),
    supabase
      .from('macro_indicators')
      .select('*')
      .in('series_id', ['DFF', 'T10Y2Y', 'BAMLH0A0HYM2', 'BAMLC0A4CBBB'])
      .order('date', { ascending: false })
      .limit(40),
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'PCEPI')
      .order('date', { ascending: false })
      .limit(13),
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'PAYEMS')
      .order('date', { ascending: false })
      .limit(2),
    supabase
      .from('macro_indicators')
      .select('*')
      .in('series_id', ['GOLD_SPOT', 'SILVER_SPOT'])
      .order('date', { ascending: false })
      .limit(4),
    supabase.from('credit_managers').select('*'),
    supabase.from('credit_manager_history').select('*').order('date', { ascending: true }),
  ]);

  const daily = (dailyRes.data as MacroRow[]) ?? [];
  const firstOf = (id: string) => daily.find((r) => r.series_id === id) ?? null;
  const spots = (spotRes.data as MacroRow[]) ?? [];
  const firstSpot = (id: string) => spots.find((r) => r.series_id === id) ?? null;

  return {
    m2: ((m2Res.data as MacroRow[]) ?? []).slice().reverse(),
    dff: firstOf('DFF'),
    curve: firstOf('T10Y2Y'),
    hy: firstOf('BAMLH0A0HYM2'),
    bbb: firstOf('BAMLC0A4CBBB'),
    pce: ((pceRes.data as MacroRow[]) ?? []).slice().reverse(),
    payems: ((payRes.data as MacroRow[]) ?? []).slice().reverse(),
    gold: firstSpot('GOLD_SPOT'),
    silver: firstSpot('SILVER_SPOT'),
    managers: (mgrRes.data as CreditManager[]) ?? [],
    managerHist: (histRes.data as ManagerHistRow[]) ?? [],
  };
}

export type TickerSymbol = 'GOLD_SPOT' | 'SILVER_SPOT' | 'SPX_SPOT' | 'NDX_SPOT' | 'BRENT_SPOT';

export type TickerQuote = {
  series: TickerSymbol;
  today: MacroRow;
  yesterday: MacroRow | null;
  yearAgo: MacroRow | null;
};

export type SpotData = {
  quotes: TickerQuote[];
};

const TICKER_ORDER: TickerSymbol[] = [
  'GOLD_SPOT',
  'SILVER_SPOT',
  'SPX_SPOT',
  'NDX_SPOT',
  'BRENT_SPOT',
];

export async function fetchSpotTicker(): Promise<SpotData> {
  // One query per ticker: Supabase's default 1000-row cap on a combined
  // .in() query truncates the oldest rows, leaving ~9mo of data per ticker
  // which is too short to look up the 365-day-ago row for YoY.
  const since = isoAgo(400);
  const perSeries = await Promise.all(
    TICKER_ORDER.map((sym) =>
      supabase
        .from('macro_indicators')
        .select('*')
        .eq('series_id', sym)
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(500)
        .then(({ data }) => [sym, (data as MacroRow[]) ?? []] as const),
    ),
  );

  const quotes: TickerQuote[] = [];
  for (const [sym, series] of perSeries) {
    if (!series.length) continue;
    const today = series[0];
    const yesterday: MacroRow | null = series[1] ?? null;
    const target = new Date(today.date);
    target.setDate(target.getDate() - 365);
    const targetMs = target.getTime();
    let yearAgo: MacroRow | null = null;
    let bestDiff = Infinity;
    for (const r of series) {
      const diff = Math.abs(new Date(r.date).getTime() - targetMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        yearAgo = r;
      }
    }
    if (yearAgo && bestDiff > 14 * 86400000) yearAgo = null;
    quotes.push({ series: sym, today, yesterday, yearAgo });
  }
  return { quotes };
}
