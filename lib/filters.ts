import type { FilterState, Preset, Stock } from './types';

export const PRESETS: Record<Exclude<Preset, 'Custom' | 'Zombie'>, FilterState> = {
  HQ: { gmMin: 40, roicMin: 15, fcfMin: 10, icMin: 5, peMax: 30 },
  Value: { gmMin: 30, roicMin: 10, fcfMin: 5, icMin: 3, peMax: 15 },
  Growth: { gmMin: 50, roicMin: 20, fcfMin: 15, icMin: 5, peMax: 50 },
};

export const PRESET_NAMES: Preset[] = ['HQ', 'Value', 'Growth', 'Zombie'];

export const PRESET_LABEL: Record<Preset, string> = {
  HQ: 'High Quality',
  Value: 'Value',
  Growth: 'Growth',
  Zombie: 'Zombie',
  Custom: 'Custom',
};

export const applyFilter = (stocks: Stock[], filters: FilterState, preset: Preset): Stock[] => {
  if (preset === 'Zombie') {
    return stocks.filter(
      (s) => s.price > 0 && (s.int_coverage < 1 || s.fcf_margin < 0 || s.pe_ratio === 0)
    );
  }
  return stocks.filter((s) => {
    if (s.price <= 0) return false;
    if (s.gross_margin * 100 < filters.gmMin) return false;
    if (s.roic * 100 < filters.roicMin) return false;
    if (s.fcf_margin * 100 < filters.fcfMin) return false;
    // int_coverage capped at 999.99 = debt-free, always passes
    if (s.int_coverage < filters.icMin && s.int_coverage < 999) return false;
    // pe_ratio of 0 means N/A (negative EPS) — exclude from P/E filter
    if (s.pe_ratio === 0 || s.pe_ratio > filters.peMax) return false;
    return true;
  });
};

export const detectPreset = (filters: FilterState): Preset => {
  for (const key of ['HQ', 'Value', 'Growth'] as const) {
    const p = PRESETS[key];
    if (
      p.gmMin === filters.gmMin &&
      p.roicMin === filters.roicMin &&
      p.fcfMin === filters.fcfMin &&
      p.icMin === filters.icMin &&
      p.peMax === filters.peMax
    ) {
      return key;
    }
  }
  return 'Custom';
};
