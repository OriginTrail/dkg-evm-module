import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hasOldVersion = hre.helpers.inConfig('Assertion');

  let deprecatedAssertionAddress = '';
  if (hasOldVersion) {
    deprecatedAssertionAddress = hre.helpers.contractDeployments.contracts['Assertion'].evmAddress;
  }

  await hre.helpers.deploy({
    newContractName: 'Assertion',
  });

  if (hasOldVersion) {
    hre.helpers.newContracts.push(['AssertionDeprecated', deprecatedAssertionAddress]);
  }
};

export default func;
func.tags = ['Assertion'];
func.dependencies = ['Hub', 'AssertionStorage'];
