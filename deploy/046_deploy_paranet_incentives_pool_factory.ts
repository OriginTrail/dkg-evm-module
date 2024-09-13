import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name.startsWith('gnosis')) {
    return;
  }

  await hre.helpers.deploy({
    newContractName: 'ParanetIncentivesPoolFactory',
  });
};

export default func;
func.tags = ['ParanetIncentivesPoolFactory', 'v2'];
func.dependencies = ['HubV2', 'ParanetsRegistry'];
