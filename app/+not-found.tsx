import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { theme } from '@/lib/theme';

export default function NotFound() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.msg}>That page doesn't exist.</Text>
      <Link href="/" style={styles.link}>
        <Text style={styles.linkText}>← Back to home</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, backgroundColor: theme.bg },
  title: { ...theme.type.gaugeCenter, color: theme.yellow },
  msg: { ...theme.type.body, color: theme.textSecondary, marginTop: theme.spacing.sm },
  link: { marginTop: theme.spacing.lg, textDecorationLine: 'none' } as any,
  linkText: { ...theme.type.h3, color: theme.yellow },
});
