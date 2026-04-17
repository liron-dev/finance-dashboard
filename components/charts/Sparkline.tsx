import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';

type Props = {
  data: number[];
  color: string;
  height?: number;
  width?: number;
  strokeWidth?: number;
};

export function Sparkline({ data, color, height = 40, width = 120, strokeWidth = 2 }: Props) {
  if (!data.length) return <View style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / Math.max(data.length - 1, 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
