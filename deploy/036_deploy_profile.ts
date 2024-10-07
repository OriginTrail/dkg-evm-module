import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('Profile') &&
    (hre.helpers.contractDeployments.contracts['Profile'].version === undefined ||
      hre.helpers.contractDeployments.contracts['Profile'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying Profile V1...');

  await hre.helpers.deploy({
    newContractName: 'Profile',
  });
};

export default func;
func.tags = ['Profile', 'v1'];
func.dependencies = [
  'Hub',
  'Identity',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'HashingProxy',
  'SHA256',
  'StakingV2',
  'WhitelistStorage',
  'NodeOperatorFeesStorage',
];
