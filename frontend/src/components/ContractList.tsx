import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Lock, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { getContractAddress } from "@/config/contracts";
import { parseAbi, Address, formatEther } from "viem";
import { useFHEVM } from "@/hooks/useFHEVM";
import { toast } from "@/components/ui/sonner";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";

const LAW_VAULT_ABI = parseAbi([
  'function getContract(uint256 contractId) external view returns (string memory title, address lawyer, address client, uint8 status, uint256 createdAt, uint256 clientApprovedAt, uint256 lawyerConfirmedAt)',
  'function getEncryptedContent(uint256 contractId) external view returns (bytes32 encryptedContent)',
  'function getClientContracts(address client) external view returns (uint256[] memory)',
  'function getLawyerContracts(address lawyer) external view returns (uint256[] memory)',
  'function clientApprove(uint256 contractId) external',
  'function lawyerConfirm(uint256 contractId) external',
  'function totalContracts() external view returns (uint256)',
]);

type ContractStatus = 0 | 1 | 2;

interface Contract {
  id: bigint;
  title: string;
  lawyer: Address;
  client: Address;
  status: ContractStatus;
  createdAt: bigint;
  clientApprovedAt: bigint;
  lawyerConfirmedAt: bigint;
  decryptedContent?: string; // Changed to string to store decrypted text
}

const getStatusConfig = (status: ContractStatus) => {
  switch (status) {
    case 0:
      return {
        label: "Pending Client Approval",
        variant: "secondary" as const,
        icon: Clock,
        className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
      };
    case 1:
      return {
        label: "Pending Lawyer Confirmation",
        variant: "outline" as const,
        icon: AlertCircle,
        className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      };
    case 2:
      return {
        label: "Completed",
        variant: "default" as const,
        icon: CheckCircle2,
        className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
      };
    default:
      return {
        label: "Unknown",
        variant: "outline" as const,
        icon: FileText,
        className: "",
      };
  }
};

