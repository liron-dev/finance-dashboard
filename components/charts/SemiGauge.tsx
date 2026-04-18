import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';
import { theme } from '@/lib/theme';

const AnimatedG = Animated.createAnimatedComponent(G);

type Props = {
  value: number; // 0-100
  label?: string;
  caption?: string;
  size?: number;
};

// 5 colored segments left→right: red, orange, yellow, green-dim, green
const SEGMENTS = [
  { from: 0, to: 20, color: '#EF4444' },
  { from: 20, to: 40, color: '#F59E0B' },
  { from: 40, to: 60, color: '#EAB308' },
  { from: 60, to: 80, color: '#65A30D' },
  { from: 80, to: 100, color: '#22C55E' },
];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function SemiGauge({ value, label, caption, size = 220 }: Props) {
  const width = size;
  const height = size * 0.62;
  const cx = size / 2;
  const cy = size * 0.55;
  const r = size / 2 - 14;
  const v = Math.max(0, Math.min(100, value));
  const needleDeg = (v / 100) * 180;

  // Zone color for center number
  const zone = SEGMENTS.find((s) => v >= s.from && v <= s.to) ?? SEGMENTS[0];
  const centerColor = zone.color;

  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rot, { toValue: needleDeg, duration: 700, useNativeDriver: false }).start();
  }, [needleDeg, rot]);

  return (
    <View style={{ width, alignItems: 'center' }}>
      <Svg width={width} height={height}>
        {SEGMENTS.map((seg, i) => (
          <Path
            key={i}
            d={arcPath(cx, cy, r, (seg.from / 100) * 180, (seg.to / 100) * 180)}
            stroke={seg.color}
            strokeWidth={12}
            fill="none"
            strokeLinecap={i === 0 || i === SEGMENTS.length - 1 ? 'round' : 'butt'}
          />
        ))}
        <AnimatedG
          transform={rot.interpolate({
            inputRange: [0, 180],
            outputRange: [`rotate(-90, ${cx}, ${cy})`, `rotate(90, ${cx}, ${cy})`],
          }) as any}
        >
          <Line x1={cx} y1={cy} x2={cx} y2={cy - r + 6} stroke={theme.textPrimary} strokeWidth={3} strokeLinecap="round" />
        </AnimatedG>
      </Svg>
      <Text style={[styles.value, { color: centerColor, marginTop: -size * 0.2 }]}>{v.toFixed(1)}</Text>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  value: { ...theme.type.gaugeCenter },
  label: { ...theme.type.label, color: theme.textSecondary, marginTop: 4, textAlign: 'center' },
  caption: { ...theme.type.micro, color: theme.textMuted, marginTop: 2, textAlign: 'center' },
});
