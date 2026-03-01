import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getMarketBySymbol, mockOrderBook } from '@/constants/mockData';
import { ChartPlaceholder } from '@/components/ChartPlaceholder';
import { OrderBookDepth } from '@/components/OrderBookDepth';
import { StickyBuySell } from '@/components/StickyBuySell';
import { useIndexer } from '@/lib/solana/IndexerContext';
import { colors, spacing, typography } from '@/constants/Theme';

type Tab = 'price' | 'orderbook';

export default function MarketDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const { state } = useIndexer();
  const market = useMemo(() => getMarketBySymbol(symbol || 'SOL-PERP'), [symbol]);
  const liveOrderBook = state?.orderBooks?.[symbol || 'SOL-PERP'];
  const orderBook = useMemo(() => {
    if (liveOrderBook && (liveOrderBook.bids.length > 0 || liveOrderBook.asks.length > 0)) {
      return liveOrderBook as { bids: { price: string; size: string }[]; asks: { price: string; size: string }[]; midPrice?: string; bidPct?: number; askPct?: number };
    }
    return mockOrderBook(market.symbol, parseFloat(market.price));
  }, [liveOrderBook, market.symbol, market.price]);
  const [activeTab, setActiveTab] = React.useState<Tab>('price');

  if (!market) return null;

  const isPositive = market.change24h >= 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={colors.text} size={24} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.pair}>{market.base}/{market.quote}</Text>
          <View style={styles.headerPriceRow}>
            <Text style={styles.price}>{market.price}</Text>
            <Text style={[styles.change, isPositive ? styles.changeLong : styles.changeShort]}>
              {isPositive ? '+' : ''}{market.change24h.toFixed(2)}%
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconBtn}>
            <SymbolView name={{ ios: 'star', android: 'star_border', web: 'star_border' }} tintColor={colors.textSecondary} size={22} />
          </Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setActiveTab('price')}
          style={[styles.tab, activeTab === 'price' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'price' && styles.tabTextActive]}>Price</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('orderbook')}
          style={[styles.tab, activeTab === 'orderbook' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'orderbook' && styles.tabTextActive]}>Order Book</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'price' && (
          <>
            {/* 24h stats */}
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>24h High</Text>
                <Text style={styles.statValue}>{market.high24h}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>24h Vol</Text>
                <Text style={styles.statValue}>{market.volBase24h ?? market.volume24h}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>24h Low</Text>
                <Text style={styles.statValue}>{market.low24h}</Text>
              </View>
            </View>
            <ChartPlaceholder symbol={market.symbol} height={240} />
          </>
        )}
        {activeTab === 'orderbook' && (
          <OrderBookDepth orderBook={orderBook} quoteAsset={market.quote} baseAsset={market.base} />
        )}
      </ScrollView>

      <StickyBuySell symbol={market.symbol} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.sm,
    marginRight: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  pair: {
    ...typography.headline,
    color: colors.text,
  },
  headerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  price: {
    ...typography.callout,
    color: colors.text,
  },
  change: {
    ...typography.caption,
    fontWeight: '600',
  },
  changeLong: { color: colors.long },
  changeShort: { color: colors.short },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    padding: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...typography.caption2,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.caption,
    color: colors.text,
    marginTop: 4,
  },
});
