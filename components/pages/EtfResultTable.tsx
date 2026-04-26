import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/lib/theme';
import { formatPct, formatSignedPct, formatUsd } from '@/lib/format';
import type { EtfMatch } from '@/lib/types';

const fitColor = (fit: number): string =>
  fit >= 80 ? theme.green : fit >= 50 ? theme.amber : theme.red;

// yfinance returns expense_ratio in percent units already (e.g. SPY = 0.0945
// means 0.0945%, not 9.45%), so we don't multiply by 100. Show extra digit
// for ultra-low-cost ETFs (≤0.1%).
const formatTer = (er: number | null): string => {
  if (er == null || !isFinite(er)) return '—';
  return er < 0.1 ? `${er.toFixed(3)}%` : `${er.toFixed(2)}%`;
};

type Props = {
  matches: EtfMatch[];
  isMobile: boolean;
  stale?: boolean;
  rerun?: () => void;
};

export function EtfResultTable({ matches, isMobile, stale, rerun }: Props) {
  return (
    <View style={{ marginTop: theme.spacing.sm }}>
      {stale ? (
        <View style={styles.staleBanner}>
          <Text style={styles.staleText}>
            Filters changed — match results may be out of date.
          </Text>
          {rerun ? (
            <Pressable onPress={rerun} style={styles.rerunBtn}>
              <Feather name="refresh-ccw" size={12} color={theme.yellow} />
              <Text style={styles.rerunText}>Re-run</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.trow, styles.thead]}>
        <Text style={[styles.th, styles.colTicker]}>Ticker</Text>
        {!isMobile && <Text style={[styles.th, styles.colName]}>Name</Text>}
        {!isMobile && <Text style={[styles.th, styles.colNum]}>Price</Text>}
        <Text style={[styles.th, styles.colNum]}>TER</Text>
        <Text style={[styles.th, styles.colNum]}>YoY</Text>
        <Text style={[styles.th, styles.colNum]}>Fit %</Text>
      </View>

      {matches.length === 0 ? (
        <Text style={styles.empty}>
          No matches — your filtered set may have insufficient return history yet.
        </Text>
      ) : (
        matches.map((m) => (
          <Row key={m.etf.ticker} match={m} isMobile={isMobile} />
        ))
      )}
    </View>
  );
}

function Row({ match, isMobile }: { match: EtfMatch; isMobile: boolean }) {
  const { etf, fitPct } = match;
  return (
    <View style={styles.trow}>
      <Text style={[styles.td, styles.colTicker, styles.tickerCell]}>{etf.ticker}</Text>
      {!isMobile && (
        <Text style={[styles.td, styles.colName]} numberOfLines={1}>
          {etf.name}
        </Text>
      )}
      {!isMobile && (
        <Text style={[styles.td, styles.colNum]}>{formatUsd(etf.current_price, 2)}</Text>
      )}
      <Text style={[styles.td, styles.colNum]}>{formatTer(etf.expense_ratio)}</Text>
      <Text
        style={[
          styles.td,
          styles.colNum,
          { color: etf.yoy_pct >= 0 ? theme.green : theme.red },
        ]}
      >
        {formatSignedPct(etf.yoy_pct, 1)}
      </Text>
      <Text
        style={[
          styles.td,
          styles.colNum,
          { color: fitColor(fitPct), fontWeight: '700' },
        ]}
      >
        {formatPct(fitPct, 1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  trow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'center',
  },
  thead: {
    backgroundColor: theme.bgCardAlt,
    borderTopLeftRadius: theme.radius.sm,
    borderTopRightRadius: theme.radius.sm,
  },
  th: { ...theme.type.label, color: theme.textSecondary },
  td: { ...theme.type.body, color: theme.textPrimary },
  tickerCell: { color: theme.yellow, fontWeight: '700' },

  colTicker: { width: 70 },
  colName: { flex: 1.4, paddingRight: 6 },
  colNum: { width: 70, textAlign: 'right' },

  empty: {
    ...theme.type.body,
    color: theme.textMuted,
    paddingVertical: theme.spacing.md,
  },

  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.bgCardAlt,
    borderLeftWidth: 3,
    borderLeftColor: theme.amber,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.sm,
    gap: 8,
  } as any,
  staleText: { ...theme.type.body, color: theme.textSecondary, flex: 1 },
  rerunBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.yellow,
  } as any,
  rerunText: { ...theme.type.label, color: theme.yellow },
});
