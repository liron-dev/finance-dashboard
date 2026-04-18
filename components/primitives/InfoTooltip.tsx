import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/lib/theme';

type Props = { text: string; size?: number };

export function InfoTooltip({ text, size = 12 }: Props) {
  const [hover, setHover] = useState(false);
  const [tapped, setTapped] = useState(false);
  const show = hover || tapped;
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setTapped((t) => !t)}
        {...(Platform.OS === 'web'
          ? ({ onHoverIn: () => setHover(true), onHoverOut: () => setHover(false) } as any)
          : {})}
        accessibilityLabel={text}
        style={styles.hit}
      >
        <Feather name="info" size={size} color={theme.textMuted} />
      </Pressable>
      {show ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  hit: { padding: 2 },
  bubble: {
    position: 'absolute',
    top: 20,
    right: 0,
    maxWidth: 240,
    minWidth: 160,
    backgroundColor: theme.bgCardAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    padding: 8,
    zIndex: 10,
  },
  bubbleText: { ...theme.type.body, color: theme.textSecondary },
});
