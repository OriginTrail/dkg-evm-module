import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.config.environment !== 'development') {
    if (Object.keys(hre.helpers.contractDeployments.contracts).includes('OldShardingTable')) {
      delete hre.helpers.contractDeployments.contracts['OldShardingTable'];
    }

    hre.helpers.saveDeploymentsJson('deployments');
  }
};

export default func;
func.tags = ['v1', 'v2'];
func.runAtTheEnd = true;
