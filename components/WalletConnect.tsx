'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

export default function WalletConnect() {
  return (
    <div className="p-4 bg-white shadow-md rounded-lg">
      <ConnectButton />
    </div>
  );
}
