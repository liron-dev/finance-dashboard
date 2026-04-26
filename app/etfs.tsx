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
import { fetchAllEtfs } from '@/lib/queries';
import {
  ETF_PRESETS,
  applyEtfFilter,
  detectEtfPreset,
} from '@/lib/filters';
import { etfSharpe } from '@/lib/etf_compute';
import { theme } from '@/lib/theme';
import { formatBigNum, formatSignedPct, formatUsd } from '@/lib/format';
import type { Etf, EtfFilterState, EtfPreset } from '@/lib/types';

type SortKey =
  | 'ticker'
  | 'aum_usd'
  | 'expense_ratio'
  | 'yoy_pct'
  | 'sharpe'
  | 'pb_ratio'
  | 'current_price';
type SortDir = 'asc' | 'desc';

export default function Etfs() {
  const { width } = useWindowDimensions();
  const [all, setAll] = useState<Etf[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preset, setPreset] = useState<EtfPreset>('HQ');
  const [filters, setFilters] = useState<EtfFilterState>(ETF_PRESETS.HQ);
  const [sortKey, setSortKey] = useState<SortKey>('aum_usd');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = () => {
    setErr(null);
    fetchAllEtfs().then(setAll).catch((e) => setErr(String(e?.message ?? e)));
  };
  useEffect(load, []);

  const onPreset = (p: EtfPreset) => {
    setPreset(p);
    if (p !== 'Custom' && p !== 'Zombie') setFilters(ETF_PRESETS[p]);
  };
  const onFilter = (patch: Partial<EtfFilterState>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPreset(detectEtfPreset(next));
  };

  // Pre-compute Sharpe so the table can sort by it without recomputing.
  const enriched = useMemo(() => {
    if (!all) return [];
    return all.map((e) => ({ ...e, _sharpe: etfSharpe(e) }));
  }, [all]);

  const filtered = useMemo(() => {
    if (!enriched.length) return [];
    const fil = applyEtfFilter(enriched, filters, preset);
    const dir = sortDir === 'asc' ? 1 : -1;
    return fil.slice().sort((a: any, b: any) => {
      let av: any;
      let bv: any;
      if (sortKey === 'sharpe') {
        av = a._sharpe ?? -Infinity;
        bv = b._sharpe ?? -Infinity;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
        if (av == null) av = -Infinity;
        if (bv == null) bv = -Infinity;
      }
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [enriched, filters, preset, sortKey, sortDir]);

  const isMobile = width < theme.breakpoints.sm;
  const latestDate = all?.[0]?.last_close_date ?? null;

  if (err) return <PageShell><ErrorCard label="ETFs" message={err} onRetry={load} /></PageShell>;

  return (
    <PageShell>
      <View style={styles.header}>
        <Text style={styles.h1}>ETF Smart Filter</Text>
        <Text style={styles.sub}>Filter the top 2000 US ETFs by AUM, fees, momentum, and risk-adjusted return.</Text>
        {latestDate ? (
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <FreshnessBadge date={latestDate} />
          </View>
        ) : null}
      </View>

      <Card title="Preset" subtitle="Pick a style, or tune sliders manually.">
        <FilterPresetTabs value={preset as any} onChange={onPreset as any} />
      </Card>

      <View style={{ height: theme.spacing.md }} />

      {preset === 'Zombie' ? (
        <Card title="Zombie filter" subtitle="Funds with at least one warning sign: tiny, expensive, declining, or negative-Sharpe.">
          <Text style={styles.desc}>
            Inverts the filter — shows ETFs where AUM &lt; $50M, OR TER &gt; 1%,
            OR YoY &lt; -20%, OR Sharpe &lt; 0.
          </Text>
        </Card>
      ) : (
        <Card title="Filters">
          <RangeSlider
            label="AUM ≥"
            min={0}
            max={5000}
            step={50}
            value={filters.aumMin}
            onChange={(v) => onFilter({ aumMin: v })}
            format={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`)}
          />
          <RangeSlider
            label="Expense Ratio ≤"
            min={0}
            max={2}
            step={0.05}
            value={filters.terMax}
            onChange={(v) => onFilter({ terMax: v })}
            format={(v) => `${v.toFixed(2)}%`}
          />
          <RangeSlider
            label="YoY ≥"
            min={-50}
            max={60}
            step={1}
            value={filters.yoyMin}
            onChange={(v) => onFilter({ yoyMin: v })}
            format={(v) => `${v}%`}
          />
          <RangeSlider
            label="Sharpe Ratio ≥"
            min={-1}
            max={3}
            step={0.1}
            value={filters.sharpeMin}
            onChange={(v) => onFilter({ sharpeMin: v })}
            format={(v) => v.toFixed(1)}
          />
          <RangeSlider
            label="P/B Ratio ≤"
            min={0}
            max={20}
            step={0.5}
            value={filters.pbMax}
            onChange={(v) => onFilter({ pbMax: v })}
            format={(v) => v.toFixed(1)}
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
            <Text style={{ color: theme.textSecondary }}> / {all.length} etfs match</Text>
          </Text>
          {filtered.length === 0 ? (
            <Text style={[styles.desc, { marginTop: theme.spacing.md }]}>
              No ETFs match current filters. Try loosening, or switch preset.
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
                keyExtractor={(e) => e.ticker}
                renderItem={({ item }) => <Row etf={item as any} isMobile={isMobile} />}
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
  const hcell = (k: SortKey, label: string, colStyle: any, align: 'left' | 'right' = 'left') => (
    <Pressable onPress={() => onSort(k)} style={colStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' } as any}>
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
      {!isMobile && <Text style={[styles.th, styles.colCategory]}>Category</Text>}
      {hcell('current_price', 'Price', styles.colNum, 'right')}
      {hcell('aum_usd', 'AUM', styles.colNum, 'right')}
      {hcell('expense_ratio', 'TER', styles.colNum, 'right')}
      {hcell('yoy_pct', 'YoY', styles.colNum, 'right')}
      {hcell('sharpe', 'Sharpe', styles.colNum, 'right')}
      {hcell('pb_ratio', 'P/B', styles.colNum, 'right')}
    </View>
  );
}

function Row({ etf, isMobile }: { etf: Etf & { _sharpe: number | null }; isMobile: boolean }) {
  const sh = etf._sharpe;
  const ter = etf.expense_ratio;
  const terDisp =
    ter == null
      ? '—'
      : ter < 0.1
      ? `${ter.toFixed(3)}%`
      : `${ter.toFixed(2)}%`;
  const aumDisp =
    etf.aum_usd == null ? '—' : `$${formatBigNum(etf.aum_usd, 1)}`;
  return (
    <View style={styles.trow}>
      <Text style={[styles.td, styles.colTicker, { color: theme.yellow, fontWeight: '700' }]}>{etf.ticker}</Text>
      {!isMobile && (
        <Text style={[styles.td, styles.colName]} numberOfLines={1}>
          {etf.name}
        </Text>
      )}
      {!isMobile && (
        <Text style={[styles.td, styles.colCategory, { color: theme.textMuted }]} numberOfLines={1}>
          {etf.category ?? '—'}
        </Text>
      )}
      <Text style={[styles.td, styles.colNum]}>{formatUsd(etf.current_price, 2)}</Text>
      <Text style={[styles.td, styles.colNum]}>{aumDisp}</Text>
      <Text style={[styles.td, styles.colNum]}>{terDisp}</Text>
      <Text style={[styles.td, styles.colNum, { color: etf.yoy_pct >= 0 ? theme.green : theme.red }]}>
        {formatSignedPct(etf.yoy_pct, 1)}
      </Text>
      <Text style={[styles.td, styles.colNum, { color: sharpeColor(sh) }]}>
        {sh == null ? '—' : sh.toFixed(2)}
      </Text>
      <Text style={[styles.td, styles.colNum]}>{etf.pb_ratio == null ? '—' : etf.pb_ratio.toFixed(1)}</Text>
    </View>
  );
}

const sharpeColor = (s: number | null): string => {
  if (s == null) return theme.textMuted;
  if (s >= 1) return theme.green;
  if (s >= 0) return theme.amber;
  return theme.red;
};

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
  colCategory: { width: 140 },
  colNum: { width: 70, textAlign: 'right' },
});
