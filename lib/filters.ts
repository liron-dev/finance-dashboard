import type { Etf, EtfFilterState, EtfPreset, FilterState, Preset, Stock } from './types';
import { etfSharpe, etfVolatility } from './etf_compute';

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

// ── ETF filters ──────────────────────────────────────────────────────────────

export const ETF_PRESETS: Record<Exclude<EtfPreset, 'Custom' | 'Zombie'>, EtfFilterState> = {
  // Large, cheap, low-volatility broad-market and quality funds
  HQ:     { aumMin: 1000, terMax: 0.20, yoyMin: 0,   sharpeMin: 0.5, volMax: 0.20 },
  // Cheap, lower-vol funds with at least neutral momentum
  Value:  { aumMin: 100,  terMax: 0.30, yoyMin: -10, sharpeMin: 0,   volMax: 0.22 },
  // High-momentum funds; tolerates higher volatility (sector / growth tilt)
  Growth: { aumMin: 100,  terMax: 0.50, yoyMin: 15,  sharpeMin: 0.5, volMax: 0.40 },
};

export const ETF_PRESET_NAMES: EtfPreset[] = ['HQ', 'Value', 'Growth', 'Zombie'];

export const ETF_PRESET_LABEL: Record<EtfPreset, string> = {
  HQ: 'High Quality',
  Value: 'Value',
  Growth: 'Growth',
  Zombie: 'Zombie',
  Custom: 'Custom',
};

/** Apply ETF filters. Zombie inverts: shows funds with at least one warning sign.
 *  Nulls = "missing data, not a constraint violation" → they pass the filter.
 *  This matters for expense_ratio (only ~50% of universe has it from yfinance);
 *  vol/sharpe are computed from returns_1y so all 2000 ETFs have them. */
export const applyEtfFilter = (
  etfs: Etf[],
  filters: EtfFilterState,
  preset: EtfPreset,
): Etf[] => {
  if (preset === 'Zombie') {
    return etfs.filter((e) => {
      const aumM = (e.aum_usd ?? 0) / 1e6;
      const sh = etfSharpe(e);
      const vol = etfVolatility(e);
      return (
        aumM > 0 && (
          aumM < 50 ||                                          // illiquid / closure risk
          (e.expense_ratio != null && e.expense_ratio > 1.0) || // very expensive
          e.yoy_pct < -20 ||                                    // sharp decline
          (sh != null && sh < 0) ||                             // negative risk-adjusted return
          (vol != null && vol > 0.60)                           // wildly volatile (often leveraged/levered)
        )
      );
    });
  }
  return etfs.filter((e) => {
    const aumM = (e.aum_usd ?? 0) / 1e6;
    if (aumM < filters.aumMin) return false;
    // For optional fields: filter ONLY when data exists AND fails the constraint.
    if (e.expense_ratio != null && e.expense_ratio > filters.terMax) return false;
    if (e.yoy_pct < filters.yoyMin) return false;
    const sh = etfSharpe(e);
    if (sh != null && sh < filters.sharpeMin) return false;
    const vol = etfVolatility(e);
    if (vol != null && vol > filters.volMax) return false;
    return true;
  });
};

export const detectEtfPreset = (filters: EtfFilterState): EtfPreset => {
  for (const key of ['HQ', 'Value', 'Growth'] as const) {
    const p = ETF_PRESETS[key];
    if (
      p.aumMin === filters.aumMin &&
      p.terMax === filters.terMax &&
      p.yoyMin === filters.yoyMin &&
      p.sharpeMin === filters.sharpeMin &&
      p.volMax === filters.volMax
    ) {
      return key;
    }
  }
  return 'Custom';
};