export const ContractList = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [decryptingContractId, setDecryptingContractId] = useState<bigint | null>(null);
  const { decryptString, decryptEuint32 } = useFHEVM();
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const prevTotalContractsRef = useRef<bigint | undefined>(undefined);

  // Get total contracts
  const { data: totalContracts, refetch: refetchTotalContracts } = useReadContract({
    address: contractAddress,
    abi: LAW_VAULT_ABI,
    functionName: 'totalContracts',
    query: { enabled: !!contractAddress, refetchInterval: 3000 }, // Poll every 3 seconds
  });

  useEffect(() => {
    if (isSuccess) {
      toast.success("Transaction confirmed!");
      // Refetch total contracts and reload list
      refetchTotalContracts();
      // loadContracts will be called automatically when totalContracts updates
    }
  }, [isSuccess, refetchTotalContracts]);

  const loadContracts = useCallback(async () => {
    if (!isConnected || !address || !contractAddress) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Note: useReadContract is a hook and can't be called conditionally
      // This is a simplified version - in production, you'd use a different approach
      // For now, we'll load contracts by iterating through totalContracts
      const total = totalContracts || 0n;
      console.log('Loading contracts. Total contracts:', total.toString(), 'Address:', address);
      
      if (total === 0n) {
        console.log('No contracts found, total is 0');
        setContracts([]);
        setLoading(false);
        return;
      }

      const contractIds: bigint[] = [];
      
      for (let i = 0n; i < total; i++) {
        contractIds.push(i);
      }
      
      console.log('Contract IDs to load:', contractIds.map(id => id.toString()));

      // Load contract details and filter by user
      const contractPromises = contractIds.map(async (id) => {
        try {
          // Use a provider to read contract data
          const { createPublicClient, http } = await import('viem');
          const { hardhat } = await import('viem/chains');
          
          const publicClient = createPublicClient({
            chain: chainId === 31337 ? hardhat : undefined,
            transport: http(),
          });

          const result = await publicClient.readContract({
            address: contractAddress,
            abi: LAW_VAULT_ABI,
            functionName: 'getContract',
            args: [id],
          });

          // readContract returns the result directly, not wrapped in { data: ... }
          if (!result) return null;

          const [title, lawyer, client, status, createdAt, clientApprovedAt, lawyerConfirmedAt] = result;

          const contract = {
            id,
            title,
            lawyer,
            client,
            status: status as ContractStatus,
            createdAt,
            clientApprovedAt,
            lawyerConfirmedAt,
          };

          console.log(`Contract ${id}: lawyer=${lawyer}, client=${client}, currentAddress=${address}`);

          // Filter: only show contracts where user is lawyer or client
          const isLawyer = contract.lawyer.toLowerCase() === address?.toLowerCase();
          const isClient = contract.client.toLowerCase() === address?.toLowerCase();
          
          if (isLawyer || isClient) {
            console.log(`Contract ${id} matched for user (isLawyer: ${isLawyer}, isClient: ${isClient})`);
            return contract;
          }
          
          console.log(`Contract ${id} filtered out (user is not lawyer or client)`);
          return null;
        } catch (error) {
          // Contract doesn't exist or other error, skip it
          console.debug(`Contract ${id} not found or error:`, error);
          return null;
        }
      });

      const loadedContracts = (await Promise.all(contractPromises)).filter((c) => c !== null) as Contract[];
      
      console.log('Loaded contracts after filtering:', loadedContracts.length, loadedContracts.map(c => ({
        id: c.id.toString(),
        title: c.title,
        lawyer: c.lawyer,
        client: c.client
      })));

      // For completed contracts, decryption will be handled on-demand
      // We'll skip automatic decryption here to avoid errors
      // Decryption requires FHEVM relayer and proper handle, which we'll implement later

      setContracts(loadedContracts.sort((a, b) => Number(b.createdAt - a.createdAt)));
    } catch (error) {
      console.error('Error loading contracts:', error);
      toast.error('Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, contractAddress, totalContracts, chainId]);

  // Reload contracts when totalContracts changes (only if it actually increased)
  useEffect(() => {
    if (totalContracts !== undefined && isConnected && address && contractAddress) {
      const prevTotal = prevTotalContractsRef.current;
      console.log('totalContracts changed:', { prev: prevTotal?.toString(), current: totalContracts.toString() });
      
      // Only reload if totalContracts actually changed and increased, or on initial load
      if (prevTotal === undefined || totalContracts > prevTotal) {
        console.log('Reloading contracts due to totalContracts increase');
        loadContracts();
        prevTotalContractsRef.current = totalContracts;
      } else if (prevTotal !== totalContracts) {
        // Value changed but didn't increase (shouldn't happen, but handle it)
        console.log('totalContracts changed but didn\'t increase, updating ref');
        prevTotalContractsRef.current = totalContracts;
      } else {
        console.log('totalContracts unchanged, skipping reload');
      }
    }
  }, [totalContracts, isConnected, address, contractAddress, loadContracts]);

  const handleClientApprove = (contractId: bigint) => {
    console.log('handleClientApprove called:', {
      contractId: contractId.toString(),
      address: address,
      contractAddress: contractAddress
    });
    
    // Verify the contract status before approving
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) {
      toast.error('Contract not found');
      return;
    }
    
    if (contract.status !== 0) {
      toast.error(`Contract is not in pending approval status. Current status: ${contract.status}`);
      return;
    }
    
    if (contract.client.toLowerCase() !== address?.toLowerCase()) {
      toast.error('Only the client can approve this contract');
      return;
    }
    
    writeContract({
      address: contractAddress,
      abi: LAW_VAULT_ABI,
      functionName: 'clientApprove',
      args: [contractId],
    });
  };

  const handleLawyerConfirm = (contractId: bigint) => {
    console.log('handleLawyerConfirm called:', {
      contractId: contractId.toString(),
      address: address,
      contractAddress: contractAddress
    });
    
    // Verify the contract status before confirming
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) {
      toast.error('Contract not found');
      return;
    }
    
    if (contract.status !== 1) {
      toast.error(`Contract is not in pending confirmation status. Current status: ${contract.status}`);
      return;
    }
    
    if (contract.lawyer.toLowerCase() !== address?.toLowerCase()) {
      toast.error('Only the lawyer can confirm this contract');
      return;
    }
    
    writeContract({
      address: contractAddress,
      abi: LAW_VAULT_ABI,
      functionName: 'lawyerConfirm',
      args: [contractId],
    });
  };

  const handleDecrypt = async (contractId: bigint) => {
    console.log('handleDecrypt called:', {
      contractId: contractId.toString(),
      address: address,
      contractAddress: contractAddress
    });

    const contract = contracts.find(c => c.id === contractId);
    if (!contract) {
      toast.error('Contract not found');
      return;
    }

    if (contract.status !== 2) {
      toast.error('Contract must be completed to decrypt');
      return;
    }

    if (contract.lawyer.toLowerCase() !== address?.toLowerCase() && 
        contract.client.toLowerCase() !== address?.toLowerCase()) {
      toast.error('Only lawyer or client can decrypt this contract');
      return;
    }

    try {
      setDecryptingContractId(contractId);
      toast.info('Decrypting contract content...');
      
      // Get the handle from localStorage
      // The handle was saved when the contract was created
      const handleKey = `fhevm_handle_${contractAddress}_${contractId.toString()}`;
      const savedHandle = localStorage.getItem(handleKey);
      
      let handle: string;
      
      if (savedHandle) {
        // Use saved handle
        const handleData = JSON.parse(savedHandle);
        handle = handleData.handle;
        console.log('Using saved handle from localStorage:', handle);
      } else {
        // Try to get from pending storage (for newly created contracts)
        const pendingKey = `fhevm_handle_${contractAddress}_pending`;
        const pendingHandle = localStorage.getItem(pendingKey);
        
        if (pendingHandle) {
          const handleData = JSON.parse(pendingHandle);
          handle = handleData.handle;
          // Move from pending to permanent storage
          localStorage.setItem(handleKey, JSON.stringify(handleData));
          localStorage.removeItem(pendingKey);
          console.log('Using pending handle and moving to permanent storage:', handle);
        } else {
          // Old contract: handle not found in localStorage
          // This means the contract was created before the new storage system was implemented
          // We cannot recover the original text, only the hash value
          console.log('Old contract detected: handle not found in localStorage');
          
          // Try to decrypt the hash value from chain (if possible)
          // But we need the handle to decrypt, which we don't have for old contracts
          toast.error('This is an old contract created before text storage was implemented. The original text cannot be recovered. Please create a new contract to use the new features.');
          
          // Optionally, we could try to read the encrypted hash from chain
          // but without the handle, we cannot decrypt it
          setDecryptingContractId(null);
          return;
        }
      }
      
      console.log('Attempting to decrypt contract:', {
        contractId: contractId.toString(),
        handle: handle,
        contractAddress: contractAddress
      });
      
      // Decrypt using decryptString which will:
      // 1. Decrypt hash from chain
      // 2. Get encrypted text from localStorage
      // 3. Decrypt text and verify hash
      const decryptedText = await decryptString(contractAddress, handle, contractId);
      
      if (decryptedText !== null && decryptedText !== '') {
        // Update the contract with decrypted content
        setContracts(prevContracts => 
          prevContracts.map(c => 
            c.id === contractId 
              ? { ...c, decryptedContent: decryptedText }
              : c
          )
        );
        toast.success('Contract decrypted successfully!');
      } else {
        toast.error('Failed to decrypt contract. The handle may be incorrect or encrypted text not found.');
      }
    } catch (error: any) {
      console.error('Decryption error:', error);
      toast.error(error.message || 'Failed to decrypt contract');
    } finally {
      setDecryptingContractId(null);
    }
  };

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please connect your wallet to view contracts
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading contracts...</p>
        </CardContent>
      </Card>
    );
  }

  if (contracts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No contracts found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {contracts.map((contract) => {
        const statusConfig = getStatusConfig(contract.status);
        const StatusIcon = statusConfig.icon;
        const isLawyer = contract.lawyer.toLowerCase() === address?.toLowerCase();
        const isClient = contract.client.toLowerCase() === address?.toLowerCase();
        const canApprove = isClient && contract.status === 0;
        const canConfirm = isLawyer && contract.status === 1;
        
        console.log(`Contract ${contract.id}:`, {
          title: contract.title,
          status: contract.status,
          lawyer: contract.lawyer,
          client: contract.client,
          currentAddress: address,
          isLawyer,
          isClient,
          canApprove,
          canConfirm
        });

        return (
          <Card key={contract.id.toString()} className="group hover:shadow-xl transition-all duration-300">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div className="p-3 rounded-lg bg-legal-navy/10 group-hover:bg-legal-navy/20 transition-colors">
                  <FileText className="h-6 w-6 text-legal-navy dark:text-legal-gold" />
                </div>
                <Badge className={statusConfig.className}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
              </div>
              <CardTitle className="text-lg">{contract.title}</CardTitle>
              <CardDescription>
                {isLawyer ? `Client: ${contract.client.slice(0, 6)}...${contract.client.slice(-4)}` : `Lawyer: ${contract.lawyer.slice(0, 6)}...${contract.lawyer.slice(-4)}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  {new Date(Number(contract.createdAt) * 1000).toLocaleDateString()}
                </div>

                {contract.status === 2 && contract.decryptedContent !== undefined && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm whitespace-pre-wrap">{contract.decryptedContent}</p>
                  </div>
                )}

                {contract.status === 2 && contract.decryptedContent === undefined && (
                  <div className="space-y-2">
                    <div className="p-3 bg-muted rounded-md flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <p className="text-sm">Content encrypted</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDecrypt(contract.id)}
                      disabled={decryptingContractId === contract.id}
                      className="w-full"
                    >
                      {decryptingContractId === contract.id ? "Decrypting..." : "Decrypt Content"}
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  {canApprove && (
                    <Button
                      size="sm"
                      onClick={() => handleClientApprove(contract.id)}
                      disabled={isConfirming}
                      className="flex-1"
                    >
                      I Agree to View
                    </Button>
                  )}
                  {canConfirm && (
                    <Button
                      size="sm"
                      onClick={() => handleLawyerConfirm(contract.id)}
                      disabled={isConfirming}
                      className="flex-1"
                    >
                      I Finally Confirm
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

