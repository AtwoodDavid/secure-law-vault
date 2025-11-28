import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { LawVault, LawVault__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  lawyer: HardhatEthersSigner;
  client: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("LawVault")) as LawVault__factory;
  const lawVaultContract = (await factory.deploy()) as LawVault;
  const lawVaultContractAddress = await lawVaultContract.getAddress();

  return { lawVaultContract, lawVaultContractAddress };
}

describe("LawVault", function () {
  let signers: Signers;
  let lawVaultContract: LawVault;
  let lawVaultContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], lawyer: ethSigners[0], client: ethSigners[1] };
  });

  beforeEach(async function () {
    // Check whether the tests are running against an FHEVM mock environment
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ lawVaultContract, lawVaultContractAddress } = await deployFixture());
  });

  it("should create a contract with encrypted content", async function () {
    const title = "Test Contract";
    const clientAddress = signers.client.address;
    const contentValue = 12345;

    // Encrypt the content
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    const tx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    const receipt = await tx.wait();

    // Get contract ID from event
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
    expect(contractCreatedEvent).to.not.be.null;
    
    const contractId = contractCreatedEvent?.args[0];
    expect(contractId).to.not.be.undefined;

    // Verify contract details
    const contract = await lawVaultContract.getContract(contractId);
    expect(contract[0]).to.eq(title); // title
    expect(contract[1]).to.eq(signers.lawyer.address); // lawyer
    expect(contract[2]).to.eq(clientAddress); // client
    expect(contract[3]).to.eq(0); // status: PendingClientApproval
  });

  it("should allow client to approve", async function () {
    const title = "Test Contract";
    const clientAddress = signers.client.address;
    const contentValue = 12345;

    // Create contract
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    const createTx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    const createReceipt = await createTx.wait();

    const events = createReceipt?.logs
      .map((log) => {
        try {
          return lawVaultContract.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    const contractCreatedEvent = events?.find((e) => e?.name === "ContractCreated");
    const contractId = contractCreatedEvent?.args[0];

    // Client approves
    const approveTx = await lawVaultContract.connect(signers.client).clientApprove(contractId);
    await approveTx.wait();

    // Verify status changed
    const contract = await lawVaultContract.getContract(contractId);
    expect(contract[3]).to.eq(1); // status: PendingLawyerFinalConfirmation
    expect(contract[5]).to.not.eq(0); // clientApprovedAt should be set
  });

  it("should allow lawyer to confirm after client approval", async function () {
    const title = "Test Contract";
    const clientAddress = signers.client.address;
    const contentValue = 12345;

    // Create contract
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    const createTx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    const createReceipt = await createTx.wait();

    const events = createReceipt?.logs
      .map((log) => {
        try {
          return lawVaultContract.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    const contractCreatedEvent = events?.find((e) => e?.name === "ContractCreated");
    const contractId = contractCreatedEvent?.args[0];

    // Client approves
    await lawVaultContract.connect(signers.client).clientApprove(contractId);

    // Lawyer confirms
    const confirmTx = await lawVaultContract.connect(signers.lawyer).lawyerConfirm(contractId);
    await confirmTx.wait();

    // Verify status is Completed
    const contract = await lawVaultContract.getContract(contractId);
    expect(contract[3]).to.eq(2); // status: Completed
    expect(contract[6]).to.not.eq(0); // lawyerConfirmedAt should be set
  });

  it("should allow both parties to decrypt after completion", async function () {
    const title = "Test Contract";
    const clientAddress = signers.client.address;
    const contentValue = 12345;

    // Create contract
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    const createTx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    const createReceipt = await createTx.wait();

    const events = createReceipt?.logs
      .map((log) => {
        try {
          return lawVaultContract.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    const contractCreatedEvent = events?.find((e) => e?.name === "ContractCreated");
    const contractId = contractCreatedEvent?.args[0];

    // Client approves
    await lawVaultContract.connect(signers.client).clientApprove(contractId);

    // Lawyer confirms
    await lawVaultContract.connect(signers.lawyer).lawyerConfirm(contractId);

    // Get encrypted content
    const encryptedContentResult = await lawVaultContract.getEncryptedContent(contractId);

    // Decrypt as lawyer
    const clearContentLawyer = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedContentResult,
      lawVaultContractAddress,
      signers.lawyer,
    );
    expect(clearContentLawyer).to.eq(contentValue);

    // Decrypt as client
    const clearContentClient = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedContentResult,
      lawVaultContractAddress,
      signers.client,
    );
    expect(clearContentClient).to.eq(contentValue);
  });

  it("should not allow decryption before completion", async function () {
    const title = "Test Contract";
    const clientAddress = signers.client.address;
    const contentValue = 12345;

    // Create contract
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    const createTx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    const createReceipt = await createTx.wait();

    const events = createReceipt?.logs
      .map((log) => {
        try {
          return lawVaultContract.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    const contractCreatedEvent = events?.find((e) => e?.name === "ContractCreated");
    const contractId = contractCreatedEvent?.args[0];

    // Try to get encrypted content before completion (should fail)
    await expect(
      lawVaultContract.getEncryptedContent(contractId)
    ).to.be.revertedWith("Contract must be completed to access content");
  });

  it("should return client contracts list", async function () {
    const title = "Test Contract";
    const clientAddress = signers.client.address;
    const contentValue = 12345;

    // Create contract
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    const createTx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    const createReceipt = await createTx.wait();

    const events = createReceipt?.logs
      .map((log) => {
        try {
          return lawVaultContract.interface.parseLog(log as any);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);

    const contractCreatedEvent = events?.find((e) => e?.name === "ContractCreated");
    const contractId = contractCreatedEvent?.args[0];

    // Get client contracts
    const clientContracts = await lawVaultContract.getClientContracts(clientAddress);
    expect(clientContracts.length).to.eq(1);
    expect(clientContracts[0]).to.eq(contractId);
  });
});


