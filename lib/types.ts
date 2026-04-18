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
};

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
