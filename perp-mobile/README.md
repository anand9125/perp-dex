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

Wallet connection is wired to **Solana** via a small backend and the perp-dex program IDL. To use live chain data and place orders:

1. **Start the backend** (from repo root):
   ```bash
   cd backend && npm install && npm run build
   RPC_URL=https://api.devnet.solana.com npm start
   ```
2. **Point the app at the API** – On device/emulator, use your machine’s IP instead of localhost, e.g. create `.env` with:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.32:3001
   EXPO_PUBLIC_RPC_URL=https://api.devnet.solana.com
   ```
3. **Wallet** – The app uses a mock pubkey for “Connect wallet” until you integrate a real wallet (e.g. Phantom deep link or WalletConnect). Placing an order requires a wallet that can sign transactions; the context accepts a `signTransaction` callback when you plug in an adapter.

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
lib/
  solana/        # Program client, PDAs, wallet context, API client
  idl/           # perp_dex.json (from target/idl)
hooks/
  usePerpDex.ts  # useApiMarkets, useApiUser, usePlaceOrder
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
