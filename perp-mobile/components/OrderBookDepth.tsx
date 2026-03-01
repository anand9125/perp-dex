import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { OrderBook } from '@/types/market';
import { colors, spacing, typography } from '@/constants/Theme';

type OrderBookDepthProps = {
  orderBook: OrderBook;
  quoteAsset?: string;
  baseAsset?: string;
  maxRows?: number;
};

export function OrderBookDepth({
  orderBook,
  quoteAsset = 'USDT',
  baseAsset = '',
  maxRows = 10,
}: OrderBookDepthProps) {
  const { bids, asks, midPrice, bidPct, askPct } = orderBook;
  const displayBids = bids.slice(0, maxRows);
  const displayAsks = asks.slice(0, maxRows);
  const maxBidSize = Math.max(...displayBids.map((r) => parseFloat(r.size)), 1);
  const maxAskSize = Math.max(...displayAsks.map((r) => parseFloat(r.size)), 1);

  return (
    <View style={styles.container}>
      {/* Bid/Ask distribution bar */}
      {(bidPct != null || askPct != null) && (
        <View style={styles.distBar}>
          <View style={[styles.distSegment, styles.bidDist, { flex: bidPct ?? 50 }]} />
          <View style={[styles.distSegment, styles.askDist, { flex: askPct ?? 50 }]} />
        </View>
      )}
      <View style={styles.distLabels}>
        <Text style={styles.bidPctText}>Bid {bidPct != null ? `${bidPct}%` : ''}</Text>
        <Text style={styles.askPctText}>Ask {askPct != null ? `${askPct}%` : ''}</Text>
      </View>

      {/* Table header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Bid ({baseAsset})</Text>
        <Text style={styles.headerText}>Price ({quoteAsset})</Text>
        <Text style={styles.headerText}>Ask ({baseAsset})</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Asks (reversed so best ask on top) */}
        {[...displayAsks].reverse().map((row, i) => (
          <View key={`a-${i}`} style={styles.row}>
            <View style={styles.sizeCell} />
            <Text style={styles.askPrice}>{row.price}</Text>
            <View style={styles.askSizeWrap}>
              <View style={[styles.askDepthBar, { width: `${(parseFloat(row.size) / maxAskSize) * 100}%` }]} />
              <Text style={styles.sizeText}>{row.size}</Text>
            </View>
          </View>
        ))}
        {midPrice && (
          <View style={styles.midRow}>
            <Text style={styles.midText}>— {midPrice} —</Text>
          </View>
        )}
        {displayBids.map((row, i) => (
          <View key={`b-${i}`} style={styles.row}>
            <View style={styles.bidSizeWrap}>
              <View style={[styles.bidDepthBar, { width: `${(parseFloat(row.size) / maxBidSize) * 100}%` }]} />
              <Text style={styles.sizeText}>{row.size}</Text>
            </View>
            <Text style={styles.bidPrice}>{row.price}</Text>
            <View style={styles.sizeCell} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  distBar: {
    flexDirection: 'row',
    height: 4,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  distSegment: {
    minWidth: 4,
  },
  bidDist: {
    backgroundColor: colors.long,
  },
  askDist: {
    backgroundColor: colors.short,
  },
  distLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  bidPctText: {
    ...typography.caption2,
    color: colors.long,
  },
  askPctText: {
    ...typography.caption2,
    color: colors.short,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    ...typography.caption2,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
  },
  sizeCell: {
    width: 70,
  },
  bidSizeWrap: {
    width: 70,
    position: 'relative',
  },
  bidDepthBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.longMuted,
    borderRadius: 4,
    maxWidth: '100%',
  },
  bidPrice: {
    ...typography.callout,
    color: colors.long,
    width: 80,
    textAlign: 'center',
  },
  askPrice: {
    ...typography.callout,
    color: colors.short,
    width: 80,
    textAlign: 'center',
  },
  askSizeWrap: {
    width: 70,
    alignItems: 'flex-end',
    position: 'relative',
  },
  askDepthBar: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.shortMuted,
    borderRadius: 4,
    maxWidth: '100%',
  },
  sizeText: {
    ...typography.caption,
    color: colors.textSecondary,
    zIndex: 1,
  },
  midRow: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  midText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
