import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { theme } from '@/lib/theme';

type Row = { month: string; registered: number; eligible: number };

type Props = {
  data: Row[];
  colorRegistered?: string;
  colorEligible?: string;
  height?: number;
  width?: number;
  yFormat?: (v: number) => string;
};

const PAD = { left: 48, right: 12, top: 12, bottom: 28 };

export function StackedBarChart({
  data,
  colorRegistered = theme.yellow,
  colorEligible = theme.blue,
  height = 220,
  width = 640,
  yFormat,
}: Props) {
  if (!data.length) return <View style={{ height }} />;
  const maxV = Math.max(...data.map((r) => r.registered + r.eligible)) || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const barW = (innerW / data.length) * 0.7;
  const gap = (innerW / data.length) * 0.3;

  const yAt = (v: number) => PAD.top + (1 - v / maxV) * innerH;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (maxV * i) / ticks);

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
        {data.map((r, i) => {
          const x = PAD.left + i * (barW + gap) + gap / 2;
          const regH = (r.registered / maxV) * innerH;
          const eligH = (r.eligible / maxV) * innerH;
          const yReg = PAD.top + innerH - regH;
          const yElig = yReg - eligH;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={yReg} width={barW} height={regH} fill={colorRegistered} rx={2} />
              <Rect x={x} y={yElig} width={barW} height={eligH} fill={colorEligible} rx={2} />
            </React.Fragment>
          );
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
        {data.map((r, i) => {
          const show = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2);
          return (
            <Text key={i} style={[styles.tickText, { opacity: show ? 1 : 0 }]}>
              {r.month}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabels: {
    position: 'absolute',
    left: 0,
    width: 44,
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
