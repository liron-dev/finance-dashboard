import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line, G } from 'react-native-svg';
import { theme } from '@/lib/theme';

type Point = { date: string; value: number };

type Props = {
  data: Point[];
  color?: string;
  height?: number;
  width?: number;
  yFormat?: (v: number) => string;
  xFormat?: (iso: string) => string;
};

const PAD = { left: 44, right: 12, top: 12, bottom: 28 };

export function AreaChart({ data, color = theme.green, height = 220, width = 640, yFormat, xFormat }: Props) {
  if (data.length < 2) return <View style={{ height }} />;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padY = (max - min) * 0.08 || 1;
  const lo = min - padY;
  const hi = max + padY;
  const range = hi - lo || 1;

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const xAt = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const yAt = (v: number) => PAD.top + (1 - (v - lo) / range) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(d.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(data.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => lo + (range * i) / ticks);
  const xTicks = [0, Math.floor(data.length / 2), data.length - 1];

  const gradId = 'grad-' + color.replace('#', '');

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.5} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {yTicks.map((t, i) => (
          <G key={i}>
            <Line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke={theme.border}
              strokeWidth={0.5}
            />
          </G>
        ))}
        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path d={linePath} fill="none" stroke={color} strokeWidth={2} />
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
        {xTicks.map((i) => (
          <Text key={i} style={styles.tickText}>
            {xFormat ? xFormat(data[i].date) : data[i].date.slice(0, 7)}
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
