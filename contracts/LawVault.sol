// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title LawVault - Encrypted contract storage with mutual approval
/// @notice A smart contract for lawyers to encrypt contract text on-chain
/// @dev Both lawyer and client must approve before either can decrypt
contract LawVault is SepoliaConfig {
    /// @notice Contract status enum
    enum ContractStatus {
        PendingClientApproval,  // 0: Waiting for client to approve
        PendingLawyerFinalConfirmation,  // 1: Waiting for lawyer final confirmation
        Completed  // 2: Both approved, can decrypt
    }

    /// @notice Contract structure
    struct Contract {
        uint256 id;
        string title;
        euint32 encryptedContent;  // Encrypted contract text
        address lawyer;
        address client;
        ContractStatus status;
        uint256 createdAt;
        uint256 clientApprovedAt;
        uint256 lawyerConfirmedAt;
        bool exists;
    }

    /// @notice Mapping from contract ID to Contract
    mapping(uint256 => Contract) public contracts;

    /// @notice Mapping from client address to array of contract IDs
    mapping(address => uint256[]) public clientContracts;

    /// @notice Mapping from lawyer address to array of contract IDs
    mapping(address => uint256[]) public lawyerContracts;

    /// @notice Total number of contracts
    uint256 public totalContracts;

    /// @notice Event emitted when a new contract is created
    event ContractCreated(
        uint256 indexed contractId,
        address indexed lawyer,
        address indexed client,
        string title,
        uint256 timestamp
    );

    /// @notice Event emitted when client approves
    event ClientApproved(
        uint256 indexed contractId,
        address indexed client,
        uint256 timestamp
    );

    /// @notice Event emitted when lawyer confirms
    event LawyerConfirmed(
        uint256 indexed contractId,
        address indexed lawyer,
        uint256 timestamp
    );

    /// @notice Create a new encrypted contract
    /// @param title The title of the contract
    /// @param client The address of the client
    /// @param encryptedContent The encrypted contract content
    /// @param inputProof Proof for the encrypted data
    /// @return contractId The ID of the newly created contract
    function createContract(
        string memory title,
        address client,
        externalEuint32 encryptedContent,
        bytes calldata inputProof
    ) external returns (uint256) {
        require(client != address(0), "Client address cannot be zero");
        require(client != msg.sender, "Lawyer and client cannot be the same");
        require(bytes(title).length > 0, "Title cannot be empty");

        uint256 contractId = totalContracts;
        totalContracts++;

        // Convert external encrypted value to internal euint32
        euint32 encryptedEuint32 = FHE.fromExternal(encryptedContent, inputProof);
        
        // Allow contract to use this encrypted value
        FHE.allowThis(encryptedEuint32);
        // Initially, no one can decrypt (will be allowed after both approve)

        contracts[contractId] = Contract({
            id: contractId,
            title: title,
            encryptedContent: encryptedEuint32,
            lawyer: msg.sender,
            client: client,
            status: ContractStatus.PendingClientApproval,
            createdAt: block.timestamp,
            clientApprovedAt: 0,
            lawyerConfirmedAt: 0,
            exists: true
        });

        clientContracts[client].push(contractId);
        lawyerContracts[msg.sender].push(contractId);

        emit ContractCreated(contractId, msg.sender, client, title, block.timestamp);
        return contractId;
    }

    /// @notice Client approves to view the contract
    /// @param contractId The ID of the contract
    function clientApprove(uint256 contractId) external {
        Contract storage contractData = contracts[contractId];
        require(contractData.exists, "Contract does not exist");
        require(contractData.client == msg.sender, "Only client can approve");
        require(
            contractData.status == ContractStatus.PendingClientApproval,
            "Contract not in pending client approval status"
        );

        contractData.status = ContractStatus.PendingLawyerFinalConfirmation;
        contractData.clientApprovedAt = block.timestamp;

        emit ClientApproved(contractId, msg.sender, block.timestamp);
    }

    /// @notice Lawyer confirms final approval (both parties can now decrypt)
    /// @param contractId The ID of the contract
    function lawyerConfirm(uint256 contractId) external {
        Contract storage contractData = contracts[contractId];
        require(contractData.exists, "Contract does not exist");
        require(contractData.lawyer == msg.sender, "Only lawyer can confirm");
        require(
            contractData.status == ContractStatus.PendingLawyerFinalConfirmation,
            "Contract not in pending lawyer confirmation status"
        );

        contractData.status = ContractStatus.Completed;
        contractData.lawyerConfirmedAt = block.timestamp;

        // Allow both lawyer and client to decrypt
        FHE.allow(contractData.encryptedContent, contractData.lawyer);
        FHE.allow(contractData.encryptedContent, contractData.client);

        emit LawyerConfirmed(contractId, msg.sender, block.timestamp);
    }

    /// @notice Get contract details (public info, no encrypted content)
    /// @param contractId The ID of the contract
    /// @return title The title
    /// @return lawyer The lawyer address
    /// @return client The client address
    /// @return status The current status
    /// @return createdAt The creation timestamp
    /// @return clientApprovedAt The client approval timestamp
    /// @return lawyerConfirmedAt The lawyer confirmation timestamp
    function getContract(uint256 contractId)
        external
        view
        returns (
            string memory title,
            address lawyer,
            address client,
            ContractStatus status,
            uint256 createdAt,
            uint256 clientApprovedAt,
            uint256 lawyerConfirmedAt
        )
    {
        Contract storage contractData = contracts[contractId];
        require(contractData.exists, "Contract does not exist");
        
        return (
            contractData.title,
            contractData.lawyer,
            contractData.client,
            contractData.status,
            contractData.createdAt,
            contractData.clientApprovedAt,
            contractData.lawyerConfirmedAt
        );
    }

    /// @notice Get encrypted content (only accessible if status is Completed)
    /// @param contractId The ID of the contract
    /// @return encryptedContent The encrypted content
    function getEncryptedContent(uint256 contractId)
        external
        view
        returns (euint32 encryptedContent)
    {
        Contract storage contractData = contracts[contractId];
        require(contractData.exists, "Contract does not exist");
        require(
            contractData.status == ContractStatus.Completed,
            "Contract must be completed to access content"
        );
        require(
            msg.sender == contractData.lawyer || msg.sender == contractData.client,
            "Only lawyer or client can access content"
        );
        
        return contractData.encryptedContent;
    }

    /// @notice Get all contract IDs for a client
    /// @param client The client address
    /// @return An array of contract IDs
    function getClientContracts(address client)
        external
        view
        returns (uint256[] memory)
    {
        return clientContracts[client];
    }

    /// @notice Get all contract IDs for a lawyer
    /// @param lawyer The lawyer address
    /// @return An array of contract IDs
    function getLawyerContracts(address lawyer)
        external
        view
        returns (uint256[] memory)
    {
        return lawyerContracts[lawyer];
    }

    /// @notice Check if a contract exists
    /// @param contractId The ID of the contract
    /// @return Whether the contract exists
    function contractExists(uint256 contractId)
        external
        view
        returns (bool)
    {
        return contracts[contractId].exists;
    }
}


