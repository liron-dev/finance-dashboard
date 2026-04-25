import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '@/lib/theme';

type Props = {
  size?: number;
  color?: string;
  thickness?: number;
};

export function Spinner({ size = 24, color = theme.yellow, thickness = 2 }: Props) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);

  const spin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  return (
    <View accessibilityRole="progressbar" style={{ width: size, height: size }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ rotate: spin }],
        }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={theme.border}
            strokeWidth={thickness}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * 0.25} ${c * 0.75}`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
