'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '@/utils/config';
import WalletConnect from '@/components/WalletConnect';
import SendForm from '@/components/SendForm';
import AiRecommendation from '@/components/AiRecommendation';
import Dashboard from '@/components/Dashboard';

const queryClient = new QueryClient();

export default function Home() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <main className="min-h-screen bg-gray-100 py-8">
            <div className="container mx-auto px-4">
              <h1 className="text-4xl font-bold text-center mb-8">
                Pesify 💸
                <span className="text-sm block text-gray-600">Stablecoin Payments for Latin America</span>
              </h1>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <WalletConnect />
                  <SendForm />
                </div>
                <div className="space-y-6">
                  <AiRecommendation />
                  <Dashboard />
                </div>
              </div>
            </div>
          </main>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
