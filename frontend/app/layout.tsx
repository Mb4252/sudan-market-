import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pesify - Stablecoin Payments',
  description: 'Send USDC instantly on Base Chain',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
