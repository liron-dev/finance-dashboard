import React, { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { theme } from '@/lib/theme';

type Props = { children: ReactNode };

export function PageShell({ children }: Props) {
  const { width } = useWindowDimensions();
  const pad = width < theme.breakpoints.sm ? theme.spacing.md : theme.spacing.lg;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={[styles.inner, { paddingHorizontal: pad, paddingVertical: theme.spacing.lg }]}>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.bg },
  content: { alignItems: 'center' },
  inner: { width: '100%', maxWidth: 1280 },
});
