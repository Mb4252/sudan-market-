'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { CONTRACT_ADDRESS, CONTRACT_ABI, USDC_ADDRESS } from '@/utils/config';

export default function SendForm() {
  const { address } = useAccount();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [status, setStatus] = useState('');

  const { writeContract, data: hash, isPending } = useWriteContract();
  
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const handleSend = async () => {
    if (!address) {
      setStatus('Please connect wallet');
      return;
    }

    const amountInUSDC = parseUnits(amount, 6);
    const uniqueHash = `0x${Math.random().toString(36).substring(2, 15)}${Date.now().toString(16)}`;
    
    try {
      // First approve USDC
      const approveData = {
        address: USDC_ADDRESS,
        abi: [{
          name: 'approve',
          type: 'function',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }],
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, amountInUSDC]
      };
      
      // You need to handle approve separately
      // For simplicity, assuming user already approved
      
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'sendStablecoin',
        args: [to, amountInUSDC, uniqueHash],
      });
      
      setStatus('Transaction submitted...');
      setTxHash(uniqueHash);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Send Stablecoins</h2>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Recipient address"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="number"
          placeholder="Amount (USDC)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full p-2 border rounded"
        />
        
        <button
          onClick={handleSend}
          disabled={isPending || isConfirming}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {isPending ? 'Sending...' : isConfirming ? 'Confirming...' : 'Send'}
        </button>
        
        {hash && (
          <div className="mt-4 text-sm">
            <p>Transaction: <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" className="text-blue-500">View on BaseScan</a></p>
          </div>
        )}
        
        {status && <p className="mt-4 text-center text-gray-600">{status}</p>}
      </div>
    </div>
  );
}
