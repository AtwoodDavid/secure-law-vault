import { ethers } from "hardhat";

async function main() {
  console.log("Deploying LawVault contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const LawVault = await ethers.getContractFactory("LawVault");
  const lawVault = await LawVault.deploy();

  await lawVault.waitForDeployment();

  const address = await lawVault.getAddress();
  console.log("LawVault deployed to:", address);
  console.log("\nCopy this address to your frontend .env file:");
  console.log(`VITE_LOCAL_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


