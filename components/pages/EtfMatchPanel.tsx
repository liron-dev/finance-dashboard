import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Button } from '@/components/primitives/Button';
import { Spinner } from '@/components/primitives/Spinner';
import { ErrorCard } from '@/components/primitives/ErrorCard';
import { fetchAllEtfs } from '@/lib/queries';
import { matchEtfs } from '@/lib/matching';
import { theme } from '@/lib/theme';
import type { EtfMatch, Stock } from '@/lib/types';
import { EtfResultTable } from './EtfResultTable';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; matches: EtfMatch[]; computeMs: number; stocksUsed: number; etfsScanned: number }
  | { kind: 'stale'; matches: EtfMatch[]; stocksUsed: number; etfsScanned: number }
  | { kind: 'error'; message: string };

type Props = {
  filtered: Stock[];
  filterHash: string;
  isMobile: boolean;
};

export function EtfMatchPanel({ filtered, filterHash, isMobile }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const lastHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      (state.kind === 'ready' || state.kind === 'stale') &&
      lastHashRef.current !== null &&
      lastHashRef.current !== filterHash
    ) {
      setState((prev) => {
        if (prev.kind !== 'ready' && prev.kind !== 'stale') return prev;
        return {
          kind: 'stale',
          matches: prev.matches,
          stocksUsed: prev.stocksUsed,
          etfsScanned: prev.etfsScanned,
        };
      });
    }
  }, [filterHash]);

  const usableStockCount = filtered.filter(
    (s) =>
      s.market_cap != null &&
      s.market_cap > 0 &&
      Array.isArray(s.returns_1y) &&
      s.returns_1y.length >= 60,
  ).length;

  const onPress = async () => {
    setState({ kind: 'loading' });
    const t0 = performance.now();
    try {
      const etfs = await fetchAllEtfs();
      const matches = matchEtfs(filtered, etfs, 10);
      lastHashRef.current = filterHash;
      setState({
        kind: 'ready',
        matches,
        computeMs: performance.now() - t0,
        stocksUsed: usableStockCount,
        etfsScanned: etfs.length,
      });
    } catch (e: any) {
      setState({ kind: 'error', message: String(e?.message ?? e) });
    }
  };

  const disabled = usableStockCount < 3;

  return (
    <Card
      title="ETF Match"
      subtitle={
        usableStockCount === 0 && filtered.length > 0
          ? "Today's stock returns aren't loaded yet — please retry tomorrow."
          : 'Top 10 US ETFs whose 1-year return shape matches your filtered, market-cap-weighted portfolio.'
      }
    >
      {(state.kind === 'idle' || state.kind === 'stale') && (
        <View style={styles.controls}>
          <Button
            label="Find Matching ETFs"
            onPress={onPress}
            disabled={disabled}
            fullWidth={isMobile}
          />
          {disabled && (
            <Text style={styles.hint}>
              {filtered.length === 0
                ? 'Adjust filters to include at least 3 stocks.'
                : `Need at least 3 filtered stocks with returns data — currently ${usableStockCount}.`}
            </Text>
          )}
          {state.kind === 'stale' && (
            <Text style={styles.staleHint}>
              Showing previous results — re-run for current filters.
            </Text>
          )}
        </View>
      )}

      {state.kind === 'loading' && (
        <View style={styles.loading}>
          <Spinner size={32} />
          <Text style={styles.loadingText}>Matching against ~1000 ETFs…</Text>
        </View>
      )}

      {state.kind === 'error' && (
        <View style={{ marginTop: theme.spacing.sm }}>
          <ErrorCard label="ETF match" message={state.message} onRetry={onPress} />
        </View>
      )}

      {(state.kind === 'ready' || state.kind === 'stale') && (
        <>
          <Text style={styles.basis}>
            <Text style={styles.basisStrong}>{state.matches.length}</Text>
            <Text style={styles.basisMuted}>
              {' '}top matches • weighted across{' '}
            </Text>
            <Text style={styles.basisStrong}>{state.stocksUsed}</Text>
            <Text style={styles.basisMuted}> stocks vs. </Text>
            <Text style={styles.basisStrong}>{state.etfsScanned}</Text>
            <Text style={styles.basisMuted}> ETFs</Text>
            {state.kind === 'ready' && state.computeMs ? (
              <Text style={styles.basisMuted}>
                {' '}• {(state.computeMs / 1000).toFixed(1)}s
              </Text>
            ) : null}
          </Text>
          <EtfResultTable
            matches={state.matches}
            isMobile={isMobile}
            stale={state.kind === 'stale'}
            rerun={state.kind === 'stale' ? onPress : undefined}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 8 } as any,
  hint: { ...theme.type.micro, color: theme.textMuted },
  staleHint: { ...theme.type.micro, color: theme.amber },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    gap: 12,
  } as any,
  loadingText: { ...theme.type.body, color: theme.textMuted },
  basis: {
    ...theme.type.body,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  basisStrong: { color: theme.yellow, fontWeight: '700' },
  basisMuted: { color: theme.textMuted },
});
