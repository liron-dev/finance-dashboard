export type Zone = 'green' | 'amber' | 'red' | 'neutral';
export type Metal = 'gold' | 'silver';
export type Preset = 'HQ' | 'Value' | 'Growth' | 'Zombie' | 'Custom';
export type ScoreBucket = '0-20' | '21-40' | '41-60' | '61-80' | '81-100';

export type Stock = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  gross_margin: number;
  roic: number;
  fcf_margin: number;
  int_coverage: number;
  pe_ratio: number;
  updated_at: string;
  market_cap: number | null;
  returns_1y: number[] | null;
};

export type Etf = {
  ticker: string;
  name: string;
  expense_ratio: number | null;     // percent units (0.0945 → 0.0945%)
  aum_usd: number | null;
  current_price: number;
  yoy_pct: number;
  returns_1y: number[];
  last_close_date: string;
  category: string | null;          // Morningstar category, e.g. "Large Growth"
  pb_ratio: number | null;
};

export type EtfMatch = {
  etf: Etf;
  fitPct: number;       // 0..100, R² × 100, clipped to 0 for inverse correlations
};

export type EtfFilterState = {
  aumMin: number;        // millions of USD
  terMax: number;        // percent (0.50 = 0.50%)
  yoyMin: number;        // percent (10 = 10%)
  sharpeMin: number;     // annualized; 1.0 = "good"
  pbMax: number;         // P/B ratio
};

export type EtfPreset = 'HQ' | 'Value' | 'Growth' | 'Zombie' | 'Custom';

export type MacroRow = {
  series_id: string;
  date: string;
  value: number;
};

export type CotRow = {
  metal: Metal;
  report_date: string;
  mm_long: number;
  mm_short: number;
  mm_net: number;
  open_interest: number;
  cot_index: number | null;
};

export type CotPerfRow = {
  metal: Metal;
  score_bucket: ScoreBucket;
  weeks: number;
  median_30d: number | null;
  median_90d: number | null;
};

export type CreditManager = {
  ticker: string;
  name: string;
  price: number;
  jan1_price: number;
  ytd_pct: number;
  updated_at: string;
};

export type ManagerHistRow = {
  ticker: string;
  date: string;
  close: number;
};

export type ComexRow = {
  metal: Metal;
  date: string;
  registered: number;
  eligible: number;
};

export type FilterState = {
  gmMin: number;
  roicMin: number;
  fcfMin: number;
  icMin: number;
  peMax: number;
};
