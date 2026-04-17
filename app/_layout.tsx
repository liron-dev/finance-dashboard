import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NavBar } from '@/components/layout/NavBar';
import { SpotTicker } from '@/components/layout/SpotTicker';
import { Footer } from '@/components/layout/Footer';
import { theme } from '@/lib/theme';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const id = '__fd_global_css';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      html, body, #root { background: ${theme.bg}; color: ${theme.textPrimary}; margin: 0; height: 100%; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif; }
      input[type=range] { accent-color: ${theme.cyan}; }
      a { color: inherit; text-decoration: none; }
      ::selection { background: ${theme.yellow}33; }
      *:focus-visible { outline: 2px solid ${theme.yellow}; outline-offset: 2px; }
    `;
    document.head.appendChild(s);
    if (!document.querySelector('title')) {
      const t = document.createElement('title');
      t.textContent = 'finance-dashboard — smart-money signals';
      document.head.appendChild(t);
    }
    const meta = (name: string, content: string, prop = 'name') => {
      const m = document.createElement('meta');
      m.setAttribute(prop, name);
      m.setAttribute('content', content);
      document.head.appendChild(m);
    };
    meta('description', 'Daily COMEX, COT positioning, FRED macro, and S&P 500 fundamentals. Inspired by Goat Academy.');
    meta('theme-color', theme.bg);
    meta('og:title', 'finance-dashboard', 'property');
    meta('og:description', 'Smart-money signals from public data. Daily updates.', 'property');
  }
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        <NavBar />
        <SpotTicker />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: 'fade',
          }}
        />
        <Footer />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, minHeight: '100%' as any },
});
