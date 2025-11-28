const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying LawVault contract...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  const LawVault = await ethers.getContractFactory("LawVault");
  console.log("Deploying contract...");
  const lawVault = await LawVault.deploy();
  
  console.log("Waiting for deployment...");
  await lawVault.waitForDeployment();
  
  const address = await lawVault.getAddress();
  
  console.log("\n✅ LawVault deployed to:", address);
  console.log("\n📋 Copy this to your frontend .env file:");
  console.log(`VITE_LOCAL_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


