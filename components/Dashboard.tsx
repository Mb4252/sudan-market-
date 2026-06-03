'use client';

import { useAccount, useBalance, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/utils/config';

export default function Dashboard() {
  const { address } = useAccount();
  const { data: balance } = useBalance({
    address,
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC Base Sepolia
  });
  
  const { data: feeBasisPoints } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'feeBasisPoints',
  });

  if (!address) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
        Connect wallet to view dashboard
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">Your Dashboard</h2>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>USDC Balance:</span>
          <span className="font-mono font-bold">
            {balance ? `${Number(balance.formatted).toFixed(2)} USDC` : 'Loading...'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Platform Fee:</span>
          <span className="font-mono">
            {feeBasisPoints ? `${Number(feeBasisPoints) / 100}%` : 'Loading...'}
          </span>
        </div>
        <div className="mt-4 p-3 bg-green-50 rounded">
          <p className="text-sm text-green-800">
            💡 You save ~8% compared to traditional remittances!
          </p>
        </div>
      </div>
    </div>
  );
}
