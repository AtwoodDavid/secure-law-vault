import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedLawVault = await deploy("LawVault", {
    from: deployer,
    log: true,
  });

  console.log(`LawVault contract: `, deployedLawVault.address);
};
export default func;
func.id = "deploy_lawVault"; // id required to prevent reexecution
func.tags = ["LawVault"];


