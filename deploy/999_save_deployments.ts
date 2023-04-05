import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name.startsWith('otp')) {
    hre.helpers.contractDeployments.deployedTimestamp = Date.now();
    hre.helpers.saveDeploymentsJson('deployments');
  }
};

export default func;
func.runAtTheEnd = true;
