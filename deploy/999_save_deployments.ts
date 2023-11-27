import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkPrefixes = ['otp', 'gnosis'];

  if (networkPrefixes.some((networkPrefix) => hre.network.name.startsWith(networkPrefix))) {
    hre.helpers.saveDeploymentsJson('deployments');
  }
};

export default func;
func.tags = ['v1', 'v2'];
func.runAtTheEnd = true;
