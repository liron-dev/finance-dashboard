import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/primitives/Card';
import { SkeletonCard } from '@/components/primitives/Skeleton';
import { ErrorCard } from '@/components/primitives/ErrorCard';
import { FreshnessBadge } from '@/components/primitives/FreshnessBadge';
import { RangeSlider } from '@/components/inputs/RangeSlider';
import { FilterPresetTabs } from '@/components/inputs/FilterPresetTabs';
import { fetchStocks } from '@/lib/queries';
import { applyFilter, PRESETS, detectPreset } from '@/lib/filters';
import { theme } from '@/lib/theme';
import { formatUsd, formatPct } from '@/lib/format';
import type { FilterState, Preset, Stock } from '@/lib/types';

type SortKey = 'ticker' | 'roic' | 'gross_margin' | 'fcf_margin' | 'int_coverage' | 'pe_ratio' | 'price';
type SortDir = 'asc' | 'desc';

export default function Stocks() {
  const { width } = useWindowDimensions();
  const [all, setAll] = useState<Stock[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('HQ');
  const [filters, setFilters] = useState<FilterState>(PRESETS.HQ);
  const [sortKey, setSortKey] = useState<SortKey>('roic');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = () => {
    setErr(null);
    fetchStocks().then(setAll).catch((e) => setErr(String(e?.message ?? e)));
  };
  useEffect(load, []);

  const onPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'Custom' && p !== 'Zombie') setFilters(PRESETS[p]);
  };
  const onFilter = (patch: Partial<FilterState>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPreset(detectPreset(next));
  };

  const filtered = useMemo(() => {
    if (!all) return [];
    const fil = applyFilter(all, filters, preset);
    const dir = sortDir === 'asc' ? 1 : -1;
    return fil.slice().sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [all, filters, preset, sortKey, sortDir]);

  const isMobile = width < theme.breakpoints.sm;
  const latestDate = all?.[0]?.updated_at ?? null;

  if (err) return <PageShell><ErrorCard label="stocks" message={err} onRetry={load} /></PageShell>;

  return (
    <PageShell>
      <View style={styles.header}>
        <Text style={styles.h1}>Smart Filter</Text>
        <Text style={styles.sub}>Filter the S&P 500 by institutional quality metrics.</Text>
        {latestDate ? (
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <FreshnessBadge date={latestDate} />
          </View>
        ) : null}
      </View>

      <Card title="Preset" subtitle="Pick a style, or tune sliders manually.">
        <FilterPresetTabs value={preset} onChange={onPreset} />
      </Card>

      <View style={{ height: theme.spacing.md }} />

      {preset === 'Zombie' ? (
        <Card title="Zombie filter" subtitle="Low interest coverage, negative free cash flow, or negative earnings.">
          <Text style={styles.desc}>
            This preset inverts the filter — it shows struggling companies: interest coverage &lt; 1×,
            or free cash flow margin negative, or EPS negative (P/E = N/A).
          </Text>
        </Card>
      ) : (
        <Card title="Filters">
          <RangeSlider
            label="Gross Margin ≥"
            min={0}
            max={90}
            step={1}
            value={filters.gmMin}
            onChange={(v) => onFilter({ gmMin: v })}
            format={(v) => `${v}%`}
          />
          <RangeSlider
            label="ROIC ≥"
            min={-20}
            max={60}
            step={1}
            value={filters.roicMin}
            onChange={(v) => onFilter({ roicMin: v })}
            format={(v) => `${v}%`}
          />
          <RangeSlider
            label="FCF Margin ≥"
            min={-20}
            max={40}
            step={1}
            value={filters.fcfMin}
            onChange={(v) => onFilter({ fcfMin: v })}
            format={(v) => `${v}%`}
          />
          <RangeSlider
            label="Interest Coverage ≥"
            min={0}
            max={20}
            step={0.5}
            value={filters.icMin}
            onChange={(v) => onFilter({ icMin: v })}
            format={(v) => `${v.toFixed(1)}×`}
          />
          <RangeSlider
            label="P/E Ratio ≤"
            min={5}
            max={80}
            step={1}
            value={filters.peMax}
            onChange={(v) => onFilter({ peMax: v })}
            format={(v) => `${v}`}
          />
        </Card>
      )}

      <View style={{ height: theme.spacing.md }} />

      {!all ? (
        <SkeletonCard />
      ) : (
        <Card>
          <Text style={styles.count}>
            <Text style={{ color: theme.yellow }}>{filtered.length}</Text>
            <Text style={{ color: theme.textSecondary }}> / {all.length} stocks match</Text>
          </Text>
          {filtered.length === 0 ? (
            <Text style={[styles.desc, { marginTop: theme.spacing.md }]}>
              No stocks match current filters. Try loosening, or switch preset.
            </Text>
          ) : (
            <View style={{ marginTop: theme.spacing.md }}>
              <HeaderRow
                isMobile={isMobile}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={(k) => {
                  if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  else { setSortKey(k); setSortDir('desc'); }
                }}
              />
              <FlatList
                data={filtered}
                keyExtractor={(s) => s.ticker}
                renderItem={({ item }) => <Row stock={item} filters={filters} preset={preset} isMobile={isMobile} />}
                initialNumToRender={30}
                maxToRenderPerBatch={30}
                windowSize={10}
                scrollEnabled={false}
              />
            </View>
          )}
        </Card>
      )}
    </PageShell>
  );
}

