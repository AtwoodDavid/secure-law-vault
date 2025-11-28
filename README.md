# LawVault

LawVault is an encrypted contract storage system built with FHEVM (Fully Homomorphic Encryption Virtual Machine). Lawyers can encrypt contract text on-chain, and both lawyer and client must approve before either can decrypt and view the plaintext.

## 🎥 Demo Video

Watch the demo video to see LawVault in action:

[![LawVault Demo](law-vault.mp4)](law-vault.mp4)

Or view directly: [law-vault.mp4](./law-vault.mp4)

## 🌐 Live Demo

**Vercel Deployment**: [https://secure-law-vault.vercel.app/](https://secure-law-vault.vercel.app/)

Connect your wallet to Sepolia testnet to test the application.

## 📋 Contract Addresses

### Local Network (Hardhat)
- **Chain ID**: 31337
- **Contract Address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **Network**: Local Hardhat node

### Sepolia Testnet
- **Chain ID**: 11155111
- **Contract Address**: `0x924289714a810AABb57ec687bd909D75f85a004A`
- **Network**: Ethereum Sepolia Testnet
- **Explorer**: [View on Etherscan](https://sepolia.etherscan.io/address/0x924289714a810AABb57ec687bd909D75f85a004A)

## 🏗️ Project Structure

```
law-vault/
├── contracts/          # Solidity smart contracts
│   └── LawVault.sol   # Main contract
├── test/              # Hardhat tests
│   ├── LawVault.ts    # Local tests
│   └── LawVaultSepolia.ts  # Sepolia tests
├── deploy/            # Deployment scripts
├── tasks/             # Hardhat tasks
├── frontend/          # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── hooks/       # React hooks (FHEVM, contract)
│       ├── lib/         # Utilities (AES crypto)
│       ├── config/     # Configuration
│       └── pages/       # Page components
└── types/             # TypeScript types (generated)
```

## 🔐 Encryption & Decryption Architecture

LawVault uses a **hybrid encryption approach** combining FHEVM on-chain storage with AES encryption for off-chain storage:

### Encryption Flow

1. **Text Input** → User enters contract text
2. **Hash Calculation** → Calculate hash of text using simple hash algorithm:
   ```typescript
   hash = ((hash << 5) - hash) + charCode
   hash = hash & hash  // 32-bit integer
   numericValue = Math.abs(hash) % 2147483647
   ```
3. **FHEVM Encryption** → Encrypt hash value using FHEVM `euint32`
4. **AES Encryption** → Encrypt original text using AES-GCM with contract address as password
5. **Storage**:
   - **On-chain**: Encrypted hash (FHEVM `euint32`)
   - **Off-chain**: AES-encrypted text (localStorage)

### Decryption Flow

1. **FHEVM Decryption** → Decrypt hash from chain using FHEVM
2. **AES Decryption** → Decrypt text from localStorage using contract address as password
3. **Hash Verification** → Calculate hash of decrypted text and verify it matches the on-chain hash
4. **Display** → Show original text if verification passes

### Key Components

#### Smart Contract (`LawVault.sol`)

```solidity
contract LawVault is SepoliaConfig {
    struct Contract {
        uint256 id;
        string title;
        euint32 encryptedContent;  // Encrypted hash value
        address lawyer;
        address client;
        ContractStatus status;
        uint256 createdAt;
        uint256 clientApprovedAt;
        uint256 lawyerConfirmedAt;
        bool exists;
    }
    
    // Key functions:
    // - createContract(): Create encrypted contract
    // - clientApprove(): Client approves to view
    // - lawyerConfirm(): Lawyer confirms (enables decryption)
    // - getEncryptedContent(): Get encrypted hash (only when completed)
}
```

#### Frontend Encryption (`useFHEVM.tsx`)

```typescript
// Encrypt: Text → Hash → FHEVM → Chain
//         Text → AES → localStorage
encryptString(contractAddress, text) {
  1. Calculate hash(text)
  2. Encrypt hash with FHEVM → returns handle
  3. Encrypt text with AES → returns encryptedText
  4. Return { handle, inputProof, encryptedText }
}
```

#### Frontend Decryption (`useFHEVM.tsx`)

```typescript
// Decrypt: Chain → Hash, localStorage → Text → Verify
decryptString(contractAddress, handle, contractId) {
  1. Decrypt hash from chain using handle
  2. Get encryptedText from localStorage
  3. Decrypt text using AES with contractAddress
  4. Calculate hash(decryptedText)
  5. Verify hash matches on-chain hash
  6. Return decrypted text
}
```

#### AES Encryption (`lib/crypto.ts`)

- **Algorithm**: AES-GCM 256-bit
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Password**: Contract address
- **Storage Format**: Base64 encoded (salt + IV + encrypted data)

## 🚀 Setup

### Prerequisites

- Node.js >= 20
- npm >= 7.0.0
- MetaMask or compatible Web3 wallet

### Backend Setup

1. Install dependencies:
```bash
cd project/law-vault
npm install
```

2. Compile contracts:
```bash
npm run compile
```

3. Run tests (local):
```bash
npm test
```

4. Deploy to local network:
```bash
# Terminal 1: Start Hardhat node
npx hardhat node

# Terminal 2: Deploy contract
npm run deploy:localhost
```

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Create `.env` file:
```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
VITE_LOCAL_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_SEPOLIA_CONTRACT_ADDRESS=0x924289714a810AABb57ec687bd909D75f85a004A
```

3. Start development server:
```bash
npm run dev
```

## 📖 Usage

### Workflow

1. **Lawyer creates contract**: 
   - Connect wallet → Enter contract title and content → Encrypt and submit
   - Hash is encrypted with FHEVM and stored on-chain
   - Text is encrypted with AES and stored in localStorage

2. **Client views pending contracts**: 
   - Connect wallet → See list of contracts awaiting approval

3. **Client approves**: 
   - Click "I agree to view" → Sign transaction
   - Status changes to `PendingLawyerFinalConfirmation`

4. **Lawyer confirms**: 
   - Click "I finally confirm" → Sign transaction
   - Status changes to `Completed`
   - FHEVM permissions are granted for both parties

5. **Both can decrypt**: 
   - After both approvals, both parties can decrypt and view the plaintext
   - System verifies hash integrity before displaying

### Contract Status

- `0` - **PendingClientApproval**: Waiting for client to approve
- `1` - **PendingLawyerFinalConfirmation**: Waiting for lawyer to confirm
- `2` - **Completed**: Both approved, can decrypt

## 🔒 Security Features

### On-Chain Security
- **FHEVM Encryption**: Hash values are encrypted using fully homomorphic encryption
- **Access Control**: Only lawyer and client can decrypt after mutual approval
- **Immutable Records**: All contract metadata stored on-chain

### Off-Chain Security
- **AES-GCM Encryption**: Original text encrypted with AES-256-GCM
- **PBKDF2 Key Derivation**: 100,000 iterations for key derivation
- **Hash Verification**: On-chain hash ensures data integrity
- **Contract-Specific Keys**: Each contract uses its address as encryption key

### Privacy Guarantees
- Original text never stored on-chain (only hash)
- Text encrypted with contract-specific key
- Hash verification prevents tampering
- Both parties must approve before decryption

## 🧪 Testing

### Local Testing

```bash
# Run local tests
npm test

# Run Sepolia tests (requires deployment)
npm run test:sepolia
```

### Frontend Testing

1. Start Hardhat node: `npx hardhat node`
2. Deploy contract: `npm run deploy:localhost`
3. Update frontend `.env` with contract address
4. Start frontend: `cd frontend && npm run dev`
5. Connect Rainbow wallet
6. Test the full workflow

## 🚢 Deployment

### Sepolia Testnet

1. Set environment variables (use environment variables, don't save to files):
```bash
# Windows PowerShell
$env:PRIVATE_KEY="your_private_key"
$env:INFURA_API_KEY="your_infura_api_key"

# Then deploy
npm run deploy:sepolia
```

2. Update frontend `.env` with deployed contract address

3. Deploy frontend to Vercel:
   - Connect GitHub repository
   - Set environment variables
   - Deploy automatically on push

## 🔧 Technical Details

### Smart Contract Functions

- `createContract(title, client, encryptedContent, inputProof)`: Create new encrypted contract
- `clientApprove(contractId)`: Client approves to view contract
- `lawyerConfirm(contractId)`: Lawyer confirms (enables decryption)
- `getContract(contractId)`: Get contract metadata
- `getEncryptedContent(contractId)`: Get encrypted hash (only when completed)

### Encryption Details

**Hash Algorithm**:
```typescript
let hash = 0;
for (let i = 0; i < text.length; i++) {
  hash = ((hash << 5) - hash) + text.charCodeAt(i);
  hash = hash & hash; // 32-bit integer
}
return Math.abs(hash) % 2147483647;
```

**AES Encryption**:
- Algorithm: AES-GCM
- Key Size: 256 bits
- Key Derivation: PBKDF2 (100,000 iterations, SHA-256)
- IV: 12 bytes (random)
- Salt: 16 bytes (random)

### Network Support

- **Hardhat Local** (Chain ID: 31337): Uses FHEVM mock instance
- **Sepolia Testnet** (Chain ID: 11155111): Uses FHEVM relayer SDK

## 📝 License

MIT

## 🔗 Links

- **Live Demo**: [https://secure-law-vault.vercel.app/](https://secure-law-vault.vercel.app/)
- **GitHub Repository**: [https://github.com/AtwoodDavid/secure-law-vault.git](https://github.com/AtwoodDavid/secure-law-vault.git)
- **Sepolia Contract**: [0x924289714a810AABb57ec687bd909D75f85a004A](https://sepolia.etherscan.io/address/0x924289714a810AABb57ec687bd909D75f85a004A)
