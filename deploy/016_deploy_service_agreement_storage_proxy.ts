import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hasOldVersion = hre.helpers.inConfig('ServiceAgreementStorageProxy');

  let deprecatedServiceAgreementStorageProxyAddress = '';
  if (hasOldVersion) {
    deprecatedServiceAgreementStorageProxyAddress =
      hre.helpers.contractDeployments.contracts['ServiceAgreementStorageProxy'].evmAddress;
  }

  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementStorageProxy',
  });

  if (hasOldVersion) {
    hre.helpers.newContracts.push([
      'ServiceAgreementStorageProxyDeprecated',
      deprecatedServiceAgreementStorageProxyAddress,
    ]);
  }
};

export default func;
func.tags = ['ServiceAgreementStorageProxy'];
func.dependencies = ['Hub', 'ServiceAgreementStorageV1', 'ServiceAgreementStorageV1U1'];
