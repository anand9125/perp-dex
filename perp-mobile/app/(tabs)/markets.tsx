import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MarketCard, type MarketItem } from '@/components/MarketCard';
import { colors, spacing, typography } from '@/constants/Theme';

const MOCK_MARKETS: MarketItem[] = [
  {
    symbol: 'SOL-PERP',
    name: 'Solana Perpetual',
    price: '245.32',
    change24h: 2.45,
    volume24h: '12.5M',
  },
  {
    symbol: 'BTC-PERP',
    name: 'Bitcoin Perpetual',
    price: '67,234.10',
    change24h: -0.82,
    volume24h: '89.2M',
  },
  {
    symbol: 'ETH-PERP',
    name: 'Ethereum Perpetual',
    price: '3,421.55',
    change24h: 1.12,
    volume24h: '45.1M',
  },
];

export default function MarketsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
        <Text style={styles.subtitle}>Select a market to trade</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {MOCK_MARKETS.map((market) => (
          <MarketCard
            key={market.symbol}
            market={market}
            onPress={() => router.push(`/trade?symbol=${encodeURIComponent(market.symbol)}`)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
