/**
 * Wallet context: holds the current wallet public key and optional signer.
 * Set via connect/disconnect. For production, plug in Phantom/WalletConnect.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';

export type SignTransaction = (tx: Transaction) => Promise<Transaction>;

type WalletContextValue = {
  publicKey: PublicKey | null;
  connected: boolean;
  connect: (pubkey: PublicKey, signTransaction?: SignTransaction) => void;
  disconnect: () => void;
  signTransaction: SignTransaction | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [signTransaction, setSignTransaction] = useState<SignTransaction | null>(null);

  const connect = useCallback((pubkey: PublicKey, signTx?: SignTransaction) => {
    setPublicKey(pubkey);
    setSignTransaction(signTx ?? null);
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setSignTransaction(null);
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected: publicKey !== null,
        connect,
        disconnect,
        signTransaction,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return ctx;
}
