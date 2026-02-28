import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { OrderForm } from '@/components/OrderForm';
import { colors, spacing, typography } from '@/constants/Theme';

export default function TradeScreen() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>();
  const marketSymbol = symbol || 'SOL-PERP';
  const markPrice = '245.32';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{marketSymbol}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.markPrice}>${markPrice}</Text>
          <Text style={styles.changePositive}>+2.45%</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Order book placeholder */}
        <View style={styles.orderBook}>
          <Text style={styles.orderBookTitle}>Order book</Text>
          <View style={styles.orderBookRow}>
            <Text style={styles.askPrice}>245.20</Text>
            <Text style={styles.askSize}>12.5</Text>
          </View>
          <View style={styles.orderBookRow}>
            <Text style={styles.askPrice}>245.10</Text>
            <Text style={styles.askSize}>8.2</Text>
          </View>
          <View style={[styles.orderBookRow, styles.midRow]}>
            <Text style={styles.midPrice}>245.00 — Spread 0.02</Text>
          </View>
          <View style={styles.orderBookRow}>
            <Text style={styles.bidPrice}>244.90</Text>
            <Text style={styles.bidSize}>15.1</Text>
          </View>
          <View style={styles.orderBookRow}>
            <Text style={styles.bidPrice}>244.80</Text>
            <Text style={styles.bidSize}>22.3</Text>
          </View>
        </View>

        <OrderForm
          marketSymbol={marketSymbol}
          markPrice={markPrice}
          onPlaceOrder={(side, size, limitPrice) => {
            console.log('Place order', side, size, limitPrice);
          }}
        />
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.title2,
    color: colors.text,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: 4,
  },
  markPrice: {
    ...typography.headline,
    color: colors.text,
  },
  changePositive: {
    ...typography.caption,
    color: colors.long,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  orderBook: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  orderBookTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  orderBookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  midRow: {
    justifyContent: 'center',
    marginVertical: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  askPrice: {
    ...typography.callout,
    color: colors.short,
  },
  askSize: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  bidPrice: {
    ...typography.callout,
    color: colors.long,
  },
  bidSize: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  midPrice: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
