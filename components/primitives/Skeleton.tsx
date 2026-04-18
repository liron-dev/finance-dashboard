import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '@/lib/theme';

type Props = {
  width?: number | string;
  height?: number;
  style?: ViewStyle;
  borderRadius?: number;
};

export function Skeleton({ width = '100%', height = 16, style, borderRadius = theme.radius.sm }: Props) {
  const op = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(op, { toValue: 0.4, duration: 800, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius, opacity: op },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton width={140} height={14} />
      <View style={{ height: 12 }} />
      <Skeleton height={80} />
      <View style={{ height: 8 }} />
      <Skeleton width="60%" height={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: theme.bgCardAlt },
  card: {
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
});
