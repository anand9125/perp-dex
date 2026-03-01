/**
 * Polyfills for Solana/web3 in React Native. Import this first (e.g. in _layout.tsx).
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

if (typeof (global as any).Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}
