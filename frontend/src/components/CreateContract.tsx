import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useFHEVM } from "@/hooks/useFHEVM";
import { getContractAddress } from "@/config/contracts";
import { toast } from "@/components/ui/sonner";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, Address } from "viem";

const LAW_VAULT_ABI = parseAbi([
  'function createContract(string memory title, address client, bytes32 encryptedContent, bytes calldata inputProof) external returns (uint256)',
]);

export const CreateContract = () => {
  const { address, isConnected } = useAccount();
  const { encryptString, isLoading: fhevmLoading, error: fhevmError } = useFHEVM();
  const [title, setTitle] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  
  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });
  const { data: totalContracts } = useReadContract({
    address: contractAddress,
    abi: LAW_VAULT_ABI,
    functionName: 'totalContracts',
    query: { enabled: !!contractAddress },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!title || !clientAddress || !content) {
      toast.error("Please fill in all fields");
      return;
    }

    // Check if FHEVM is ready
    if (fhevmLoading) {
      toast.info("FHEVM is initializing, please wait...");
      return;
    }

    if (fhevmError) {
      toast.error(`FHEVM initialization failed: ${fhevmError}. Please refresh the page or switch networks.`);
      return;
    }

    try {
      setIsSubmitting(true);

      // Encrypt the content (returns hash handle for chain + encrypted text for localStorage)
      const encrypted = await encryptString(contractAddress, content);
      if (!encrypted) {
        toast.error("Failed to encrypt content");
        setIsSubmitting(false);
        return;
      }

      // Save the handle to localStorage for later decryption
      // We'll save it with a key that includes contractAddress and a temporary ID
      // The actual contractId will be available after the transaction is confirmed
      const tempKey = `fhevm_handle_${contractAddress}_pending`;
      localStorage.setItem(tempKey, JSON.stringify({
        handle: encrypted.handle,
        timestamp: Date.now()
      }));

      // Save encrypted text to temporary storage (will be moved to permanent storage after contract creation)
      const tempTextKey = `encrypted_text_${contractAddress}_pending`;
      localStorage.setItem(tempTextKey, encrypted.encryptedText);

      // Create contract (only hash is stored on-chain)
      writeContract({
        address: contractAddress,
        abi: LAW_VAULT_ABI,
        functionName: 'createContract',
        args: [title, clientAddress as Address, encrypted.handle as `0x${string}`, encrypted.inputProof as `0x${string}`],
      });
    } catch (error: any) {
      console.error("Error creating contract:", error);
      toast.error(error.message || "Failed to create contract");
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isSuccess && totalContracts !== undefined) {
      toast.success("Contract created successfully!");
      
      // Move handle and encrypted text from pending to permanent storage using the new contractId
      // The contractId is totalContracts - 1 (since it was incremented after creation)
      const contractId = totalContracts > 0n ? totalContracts - 1n : 0n;
      
      // Move handle
      const pendingKey = `fhevm_handle_${contractAddress}_pending`;
      const handleKey = `fhevm_handle_${contractAddress}_${contractId.toString()}`;
      const pendingHandle = localStorage.getItem(pendingKey);
      if (pendingHandle) {
        localStorage.setItem(handleKey, pendingHandle);
        localStorage.removeItem(pendingKey);
        console.log(`Saved handle for contract ${contractId.toString()}`);
      }
      
      // Move encrypted text
      const tempTextKey = `encrypted_text_${contractAddress}_pending`;
      const textKey = `encrypted_text_${contractAddress}_${contractId.toString()}`;
      const pendingText = localStorage.getItem(tempTextKey);
      if (pendingText) {
        localStorage.setItem(textKey, pendingText);
        localStorage.removeItem(tempTextKey);
        console.log(`Saved encrypted text for contract ${contractId.toString()}`);
      }
      
      setTitle("");
      setClientAddress("");
      setContent("");
      setIsSubmitting(false);
    }
  }, [isSuccess, totalContracts, contractAddress]);

  if (!isConnected) {
    return (
      <Card className="mb-8">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please connect your wallet to create a contract
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Create New Contract</CardTitle>
        <CardDescription>
          Encrypt and submit a contract. The client must approve before you can view it together.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Contract Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Partnership Agreement"
              required
            />
          </div>

          <div>
            <Label htmlFor="client">Client Address</Label>
            <Input
              id="client"
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="0x..."
              required
            />
          </div>

          <div>
            <Label htmlFor="content">Contract Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter contract text here..."
              rows={6}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || isConfirming || fhevmLoading || !!fhevmError}
            className="w-full"
          >
            {isSubmitting || isConfirming ? "Encrypting & Submitting..." : fhevmLoading ? "Initializing FHEVM..." : "Encrypt & Submit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

