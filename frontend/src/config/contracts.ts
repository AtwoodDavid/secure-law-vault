import { Address } from 'viem';

// Contract addresses for different networks
export const CONTRACT_ADDRESSES: Record<number, Address> = {
  // Hardhat local network
  31337: (import.meta.env.VITE_LOCAL_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3') as Address,
  // Sepolia testnet
  11155111: (import.meta.env.VITE_SEPOLIA_CONTRACT_ADDRESS || '0x924289714a810AABb57ec687bd909D75f85a004A') as Address,
};

// Default contract address (for Hardhat local)
export const DEFAULT_CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;

/**
 * Get contract address for a given chain ID
 * @param chainId - The chain ID (optional, will use current chain if not provided)
 * @returns The contract address for the chain, or default address if not found
 */
export function getContractAddress(chainId?: number): Address {
  // If chainId is provided, use it
  if (chainId && CONTRACT_ADDRESSES[chainId]) {
    return CONTRACT_ADDRESSES[chainId];
  }
  
  // Try to get chainId from window.ethereum or wagmi
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    try {
      const chainId = parseInt((window as any).ethereum.chainId, 16);
      if (CONTRACT_ADDRESSES[chainId]) {
        return CONTRACT_ADDRESSES[chainId];
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  return DEFAULT_CONTRACT_ADDRESS;
}

