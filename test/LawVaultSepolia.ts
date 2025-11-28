import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { LawVault } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  lawyer: HardhatEthersSigner;
  client: HardhatEthersSigner;
};

describe("LawVaultSepolia", function () {
  let signers: Signers;
  let lawVaultContract: LawVault;
  let lawVaultContractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const LawVaultDeployment = await deployments.get("LawVault");
      lawVaultContractAddress = LawVaultDeployment.address;
      lawVaultContract = await ethers.getContractAt("LawVault", LawVaultDeployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { lawyer: ethSigners[0], client: ethSigners[1] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("should create, approve, confirm and decrypt a contract", async function () {
    steps = 15;

    this.timeout(4 * 40000);

    const title = "Test Contract Sepolia";
    const clientAddress = signers.client.address;
    const contentValue = 54321;

    progress("Encrypting contract content...");
    const encryptedContent = await fhevm
      .createEncryptedInput(lawVaultContractAddress, signers.lawyer.address)
      .add32(contentValue)
      .encrypt();

    progress(
      `Call createContract() LawVault=${lawVaultContractAddress} title=${title} client=${clientAddress}...`,
    );
    let tx = await lawVaultContract
      .connect(signers.lawyer)
      .createContract(
        title,
        clientAddress,
        encryptedContent.handles[0],
        encryptedContent.inputProof
      );
    await tx.wait();

    progress("Getting contract ID from events...");
    const receipt = await tx.wait();
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
    const contractId = contractCreatedEvent?.args[0];
    progress(`Contract created with ID: ${contractId}`);

    progress("Getting contract details...");
    const contract = await lawVaultContract.getContract(contractId);
    progress(`Contract status: ${contract[3]}`); // status

    progress("Client approving contract...");
    tx = await lawVaultContract.connect(signers.client).clientApprove(contractId);
    await tx.wait();
    progress("Client approved");

    progress("Getting updated contract details...");
    const contractAfterApproval = await lawVaultContract.getContract(contractId);
    progress(`Contract status after approval: ${contractAfterApproval[3]}`);

    progress("Lawyer confirming contract...");
    tx = await lawVaultContract.connect(signers.lawyer).lawyerConfirm(contractId);
    await tx.wait();
    progress("Lawyer confirmed");

    progress("Getting encrypted content...");
    const encryptedContentResult = await lawVaultContract.getEncryptedContent(contractId);
    progress(`Encrypted content: ${encryptedContentResult}`);

    progress("Decrypting as lawyer...");
    const clearContentLawyer = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedContentResult,
      lawVaultContractAddress,
      signers.lawyer,
    );
    progress(`Clear content (lawyer): ${clearContentLawyer}`);
    expect(clearContentLawyer).to.eq(contentValue);

    progress("Decrypting as client...");
    const clearContentClient = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedContentResult,
      lawVaultContractAddress,
      signers.client,
    );
    progress(`Clear content (client): ${clearContentClient}`);
    expect(clearContentClient).to.eq(contentValue);
  });
});


