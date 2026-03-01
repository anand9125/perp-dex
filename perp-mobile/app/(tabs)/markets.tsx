import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SearchBar } from '@/components/SearchBar';
import { MarketListRow } from '@/components/MarketListRow';
import { MOCK_MARKETS } from '@/constants/mockData';
import { useIndexerMarkets } from '@/lib/solana/IndexerContext';
import type { MarketItem } from '@/types/market';
import { colors, spacing, typography } from '@/constants/Theme';

const QUOTE_OPTIONS = ['USDT', 'USDC', 'USD', 'BTC'];

function apiMarketToItem(m: { symbol: string; lastOraclePrice: number }): MarketItem {
  const base = m.symbol.replace(/-PERP$/, '');
  const price = String(m.lastOraclePrice);
  return {
    symbol: m.symbol,
    name: `${base} Perpetual`,
    base,
    quote: 'USDT',
    price,
    priceUsd: `$${price}`,
    change24h: 0,
    volume24h: '—',
    leverage: '10x',
    high24h: price,
    low24h: price,
  };
}

export default function MarketsScreen() {
  const router = useRouter();
  const indexerMarkets = useIndexerMarkets();
  const chainMarkets = useMemo(() => indexerMarkets.map(apiMarketToItem), [indexerMarkets]);
  const listSource = chainMarkets.length > 0 ? chainMarkets : MOCK_MARKETS;
  const [search, setSearch] = useState('');
  const [quote, setQuote] = useState('USDT');

  const filteredMarkets = useMemo(() => {
    let list = listSource;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.symbol.toLowerCase().includes(q) || m.base.toLowerCase().includes(q));
    }
    if (quote !== 'USDT') {
      list = list.filter((m) => m.quote === quote);
    }
    return list;
  }, [search, quote, listSource]);

  const handleMarketPress = (symbol: string) => {
    router.push(`/market/${encodeURIComponent(symbol)}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Markets</Text>
        <Text style={styles.subtitle}>Select a market to trade</Text>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search pairs" />
      </View>

      <View style={styles.quoteTabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quoteTabsContent}>
          {QUOTE_OPTIONS.map((q) => (
            <Text
              key={q}
              onPress={() => setQuote(q)}
              style={[styles.quoteTab, quote === q && styles.quoteTabActive]}
            >
              {q}
            </Text>
          ))}
        </ScrollView>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderLeft}>Name / Vol</Text>
        <Text style={styles.listHeaderMid}>Last Price</Text>
        <Text style={styles.listHeaderRight}>24h Chg%</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {filteredMarkets.map((market) => (
          <MarketListRow
            key={market.symbol}
            market={market}
            onPress={() => handleMarketPress(market.symbol)}
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
    paddingBottom: spacing.sm,
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
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  quoteTabsWrap: {
    marginBottom: spacing.sm,
  },
  quoteTabsContent: {
    paddingLeft: spacing.xl,
    paddingRight: spacing.xl,
  },
  quoteTab: {
    ...typography.caption,
    color: colors.textMuted,
    marginRight: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  quoteTabActive: {
    color: colors.accent,
    backgroundColor: colors.accentMuted,
    fontWeight: '600',
  },
  listHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listHeaderLeft: {
    flex: 1,
    ...typography.caption2,
    color: colors.textMuted,
  },
  listHeaderMid: {
    ...typography.caption2,
    color: colors.textMuted,
    marginRight: spacing.md,
    width: 80,
    textAlign: 'right',
  },
  listHeaderRight: {
    ...typography.caption2,
    color: colors.textMuted,
    width: 64,
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
});
