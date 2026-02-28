import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

type WalletButtonProps = {
  onPress: () => void;
  connected?: boolean;
  address?: string;
  balance?: string;
  style?: ViewStyle;
};

export function WalletButton({
  onPress,
  connected = false,
  address,
  balance = '0.00',
  style,
}: WalletButtonProps) {
  const shortAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        connected && styles.connected,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.iconWrap}>
        <SymbolView
          name={{ ios: 'wallet.pass', android: 'wallet', web: 'wallet' }}
          size={22}
          tintColor={connected ? colors.long : colors.textSecondary}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>
          {connected ? shortAddress : 'Connect wallet'}
        </Text>
        {connected && (
          <Text style={styles.balance}>{balance} USDC</Text>
        )}
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={18}
        tintColor={colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.md,
  },
  connected: {
    borderColor: 'rgba(0, 211, 149, 0.2)',
  },
  pressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  label: {
    ...typography.headline,
    color: colors.text,
  },
  balance: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pressedLabel: {},
});
