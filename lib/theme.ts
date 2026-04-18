import type { Zone } from './types';

export const theme = {
  bg: '#0D0D13',
  bgCard: '#1A1A25',
  bgCardAlt: '#232332',
  border: '#2A2A3A',
  borderHot: '#C85A17',

  yellow: '#FFB800',
  yellowDim: '#C08800',

  green: '#22C55E',
  amber: '#F59E0B',
  red: '#EF4444',
  cyan: '#00D9FF',
  blue: '#2563EB',
  purple: '#A855F7',

  textPrimary: '#FFFFFF',
  textSecondary: '#D1D5DB',
  textMuted: '#7B8299',

  radius: { sm: 6, md: 10, lg: 14, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },

  type: {
    brand: { fontSize: 22, fontWeight: '800' as const, letterSpacing: 0.5 },
    h1: { fontSize: 24, fontWeight: '700' as const },
    h2: { fontSize: 18, fontWeight: '700' as const },
    h3: { fontSize: 14, fontWeight: '700' as const },
    body: { fontSize: 13, fontWeight: '400' as const },
    micro: { fontSize: 11, fontWeight: '400' as const },
    statBig: { fontSize: 32, fontWeight: '800' as const },
    statMedium: { fontSize: 20, fontWeight: '700' as const },
    gaugeCenter: { fontSize: 40, fontWeight: '800' as const },
    label: {
      fontSize: 10,
      fontWeight: '600' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
    },
  },

  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
};

export const creditZone = {
  hySpreadPct: (v: number): Zone => (v < 3.5 ? 'green' : v < 5 ? 'amber' : 'red'),
  fedRatePct: (v: number): Zone => (v < 3 ? 'green' : v < 5 ? 'amber' : 'red'),
  yieldCurvePct: (v: number): Zone => (v > 0.5 ? 'green' : v > 0 ? 'amber' : 'red'),
  payrollsMoMK: (v: number): Zone => (v > 150 ? 'green' : v > 0 ? 'amber' : 'red'),
  pceYoYPct: (v: number): Zone => (v < 2.5 ? 'green' : v < 3.5 ? 'amber' : 'red'),
  bbbSpreadPct: (v: number): Zone => (v < 1.5 ? 'green' : v < 2.5 ? 'amber' : 'red'),
  // Williams Commercial COT Index: low = commercials heavily short (bearish
  // for institutions; contrarian bullish for price), high = commercials long.
  cotIndex: (v: number): Zone =>
    v < 20 ? 'red' : v < 40 ? 'amber' : v < 60 ? 'neutral' : v < 80 ? 'amber' : 'green',
  comexStress: (v: number): Zone => (v < 30 ? 'green' : v < 65 ? 'amber' : 'red'),
};

export const zoneColor = (z: Zone): string =>
  z === 'green' ? theme.green : z === 'amber' ? theme.amber : z === 'red' ? theme.red : theme.textMuted;

export const cotLabel = (v: number): string =>
  v < 20 ? 'EXTREME SELLING' : v < 40 ? 'MORE SELLING THAN BUYING' : v < 60 ? 'NEUTRAL' : v < 80 ? 'MORE BUYING THAN SELLING' : 'EXTREME BUYING';

export const cotInstitutionStance = (v: number): string =>
  v < 20 ? 'INSTITUTIONS ARE SELLING' : v < 40 ? 'MORE SELLING THAN BUYING' : v < 60 ? 'NEUTRAL' : v < 80 ? 'MORE BUYING THAN SELLING' : 'INSTITUTIONS ARE BUYING';
