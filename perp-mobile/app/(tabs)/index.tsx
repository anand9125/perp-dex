import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PublicKey } from '@solana/web3.js';
import { WalletButton } from '@/components/WalletButton';
import { SearchBar } from '@/components/SearchBar';
import { MarketListRow } from '@/components/MarketListRow';
import { MOCK_MARKETS } from '@/constants/mockData';
import type { MarketItem } from '@/types/market';
import { useWallet } from '@/lib/solana/WalletContext';
import { useIndexerMarkets, useIndexerUser } from '@/lib/solana/IndexerContext';
import { colors, spacing, typography } from '@/constants/Theme';

const QUOTE_OPTIONS = ['USDT', 'USDC', 'USD', 'BTC'];
const PRIMARY_TABS = ['Favorites', 'Market'];

const MOCK_PUBKEY = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

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

export default function HomeScreen() {
  const router = useRouter();
  const { publicKey, connected, connect, disconnect } = useWallet();
  const apiMarkets = useIndexerMarkets();
  const { collateral } = useIndexerUser(publicKey);

  const [search, setSearch] = useState('');
  const [quote, setQuote] = useState('USDT');
  const [primaryTab, setPrimaryTab] = useState('Market');

  const chainMarkets: MarketItem[] = useMemo(
    () => apiMarkets.map(apiMarketToItem),
    [apiMarkets]
  );
  const listSource = chainMarkets.length > 0 ? chainMarkets : MOCK_MARKETS;
  const marketsLoading = false;

  const filteredMarkets = useMemo(() => {
    let list = listSource.filter((m) => m.quote === quote || quote === 'USDT');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.symbol.toLowerCase().includes(q) || m.base.toLowerCase().includes(q));
    }
    return list;
  }, [search, quote, listSource]);

  const handleConnect = () => {
    if (connected) disconnect();
    else connect(new PublicKey(MOCK_PUBKEY));
  };

  const balanceUsdc = collateral?.collateralAmount
    ? (Number(collateral.collateralAmount) / 1e6).toFixed(2)
    : '0.00';

  const handleMarketPress = (symbol: string) => {
    router.push(`/market/${encodeURIComponent(symbol)}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Perpetual Futures</Text>
          <Text style={styles.subtitle}>Trade with up to 10x leverage</Text>
        </View>

        <WalletButton
          onPress={handleConnect}
          connected={connected}
          address={publicKey?.toBase58() ?? undefined}
          balance={balanceUsdc}
        />

        {connected && (
          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Portfolio value</Text>
              <Text style={styles.statValue}>${balanceUsdc}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Available margin</Text>
              <Text style={styles.statValue}>${balanceUsdc}</Text>
            </View>
          </View>
        )}

        {marketsLoading && chainMarkets.length === 0 && (
          <Text style={styles.chainHint}>Loading markets from chain…</Text>
        )}

        <View style={styles.searchWrap}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search pairs" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.primaryTabs}>
          {PRIMARY_TABS.map((tab) => (
            <Text
              key={tab}
              onPress={() => setPrimaryTab(tab)}
              style={[styles.primaryTab, primaryTab === tab && styles.primaryTabActive]}
            >
              {tab}
            </Text>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quoteTabs}>
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

        {primaryTab === 'Favorites' ? (
          <View style={styles.favoritesEmpty}>
            <Text style={styles.favoritesEmptyTitle}>No favorites yet</Text>
            <Text style={styles.favoritesEmptyText}>Tap the star on a market to add it here.</Text>
          </View>
        ) : (
          <>
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderLeft}>Name / Vol</Text>
          <Text style={styles.listHeaderMid}>Last Price</Text>
          <Text style={styles.listHeaderRight}>24h Chg%</Text>
        </View>

        {filteredMarkets.map((market) => (
          <MarketListRow
            key={market.symbol}
            market={market}
            onPress={() => handleMarketPress(market.symbol)}
          />
        ))}
          </>
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  greeting: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    ...typography.title2,
    color: colors.text,
  },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  primaryTabs: {
    marginBottom: spacing.sm,
    paddingLeft: spacing.xl,
  },
  primaryTab: {
    ...typography.callout,
    color: colors.textSecondary,
    marginRight: spacing.xl,
    paddingVertical: spacing.sm,
  },
  primaryTabActive: {
    color: colors.accent,
    fontWeight: '600',
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  quoteTabs: {
    marginBottom: spacing.md,
    paddingLeft: spacing.xl,
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
  chainHint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  favoritesEmpty: {
    padding: spacing.xxl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  favoritesEmptyTitle: {
    ...typography.headline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  favoritesEmptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
