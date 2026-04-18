import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Line, G } from 'react-native-svg';
import { theme } from '@/lib/theme';

export type Series = { label: string; color: string; data: { date: string; value: number }[] };

type Props = {
  series: Series[];
  height?: number;
  width?: number;
  yFormat?: (v: number) => string;
  baseline?: number; // horizontal baseline (e.g. 100 for YTD indexed)
};

const PAD = { left: 44, right: 12, top: 12, bottom: 28 };

export function LineChart({ series, height = 260, width = 640, yFormat, baseline }: Props) {
  const nonEmpty = series.filter((s) => s.data.length >= 2);
  if (!nonEmpty.length) return <View style={{ height }} />;

  const allVals = nonEmpty.flatMap((s) => s.data.map((p) => p.value));
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const padY = (maxV - minV) * 0.08 || 1;
  const lo = minV - padY;
  const hi = maxV + padY;
  const range = hi - lo || 1;

  // Use the longest series as the x axis
  const baseSeries = nonEmpty.reduce((a, b) => (a.data.length >= b.data.length ? a : b));
  const n = baseSeries.data.length;

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const xAt = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * innerW;
  const yAt = (v: number) => PAD.top + (1 - (v - lo) / range) * innerH;

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => lo + (range * i) / yTickCount);

  const xTickIdxs = [0, Math.floor(n / 2), n - 1];

  return (
    <View>
      <Svg width={width} height={height}>
        {yTicks.map((t, i) => (
          <Line
            key={i}
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yAt(t)}
            y2={yAt(t)}
            stroke={theme.border}
            strokeWidth={0.5}
          />
        ))}
        {baseline !== undefined && baseline >= lo && baseline <= hi ? (
          <Line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yAt(baseline)}
            y2={yAt(baseline)}
            stroke={theme.textMuted}
            strokeWidth={0.8}
            strokeDasharray="3,3"
          />
        ) : null}
        {nonEmpty.map((s) => {
          const m = s.data.length;
          const path = s.data
            .map((p, i) => {
              const x = PAD.left + (i / Math.max(m - 1, 1)) * innerW;
              const y = yAt(p.value);
              return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(' ');
          return <Path key={s.label} d={path} fill="none" stroke={s.color} strokeWidth={1.8} />;
        })}
      </Svg>
      <View style={[styles.yLabels, { top: PAD.top, height: innerH }]}>
        {yTicks
          .slice()
          .reverse()
          .map((t, i) => (
            <Text key={i} style={styles.tickText}>
              {yFormat ? yFormat(t) : t.toFixed(0)}
            </Text>
          ))}
      </View>
      <View style={[styles.xLabels, { left: PAD.left, width: innerW }]}>
        {xTickIdxs.map((i) => (
          <Text key={i} style={styles.tickText}>
            {baseSeries.data[i].date.slice(0, 7)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabels: {
    position: 'absolute',
    left: 0,
    width: 40,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  xLabels: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tickText: { ...theme.type.micro, color: theme.textMuted },
});
