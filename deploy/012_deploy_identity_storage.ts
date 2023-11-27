import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    hre.helpers.isDeployed('IdentityStorage') &&
    (hre.helpers.contractDeployments.contracts['IdentityStorage'].version === undefined ||
      hre.helpers.contractDeployments.contracts['IdentityStorage'].version?.startsWith('2.'))
  ) {
    return;
  }

  console.log('Deploying IdentityStorage V1...');

  await hre.helpers.deploy({
    newContractName: 'IdentityStorage',
  });
};

export default func;
func.tags = ['IdentityStorage', 'v1'];
func.dependencies = ['Hub'];
