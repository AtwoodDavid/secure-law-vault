import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useAccount, useChainId } from 'wagmi';
import { useFHEVM } from './useFHEVM';
import { getContractAddress } from '@/config/contracts';
import { toast } from '@/components/ui/sonner';
import { Address, encodeFunctionData, parseAbi } from 'viem';

// LawVault ABI (simplified - you'll need to generate the full ABI from the contract)
const LAW_VAULT_ABI = parseAbi([
  'function createContract(string memory title, address client, bytes32 encryptedContent, bytes calldata inputProof) external returns (uint256)',
  'function clientApprove(uint256 contractId) external',
  'function lawyerConfirm(uint256 contractId) external',
  'function getContract(uint256 contractId) external view returns (string memory title, address lawyer, address client, uint8 status, uint256 createdAt, uint256 clientApprovedAt, uint256 lawyerConfirmedAt)',
  'function getEncryptedContent(uint256 contractId) external view returns (bytes32 encryptedContent)',
  'function getClientContracts(address client) external view returns (uint256[] memory)',
  'function getLawyerContracts(address lawyer) external view returns (uint256[] memory)',
  'function totalContracts() external view returns (uint256)',
  'event ContractCreated(uint256 indexed contractId, address indexed lawyer, address indexed client, string title, uint256 timestamp)',
  'event ClientApproved(uint256 indexed contractId, address indexed client, uint256 timestamp)',
  'event LawyerConfirmed(uint256 indexed contractId, address indexed lawyer, uint256 timestamp)',
]);

export type ContractStatus = 0 | 1 | 2; // PendingClientApproval | PendingLawyerFinalConfirmation | Completed

export interface Contract {
  id: bigint;
  title: string;
  lawyer: Address;
  client: Address;
  status: ContractStatus;
  createdAt: bigint;
  clientApprovedAt: bigint;
  lawyerConfirmedAt: bigint;
  encryptedContent?: string;
  decryptedContent?: string; // Changed to string to store decrypted text
}

export function useLawVault() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { encryptString, decryptString } = useFHEVM();
  const contractAddress = getContractAddress(chainId);

  const createContract = async (title: string, clientAddress: Address, content: string) => {
    if (!isConnected || !address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      // Encrypt the content
      const encrypted = await encryptString(contractAddress, content);
      if (!encrypted) {
        toast.error('Failed to encrypt content');
        return;
      }

      // Note: The contract expects externalEuint32, but we're using bytes32 for now
      // You'll need to adjust this based on your actual contract interface
      writeContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'createContract',
        args: [title, clientAddress, encrypted.handle as `0x${string}`, encrypted.inputProof as `0x${string}`],
      });
    } catch (error: any) {
      console.error('Error creating contract:', error);
      toast.error(error.message || 'Failed to create contract');
    }
  };

  const clientApprove = async (contractId: bigint) => {
    if (!isConnected || !address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      writeContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'clientApprove',
        args: [contractId],
      });
    } catch (error: any) {
      console.error('Error approving contract:', error);
      toast.error(error.message || 'Failed to approve contract');
    }
  };

  const lawyerConfirm = async (contractId: bigint) => {
    if (!isConnected || !address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      writeContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'lawyerConfirm',
        args: [contractId],
      });
    } catch (error: any) {
      console.error('Error confirming contract:', error);
      toast.error(error.message || 'Failed to confirm contract');
    }
  };

  const getContract = async (contractId: bigint): Promise<Contract | null> => {
    try {
      const result = await useReadContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'getContract',
        args: [contractId],
      });

      if (!result.data) return null;

      const [title, lawyer, client, status, createdAt, clientApprovedAt, lawyerConfirmedAt] = result.data;

      return {
        id: contractId,
        title,
        lawyer,
        client,
        status: status as ContractStatus,
        createdAt,
        clientApprovedAt,
        lawyerConfirmedAt,
      };
    } catch (error) {
      console.error('Error getting contract:', error);
      return null;
    }
  };

  const decryptContractContent = async (contractId: bigint): Promise<string | null> => {
    try {
      // Get handle from localStorage
      const handleKey = `fhevm_handle_${contractAddress}_${contractId.toString()}`;
      const savedHandle = localStorage.getItem(handleKey);
      
      if (!savedHandle) {
        console.error('Handle not found for contract:', contractId);
        return null;
      }
      
      const handleData = JSON.parse(savedHandle);
      const handle = handleData.handle;

      // Use decryptString which handles both chain decryption and localStorage decryption
      const decrypted = await decryptString(contractAddress, handle, contractId);
      return decrypted;
    } catch (error) {
      console.error('Error decrypting content:', error);
      return null;
    }
  };

  const getClientContracts = async (clientAddress: Address): Promise<bigint[]> => {
    try {
      const result = await useReadContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'getClientContracts',
        args: [clientAddress],
      });

      return result.data || [];
    } catch (error) {
      console.error('Error getting client contracts:', error);
      return [];
    }
  };

  const getLawyerContracts = async (lawyerAddress: Address): Promise<bigint[]> => {
    try {
      const result = await useReadContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'getLawyerContracts',
        args: [lawyerAddress],
      });

      return result.data || [];
    } catch (error) {
      console.error('Error getting lawyer contracts:', error);
      return [];
    }
  };

  useEffect(() => {
    if (isSuccess) {
      toast.success('Transaction confirmed!');
    }
  }, [isSuccess]);

  return {
    createContract,
    clientApprove,
    lawyerConfirm,
    getContract,
    decryptContractContent,
    getClientContracts,
    getLawyerContracts,
    isPending: isPending || isConfirming,
    isSuccess,
    contractAddress,
  };
}


