import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  if (hre.helpers.isDeployed('Hub') && hre.network.name !== 'hardhat') {
    return;
  }

  const Hub = await hre.deployments.deploy('Hub', { from: deployer, log: true });

  hre.helpers.updateDeploymentsJson('Hub', Hub.address);
};

export default func;
func.tags = ['Hub'];
