# Perp DEX Mobile

Mobile UI for the Perp DEX perpetual futures protocol. Connect your wallet and trade SOL-PERP (and other markets) from your phone.

**Expo + React Native only.** No Java, no native build step—run with Expo Go on your phone or in the browser.

## Stack

- **Expo SDK 54** (React Native) with **Expo Router** (file-based tabs)
- **TypeScript**
- Dark trading theme (long/short colors, order book style)

## Screens

| Tab        | Description                                      |
| ---------- | ------------------------------------------------- |
| **Home**   | Connect wallet (UI only), portfolio summary      |
| **Markets**| List of perpetual markets; tap to open Trade     |
| **Trade**  | Order book + place order (Long/Short, size, limit)|
| **Positions** | Open positions with PnL                        |

Wallet connection is **UI-only** for now; you can hook up Solana wallet adapters (e.g. `@solana/wallet-adapter-react-native`) later.

## Run

```bash
cd perp-mobile
npm install
npx expo start
```

Then:

- **Web**: press `w` to open in the browser (no app required).
- **Phone (Expo Go)**: install [Expo Go](https://expo.dev/go) from the Play Store (Android) or App Store (iOS), then scan the QR code. This project uses **Expo SDK 54**, which matches the current Expo Go in the stores.

No Java, no Android Studio, no Xcode build—just Expo and React Native.

## Project layout

```
app/
  (tabs)/
    index.tsx    # Home + wallet connect
    markets.tsx  # Markets list
    trade.tsx    # Trade view + order form
    positions.tsx # Open positions
components/
  WalletButton.tsx
  MarketCard.tsx
  PositionCard.tsx
  OrderForm.tsx
constants/
  Theme.ts       # Colors, spacing, typography
  Colors.ts      # Re-export for nav theme
```

## Theming

- **Background**: `#0a0a0f`
- **Long**: `#00d395`
- **Short**: `#ff5c5c`
- **Accent**: `#00d4ff`

All defined in `constants/Theme.ts`.
