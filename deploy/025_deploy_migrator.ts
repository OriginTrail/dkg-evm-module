import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const oldHubAddress =
    hre.helpers.contractDeployments.contracts['OldHub'].evmAddress;

  if (hre.network.config.environment === 'development' || !oldHubAddress) {
    return;
  }

  delete hre.helpers.contractDeployments.contracts['OldHub'];

  await hre.helpers.deploy({
    newContractName: 'Migrator',
    additionalArgs: [oldHubAddress],
  });
};

export default func;
func.tags = ['Migrator'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ProfileStorage',
  'StakingStorage',
];
