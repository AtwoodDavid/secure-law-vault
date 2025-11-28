import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Deploy and Interact Locally (--network localhost)
 * ===========================================================
 *
 * 1. From a separate terminal window:
 *
 *   npx hardhat node
 *
 * 2. Deploy the LawVault contract
 *
 *   npx hardhat --network localhost deploy
 *
 * 3. Interact with the LawVault contract
 *
 *   npx hardhat --network localhost task:address
 *   npx hardhat --network localhost task:create-contract --title "Test Contract" --client <CLIENT_ADDRESS>
 *   npx hardhat --network localhost task:client-approve --contract-id 0
 *   npx hardhat --network localhost task:lawyer-confirm --contract-id 0
 *   npx hardhat --network localhost task:decrypt-content --contract-id 0
 *
 *
 * Tutorial: Deploy and Interact on Sepolia (--network sepolia)
 * ===========================================================
 *
 * 1. Deploy the LawVault contract
 *
 *   npx hardhat --network sepolia deploy
 *
 * 2. Interact with the LawVault contract
 *
 *   npx hardhat --network sepolia task:address
 *   npx hardhat --network sepolia task:create-contract --title "Test Contract" --client <CLIENT_ADDRESS>
 *   npx hardhat --network sepolia task:client-approve --contract-id 0
 *   npx hardhat --network sepolia task:lawyer-confirm --contract-id 0
 *   npx hardhat --network sepolia task:decrypt-content --contract-id 0
 *
 */

/**
 * Example:
 *   - npx hardhat --network localhost task:address
 *   - npx hardhat --network sepolia task:address
 */
task("task:address", "Prints the LawVault address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const lawVault = await deployments.get("LawVault");

  console.log("LawVault address is " + lawVault.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost task:create-contract --title "Test Contract" --client <ADDRESS> --content 123
 *   - npx hardhat --network sepolia task:create-contract --title "Test Contract" --client <ADDRESS> --content 123
 */
task("task:create-contract", "Creates a new encrypted contract")
  .addOptionalParam("address", "Optionally specify the LawVault contract address")
  .addParam("title", "The contract title")
  .addParam("client", "The client address")
  .addParam("content", "The contract content value (as integer for euint32)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const LawVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LawVault");
    console.log(`LawVault: ${LawVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const lawyer = signers[0];
    const clientAddress = taskArguments.client;

    const lawVaultContract = await ethers.getContractAt("LawVault", LawVaultDeployment.address);

    const contentValue = parseInt(taskArguments.content);
    if (!Number.isInteger(contentValue)) {
      throw new Error(`Argument --content is not an integer`);
    }

    // Encrypt the content value
    const encryptedContent = await fhevm
      .createEncryptedInput(LawVaultDeployment.address, lawyer.address)
      .add32(contentValue)
      .encrypt();

    const tx = await lawVaultContract
      .connect(lawyer)
      .createContract(
        taskArguments.title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    // Get the contract ID from events
    const events = receipt?.logs
      .map((log) => {
        try {
          return lawVaultContract.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    const contractCreatedEvent = events?.find((e) => e?.name === "ContractCreated");
    if (contractCreatedEvent) {
      const contractId = contractCreatedEvent.args[0];
      console.log(`Contract created with ID: ${contractId}`);
    }

    console.log(`LawVault createContract succeeded!`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:client-approve --contract-id 0
 *   - npx hardhat --network sepolia task:client-approve --contract-id 0
 */
task("task:client-approve", "Client approves a contract")
  .addOptionalParam("address", "Optionally specify the LawVault contract address")
  .addParam("contractId", "The contract ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const LawVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LawVault");
    console.log(`LawVault: ${LawVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    // Use signer[1] as client (signer[0] is lawyer)
    const client = signers[1];

    const lawVaultContract = await ethers.getContractAt("LawVault", LawVaultDeployment.address);

    const contractId = parseInt(taskArguments.contractId);
    const tx = await lawVaultContract.connect(client).clientApprove(contractId);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log(`LawVault clientApprove succeeded!`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:lawyer-confirm --contract-id 0
 *   - npx hardhat --network sepolia task:lawyer-confirm --contract-id 0
 */
task("task:lawyer-confirm", "Lawyer confirms final approval")
  .addOptionalParam("address", "Optionally specify the LawVault contract address")
  .addParam("contractId", "The contract ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const LawVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LawVault");
    console.log(`LawVault: ${LawVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const lawyer = signers[0];

    const lawVaultContract = await ethers.getContractAt("LawVault", LawVaultDeployment.address);

    const contractId = parseInt(taskArguments.contractId);
    const tx = await lawVaultContract.connect(lawyer).lawyerConfirm(contractId);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);

    console.log(`LawVault lawyerConfirm succeeded!`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-content --contract-id 0
 *   - npx hardhat --network sepolia task:decrypt-content --contract-id 0
 */
task("task:decrypt-content", "Decrypts the contract content")
  .addOptionalParam("address", "Optionally specify the LawVault contract address")
  .addParam("contractId", "The contract ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const LawVaultDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("LawVault");
    console.log(`LawVault: ${LawVaultDeployment.address}`);

    const signers = await ethers.getSigners();
    const user = signers[0]; // Can be lawyer or client

    const lawVaultContract = await ethers.getContractAt("LawVault", LawVaultDeployment.address);

    const contractId = parseInt(taskArguments.contractId);
    const encryptedContent = await lawVaultContract.getEncryptedContent(contractId);
    
    if (encryptedContent === ethers.ZeroHash) {
      console.log(`Encrypted content: ${encryptedContent}`);
      console.log("Clear content: 0 (uninitialized)");
      return;
    }

    const clearContent = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedContent,
      LawVaultDeployment.address,
      user,
    );
    console.log(`Encrypted content: ${encryptedContent}`);
    console.log(`Clear content: ${clearContent}`);
  });


