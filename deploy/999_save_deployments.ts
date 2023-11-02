import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const networkPrefixes = ['otp', 'gno'];

  if (networkPrefixes.some((networkPrefix) => hre.network.name.startsWith(networkPrefix))) {
    hre.helpers.saveDeploymentsJson('deployments');
  }
};

export default func;
func.runAtTheEnd = true;
