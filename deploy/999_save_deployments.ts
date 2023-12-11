import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.config.environment !== 'development') {
    hre.helpers.saveDeploymentsJson('deployments');
  }
};

export default func;
func.tags = ['v1', 'v2'];
func.runAtTheEnd = true;
