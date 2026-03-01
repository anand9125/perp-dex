import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PositionCard, type PositionItem } from '@/components/PositionCard';
import { useWallet } from '@/lib/solana/WalletContext';
import { useIndexerUser, useIndexerMarkets } from '@/lib/solana/IndexerContext';
import { colors, spacing, typography } from '@/constants/Theme';

export default function PositionsScreen() {
  const { publicKey } = useWallet();
  const { positions } = useIndexerUser(publicKey);
  const indexerMarkets = useIndexerMarkets();

  const marketSymbolByPk = useMemo(() => {
    const m: Record<string, string> = {};
    indexerMarkets.forEach((market) => {
      m[market.publicKey] = market.symbol;
    });
    return m;
  }, [indexerMarkets]);

  const positionItems: PositionItem[] = useMemo(
    () =>
      positions
        .filter((p) => p.basePosition !== 0)
        .map((p) => {
          const symbol = marketSymbolByPk[p.market] ?? 'PERP';
          const markPrice = indexerMarkets.find((m) => m.publicKey === p.market)?.lastOraclePrice ?? p.entryPrice;
          const entryPrice = p.entryPrice;
          const size = Math.abs(p.basePosition);
          const isLong = p.basePosition > 0;
          const pnl = isLong
            ? (markPrice - entryPrice) * size
            : (entryPrice - markPrice) * size;
          const pnlPercent = entryPrice > 0 ? (pnl / (entryPrice * size)) * 100 : 0;
          return {
            symbol: symbol,
            side: isLong ? 'long' : 'short',
            size: size.toFixed(2),
            entryPrice: entryPrice.toFixed(2),
            markPrice: String(markPrice),
            pnl,
            pnlPercent,
          };
        }),
    [positions, marketSymbolByPk, indexerMarkets]
  );

  const hasPositions = positionItems.length > 0;
  const totalPnl = positionItems.reduce((s, p) => s + p.pnl, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Positions</Text>
        {hasPositions && (
          <View style={styles.totalPnl}>
            <Text style={styles.totalPnlLabel}>Total PnL</Text>
            <Text
              style={[
                styles.totalPnlValue,
                totalPnl >= 0 ? styles.pnlLong : styles.pnlShort,
              ]}
            >
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDC
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {hasPositions ? (
          positionItems.map((pos, i) => (
            <PositionCard key={`${pos.symbol}-${pos.side}-${i}`} position={pos} />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No open positions</Text>
            <Text style={styles.emptyText}>
              Open a position from the Trade tab. Your positions will appear here.
            </Text>
          </View>
        )}
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
    ...typography.title,
    color: colors.text,
  },
  totalPnl: {
    marginTop: spacing.sm,
  },
  totalPnlLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalPnlValue: {
    ...typography.title2,
    fontWeight: '700',
  },
  pnlLong: {
    color: colors.long,
  },
  pnlShort: {
    color: colors.short,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  empty: {
    padding: spacing.xxl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
