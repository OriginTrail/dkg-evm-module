import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  if (hre.helpers.isDeployed('Hub')) {
    return;
  }

  const Hub = await hre.deployments.deploy('Hub', { from: deployer, log: true });

  hre.helpers.contractDeployments.contracts['Hub'] = {
    evmAddress: Hub.address,
    substrateAddress: hre.helpers.convertEvmWallet(Hub.address),
    deployed: true,
  };
};

export default func;
func.tags = ['Hub'];
