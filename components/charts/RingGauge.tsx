import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme, zoneColor } from '@/lib/theme';
import type { Zone } from '@/lib/types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  value: number;
  label: string;
  unit?: string;
  caption?: string;
  zone?: Zone;
  max?: number; // used to fill the arc proportionally (default 100)
  size?: number;
  displayValue?: string;
};

export function RingGauge({
  value,
  label,
  unit,
  caption,
  zone = 'neutral',
  max = 100,
  size = 140,
  displayValue,
}: Props) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const color = zoneColor(zone);
  const pct = Math.max(0, Math.min(1, Math.abs(value) / max));
  const dash = useRef(new Animated.Value(circumference)).current;

  useEffect(() => {
    Animated.timing(dash, {
      toValue: circumference * (1 - pct),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [pct, circumference, dash]);

  return (
    <View style={[styles.wrap, { width: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={theme.border} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dash as any}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <View style={[styles.center, { width: size, height: size }]}>
        <Text style={[styles.value, { color }]}>
          {displayValue ?? `${value.toFixed(value < 10 ? 2 : 1)}`}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { ...theme.type.statBig },
  unit: { ...theme.type.label, color: theme.textMuted, marginTop: -4 },
  label: { ...theme.type.label, color: theme.textSecondary, marginTop: 6, textAlign: 'center' },
  caption: { ...theme.type.micro, color: theme.textMuted, marginTop: 2, textAlign: 'center' },
});