function HeaderRow({
  isMobile,
  sortKey,
  sortDir,
  onSort,
}: {
  isMobile: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const hcell = (k: SortKey, label: string, colStyle: any) => (
    <Pressable onPress={() => onSort(k)} style={colStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 } as any}>
        <Text style={styles.th}>{label}</Text>
        {sortKey === k ? (
          <Feather name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} color={theme.yellow} />
        ) : null}
      </View>
    </Pressable>
  );
  return (
    <View style={[styles.trow, styles.thead]}>
      {hcell('ticker', 'Ticker', styles.colTicker)}
      {!isMobile && <Text style={[styles.th, styles.colName]}>Name</Text>}
      {!isMobile && <Text style={[styles.th, styles.colSector]}>Sector</Text>}
      {hcell('price', 'Price', styles.colNum)}
      {hcell('gross_margin', 'GM%', styles.colNum)}
      {hcell('roic', 'ROIC%', styles.colNum)}
      {hcell('fcf_margin', 'FCF%', styles.colNum)}
      {hcell('int_coverage', 'IC×', styles.colNum)}
      {hcell('pe_ratio', 'P/E', styles.colNum)}
    </View>
  );
}

function Row({ stock, filters, preset, isMobile }: { stock: Stock; filters: FilterState; preset: Preset; isMobile: boolean }) {
  const pass = (v: number, min: number) => (v >= min ? theme.green : theme.red);
  const failMax = (v: number, max: number) => (v > 0 && v <= max ? theme.green : v === 0 ? theme.textMuted : theme.red);
  const gm = stock.gross_margin * 100;
  const roic = stock.roic * 100;
  const fcf = stock.fcf_margin * 100;
  const ic = stock.int_coverage;
  const pe = stock.pe_ratio;
  const icDisplay = ic >= 999 ? '∞' : ic.toFixed(1);
  const peDisplay = pe === 0 ? 'N/A' : pe.toFixed(1);
  const zombie = preset === 'Zombie';
  return (
    <View style={styles.trow}>
      <Text style={[styles.td, styles.colTicker, { color: theme.yellow, fontWeight: '700' }]}>{stock.ticker}</Text>
      {!isMobile && <Text style={[styles.td, styles.colName]} numberOfLines={1}>{stock.name}</Text>}
      {!isMobile && <Text style={[styles.td, styles.colSector, { color: theme.textMuted }]} numberOfLines={1}>{stock.sector}</Text>}
      <Text style={[styles.td, styles.colNum]}>{formatUsd(stock.price, 2)}</Text>
      <Text style={[styles.td, styles.colNum, { color: zombie ? theme.textPrimary : pass(gm, filters.gmMin) }]}>{gm.toFixed(1)}</Text>
      <Text style={[styles.td, styles.colNum, { color: zombie ? (roic < 0 ? theme.red : theme.textPrimary) : pass(roic, filters.roicMin) }]}>{roic.toFixed(1)}</Text>
      <Text style={[styles.td, styles.colNum, { color: zombie ? (fcf < 0 ? theme.red : theme.textPrimary) : pass(fcf, filters.fcfMin) }]}>{fcf.toFixed(1)}</Text>
      <Text style={[styles.td, styles.colNum, { color: zombie ? (ic < 1 ? theme.red : theme.textPrimary) : (ic >= filters.icMin || ic >= 999 ? theme.green : theme.red) }]}>{icDisplay}</Text>
      <Text style={[styles.td, styles.colNum, { color: zombie ? (pe === 0 ? theme.red : theme.textPrimary) : failMax(pe, filters.peMax) }]}>{peDisplay}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: theme.spacing.lg },
  h1: { ...theme.type.h1, color: theme.textPrimary },
  sub: { ...theme.type.body, color: theme.textSecondary, marginTop: 4 },
  count: { ...theme.type.h2, color: theme.textPrimary },
  desc: { ...theme.type.body, color: theme.textSecondary },

  trow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.border, alignItems: 'center' },
  thead: { backgroundColor: theme.bgCardAlt, borderTopLeftRadius: theme.radius.sm, borderTopRightRadius: theme.radius.sm },
  th: { ...theme.type.label, color: theme.textSecondary },
  td: { ...theme.type.body, color: theme.textPrimary },

  colTicker: { width: 70 },
  colName: { flex: 1.4, paddingRight: 6 },
  colSector: { width: 140 },
  colNum: { width: 70, textAlign: 'right' },
});
