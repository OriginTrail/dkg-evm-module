import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('Profile') &&
    (hre.helpers.contractDeployments.contracts['Profile'].version === undefined ||
      hre.helpers.contractDeployments.contracts['Profile'].version?.startsWith('1.'))
  ) {
    return;
  }

  console.log('Deploying Profile V2...');

  await hre.helpers.deploy({
    newContractName: 'ProfileV2',
    newContractNameInHub: 'Profile',
  });
};

export default func;
func.tags = ['ProfileV2', 'v2'];
func.dependencies = [
  'Hub',
  'Identity',
  'IdentityStorageV2',
  'ParametersStorage',
  'ProfileStorage',
  'HashingProxy',
  'SHA256',
  'ShardingTableV2',
  'Staking',
  'WhitelistStorage',
  'NodeOperatorFeesStorage',
];
