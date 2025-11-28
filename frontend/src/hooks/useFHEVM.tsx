import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';
import type { FhevmInstance } from '@zama-fhe/relayer-sdk/bundle';
import { JsonRpcProvider } from 'ethers';

// Fetch FHEVM metadata from Hardhat node
async function fetchFHEVMMetadata(rpcUrl: string) {
  try {
    console.log('Fetching FHEVM metadata from:', rpcUrl);
    const provider = new JsonRpcProvider(rpcUrl);
    
    const metadata = await provider.send('fhevm_relayer_metadata', []);
    
    if (metadata && typeof metadata === 'object') {
      const aclAddress = metadata.ACLAddress || metadata.aclAddress || metadata.ACL;
      const inputVerifierAddress = metadata.InputVerifierAddress || metadata.inputVerifierAddress || metadata.InputVerifier || metadata.inputVerifier;
      const kmsVerifierAddress = metadata.KMSVerifierAddress || metadata.kmsVerifierAddress || metadata.KMSVerifier || metadata.kmsVerifier;
      
      if (
        aclAddress &&
        inputVerifierAddress &&
        kmsVerifierAddress &&
        typeof aclAddress === 'string' &&
        typeof inputVerifierAddress === 'string' &&
        typeof kmsVerifierAddress === 'string'
      ) {
        return {
          ACLAddress: aclAddress as `0x${string}`,
          InputVerifierAddress: inputVerifierAddress as `0x${string}`,
          KMSVerifierAddress: kmsVerifierAddress as `0x${string}`,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch FHEVM metadata:', error);
    return null;
  }
}

// Create fhEVM instance
async function createFhevmInstance(
  walletClient: any,
  chainId: number
): Promise<FhevmInstance | null> {
  try {
    // For local Hardhat network (chainId 31337), use mock instance
    if (chainId === 31337) {
      const rpcUrl = 'http://127.0.0.1:8545';
      
      const metadata = await fetchFHEVMMetadata(rpcUrl);
      
      if (!metadata) {
        console.warn('FHEVM metadata not available, using basic mock instance with default addresses');
        const { MockFhevmInstance } = await import('@fhevm/mock-utils');
        const ethersProvider = new JsonRpcProvider(rpcUrl);
        const instance = await MockFhevmInstance.create(ethersProvider, ethersProvider, {
          aclContractAddress: '0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D',
          chainId: 31337,
          gatewayChainId: 55815,
          inputVerifierContractAddress: '0x901F8942346f7AB3a01F6D7613119Bca447Bb030',
          kmsContractAddress: '0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC',
          verifyingContractAddressDecryption: '0x5ffdaAB0373E62E2ea2944776209aEf29E631A64',
          verifyingContractAddressInputVerification: '0x812b06e1CDCE800494b79fFE4f925A504a9A9810',
        });
        return instance as any;
      }
      
      const { MockFhevmInstance } = await import('@fhevm/mock-utils');
      const ethersProvider = new JsonRpcProvider(rpcUrl);
      const instance = await MockFhevmInstance.create(ethersProvider, ethersProvider, {
        aclContractAddress: metadata.ACLAddress,
        chainId: 31337,
        gatewayChainId: 55815,
        inputVerifierContractAddress: metadata.InputVerifierAddress,
        kmsContractAddress: metadata.KMSVerifierAddress,
        verifyingContractAddressDecryption: '0x5ffdaAB0373E62E2ea2944776209aEf29E631A64',
        verifyingContractAddressInputVerification: '0x812b06e1CDCE800494b79fFE4f925A504a9A9810',
      });
      return instance as any;
    }
    
    // For Sepolia network (chainId 11155111), use relayer SDK
    if (chainId === 11155111) {
      console.log('Initializing FHEVM for Sepolia network...');
      
      try {
        if (typeof window !== 'undefined' && (window as any).relayerSDK) {
          const relayerSDK = (window as any).relayerSDK;
          console.log('Using window.relayerSDK from CDN');
          
          if (!relayerSDK.__initialized__) {
            await relayerSDK.initSDK();
            relayerSDK.__initialized__ = true;
          }
          
          const instance = await relayerSDK.createInstance(relayerSDK.SepoliaConfig || {
            chainId: 11155111,
          });
          
          console.log('FHEVM instance created for Sepolia');
          return instance;
        }
        
        console.log('window.relayerSDK not found, trying bundle import...');
        const relayerSDK = await import('@zama-fhe/relayer-sdk/bundle');
        
        if (!relayerSDK.initSDK || typeof relayerSDK.initSDK !== 'function') {
          throw new Error('initSDK is not available from relayer SDK');
        }
        
        await relayerSDK.initSDK();
        console.log('FHEVM SDK initialized');
        
        const instance = await relayerSDK.createInstance(relayerSDK.SepoliaConfig);
        console.log('FHEVM instance created for Sepolia');
        return instance;
      } catch (error) {
        console.error('Failed to initialize FHEVM for Sepolia:', error);
        throw error;
      }
    }
    
    console.warn(`Unsupported chainId: ${chainId}. FHEVM not available.`);
    return null;
  } catch (error) {
    console.error('Failed to create fhEVM instance:', error);
    return null;
  }
}

interface FHEVMContextType {
  instance: FhevmInstance | null;
  isLoading: boolean;
  error: string | null;
  initializeInstance: () => Promise<void>;
  decryptEuint32: (contractAddress: string, handle: string) => Promise<bigint | null>;
  encryptEuint32: (contractAddress: string, value: number) => Promise<{ handle: string; inputProof: string } | null>;
  encryptString: (contractAddress: string, text: string) => Promise<{ handle: string; inputProof: string; encryptedText: string } | null>;
  decryptString: (contractAddress: string, handle: string, contractId: bigint) => Promise<string | null>;
}

const FHEVMContext = createContext<FHEVMContextType | undefined>(undefined);

export function FHEVMProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();

  const initializeInstance = async () => {
    if (!isConnected || !address || !walletClient || !chainId) {
      setInstance(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log('Initializing FHEVM for chainId:', chainId);
      const fhevmInstance = await createFhevmInstance(walletClient, chainId);
      
      if (fhevmInstance) {
        console.log('FHEVM instance created successfully');
        setInstance(fhevmInstance);
      } else {
        throw new Error('Failed to create FHEVM instance (returned null)');
      }
    } catch (err) {
      console.error('Failed to initialize FHEVM:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize FHEVM');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address && walletClient && chainId) {
      initializeInstance();
    } else {
      setInstance(null);
      setIsLoading(false);
      setError(null);
    }
  }, [isConnected, address, walletClient, chainId]);

  const decryptEuint32 = async (
    contractAddress: string,
    handle: string
  ): Promise<bigint | null> => {
    if (!instance || !address || !walletClient) {
      throw new Error('FHEVM instance or wallet not ready');
    }

    try {
      const keypair = instance.generateKeypair();
      const start = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        start,
        durationDays
      );

      const signature = await walletClient.signTypedData({
        account: address as `0x${string}`,
        domain: eip712.domain as any,
        types: eip712.types as any,
        primaryType: eip712.primaryType as any,
        message: eip712.message as any,
      });

      const signatureString = typeof signature === 'string' ? signature : String(signature);
      const signatureWithoutPrefix = signatureString.startsWith('0x') 
        ? signatureString.replace('0x', '') 
        : signatureString;

      const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signatureWithoutPrefix,
        contractAddresses,
        address,
        start,
        durationDays
      );

      const decrypted = result[handle];
      if (typeof decrypted === 'bigint') return decrypted;
      if (typeof decrypted === 'string') return BigInt(decrypted);
      return null;
    } catch (e: any) {
      console.error('Decryption failed:', e);
      return null;
    }
  };

  const encryptEuint32 = async (
    contractAddress: string,
    value: number
  ): Promise<{ handle: string; inputProof: string } | null> => {
    if (!instance || !address) {
      throw new Error('FHEVM instance or wallet not ready');
    }

    try {
      const input = instance.createEncryptedInput(contractAddress, address);
      input.add32(value);
      const encrypted = await input.encrypt();

      const handle = encrypted.handles[0];
      let handleString: string;
      if (typeof handle === 'string') {
        handleString = handle.startsWith('0x') ? handle : `0x${handle}`;
      } else if (handle instanceof Uint8Array) {
        handleString = '0x' + Array.from(handle).map(b => b.toString(16).padStart(2, '0')).join('');
      } else if (Array.isArray(handle)) {
        handleString = '0x' + handle.map(b => (typeof b === 'number' ? b : parseInt(String(b), 10)).toString(16).padStart(2, '0')).join('');
      } else {
        const handleStr = String(handle);
        handleString = handleStr.startsWith('0x') ? handleStr : `0x${handleStr}`;
      }

      const proof = encrypted.inputProof;
      let proofString: string;
      if (typeof proof === 'string') {
        proofString = proof;
      } else if (proof instanceof Uint8Array) {
        proofString = '0x' + Array.from(proof).map(b => b.toString(16).padStart(2, '0')).join('');
      } else if (Array.isArray(proof)) {
        proofString = '0x' + proof.map(b => (typeof b === 'number' ? b : parseInt(String(b), 10)).toString(16).padStart(2, '0')).join('');
      } else {
        proofString = String(proof);
      }

      return {
        handle: handleString,
        inputProof: proofString,
      };
    } catch (e: any) {
      console.error('Encryption failed:', e);
      return null;
    }
  };

  // Encrypt string: calculate hash and encrypt it for on-chain storage
  // The actual text will be encrypted with AES and stored in localStorage
  const encryptString = async (
    contractAddress: string,
    text: string
  ): Promise<{ handle: string; inputProof: string; encryptedText: string } | null> => {
    try {
      // Calculate hash of the text (for on-chain storage and verification)
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      // Use absolute value and modulo to fit in uint32 range
      const numericValue = Math.abs(hash) % 2147483647; // Max safe uint32
      
      // Encrypt the hash for on-chain storage
      const encryptedHash = await encryptEuint32(contractAddress, numericValue);
      if (!encryptedHash) {
        return null;
      }

      // Encrypt the text with AES for localStorage storage
      const { encryptText } = await import('@/lib/crypto');
      const encryptedText = await encryptText(text, contractAddress);

      return {
        handle: encryptedHash.handle,
        inputProof: encryptedHash.inputProof,
        encryptedText: encryptedText, // For localStorage storage
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  };

  // Decrypt string: get encrypted text from localStorage, decrypt it, and verify hash
  const decryptString = async (
    contractAddress: string,
    handle: string,
    contractId: bigint
  ): Promise<string | null> => {
    if (!instance || !address || !walletClient) {
      throw new Error('FHEVM instance or wallet not ready');
    }

    try {
      // Step 1: Decrypt the hash from chain
      const decryptedHash = await decryptEuint32(contractAddress, handle);
      if (decryptedHash === null) {
        console.error('Failed to decrypt hash from chain');
        return null;
      }

      // Step 2: Get encrypted text from localStorage
      const storageKey = `encrypted_text_${contractAddress}_${contractId.toString()}`;
      const encryptedTextData = localStorage.getItem(storageKey);
      
      if (!encryptedTextData) {
        console.error('Encrypted text not found in localStorage');
        return null;
      }

      // Step 3: Decrypt the text from localStorage
      const { decryptText, calculateTextHash } = await import('@/lib/crypto');
      const decryptedText = await decryptText(encryptedTextData, contractAddress);

      // Step 4: Verify hash matches
      const calculatedHash = calculateTextHash(decryptedText);
      const chainHash = Number(decryptedHash);

      if (calculatedHash !== chainHash) {
        console.error('Hash verification failed!', {
          calculated: calculatedHash,
          chain: chainHash
        });
        throw new Error('Hash verification failed. The text may have been tampered with.');
      }

      console.log('Hash verification successful');
      return decryptedText;
    } catch (error: any) {
      console.error('Decryption failed:', error);
      throw error;
    }
  };

  const value: FHEVMContextType = {
    instance,
    isLoading,
    error,
    initializeInstance,
    decryptEuint32,
    encryptEuint32,
    encryptString,
    decryptString,
  };

  return <FHEVMContext.Provider value={value}>{children}</FHEVMContext.Provider>;
}

export function useFHEVM() {
  const context = useContext(FHEVMContext);
  if (context === undefined) {
    throw new Error('useFHEVM must be used within a FHEVMProvider');
  }
  return context;
}


