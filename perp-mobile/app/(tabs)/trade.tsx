import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { getMarketBySymbol, mockOrderBook } from '@/constants/mockData';
import { OrderForm, type Side } from '@/components/OrderForm';
import { OrderBookDepth } from '@/components/OrderBookDepth';
import { StickyBuySell } from '@/components/StickyBuySell';
import { useWallet } from '@/lib/solana/WalletContext';
import { useApiUser, usePlaceOrder } from '@/hooks/usePerpDex';
import { colors, spacing, typography } from '@/constants/Theme';

type BottomTab = 'orders' | 'holdings';

export default function TradeScreen() {
  const { symbol, side } = useLocalSearchParams<{ symbol?: string; side?: string }>();
  const marketSymbol = symbol || 'SOL-PERP';
  const initialSide: Side = side === 'short' ? 'short' : 'long';
  const market = useMemo(() => getMarketBySymbol(marketSymbol), [marketSymbol]);
  const orderBook = useMemo(
    () => mockOrderBook(market.symbol, parseFloat(market.price)),
    [market.symbol, market.price]
  );
  const [bottomTab, setBottomTab] = useState<BottomTab>('orders');
  const { width } = useWindowDimensions();
  const narrow = width < 400;

  const { publicKey } = useWallet();
  const { collateral, positions } = useApiUser(publicKey);
  const { placeOrder, loading: orderLoading, error: orderError } = usePlaceOrder();

  const isPositive = market.change24h >= 0;
  const balanceUsdc = collateral?.collateralAmount
    ? (Number(collateral.collateralAmount) / 1e6).toFixed(2)
    : '0.00';

  const handlePlaceOrder = async (s: Side, size: string, limitPrice: string) => {
    if (!publicKey) {
      Alert.alert('Connect wallet', 'Connect a wallet to place orders.');
      return;
    }
    try {
      const sig = await placeOrder({
        user: publicKey,
        marketSymbol,
        side: s === 'long' ? 'buy' : 'sell',
        qty: parseFloat(size) || 0,
        limitPrice: Math.round(parseFloat(limitPrice) || 0),
      });
      Alert.alert('Order placed', `Signature: ${sig.slice(0, 16)}…`);
    } catch (e: any) {
      Alert.alert('Order failed', e?.message ?? 'Unknown error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.pair}>{market.base}/{market.quote}</Text>
          <Text style={[styles.change, isPositive ? styles.changeLong : styles.changeShort]}>
            {isPositive ? '+' : ''}{market.change24h.toFixed(2)}%
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainRow, narrow && styles.mainCol]}>
          <View style={styles.formCol}>
            <OrderForm
              marketSymbol={market.symbol}
              baseAsset={market.base}
              quoteAsset={market.quote}
              markPrice={market.price}
              initialSide={initialSide}
              onPlaceOrder={handlePlaceOrder}
            />
          </View>
          <View style={styles.bookCol}>
            <OrderBookDepth
              orderBook={orderBook}
              quoteAsset={market.quote}
              baseAsset={market.base}
              maxRows={5}
            />
          </View>
        </View>

        <View style={styles.bottomTabs}>
          <Text
            onPress={() => setBottomTab('orders')}
            style={[styles.bottomTab, bottomTab === 'orders' && styles.bottomTabActive]}
          >
            Open Orders (0)
          </Text>
          <Text
            onPress={() => setBottomTab('holdings')}
            style={[styles.bottomTab, bottomTab === 'holdings' && styles.bottomTabActive]}
          >
            Holdings (0)
          </Text>
        </View>

        {bottomTab === 'orders' && (
          <View style={styles.emptySection}>
            <Text style={styles.emptyTitle}>No open orders</Text>
            <Text style={styles.emptyText}>Your limit and market orders will appear here.</Text>
          </View>
        )}
        {bottomTab === 'holdings' && (
          <View style={styles.emptySection}>
            <Text style={styles.emptyTitle}>No holdings</Text>
            <Text style={styles.emptyText}>Positions will show here once you have open positions.</Text>
          </View>
        )}

        <View style={styles.fundsNotice}>
          <Text style={styles.fundsText}>Available Funds: {balanceUsdc} {market.quote}</Text>
          <Text style={styles.fundsHint}>
            {!publicKey ? 'Connect wallet to trade' : 'Transfer funds to your Spot wallet to trade'}
          </Text>
        </View>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pair: {
    ...typography.title2,
    color: colors.text,
  },
  change: {
    ...typography.callout,
    fontWeight: '600',
  },
  changeLong: { color: colors.long },
  changeShort: { color: colors.short },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  mainRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  mainCol: {
    flexDirection: 'column',
  },
  formCol: {
    flex: 1,
    minWidth: 160,
  },
  bookCol: {
    flex: 1,
    minWidth: 160,
  },
  bottomTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  bottomTab: {
    ...typography.callout,
    color: colors.textSecondary,
    marginRight: spacing.xl,
    paddingVertical: spacing.sm,
  },
  bottomTabActive: {
    color: colors.accent,
    fontWeight: '600',
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  emptySection: {
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  fundsNotice: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  fundsText: {
    ...typography.caption,
    color: colors.text,
  },
  fundsHint: {
    ...typography.caption2,
    color: colors.textMuted,
    marginTop: 4,
  },
});
