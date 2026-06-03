import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    injected(),
    coinbaseWallet(),
    walletConnect({ projectId: 'YOUR_PROJECT_ID' }),
  ],
  transports: {
    [baseSepolia.id]: http('https://sepolia.base.org'),
    [base.id]: http('https://mainnet.base.org'),
  },
});

export const CONTRACT_ADDRESS = 'YOUR_DEPLOYED_CONTRACT_ADDRESS';
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia

export const CONTRACT_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_to", "type": "address" },
      { "internalType": "uint256", "name": "_amount", "type": "uint256" },
      { "internalType": "bytes32", "name": "_txHash", "type": "bytes32" }
    ],
    "name": "sendStablecoin",
    "outputs": [
      { "internalType": "uint256", "name": "netAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeBasisPoints",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
