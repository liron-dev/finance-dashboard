import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import { GOAT_URL } from '@/lib/constants';

export function Footer() {
  const openGoat = () => Linking.openURL(GOAT_URL);
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        Built with Expo + Supabase · Inspired by{' '}
        <Text onPress={openGoat} style={styles.link} accessibilityRole="link">
          Goat Academy
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: theme.spacing.xl,
  },
  text: { ...theme.type.body, color: theme.textMuted, textAlign: 'center' },
  link: { color: theme.yellow, ...(Platform.OS === 'web' ? ({ textDecorationLine: 'underline' } as any) : {}) },
});
