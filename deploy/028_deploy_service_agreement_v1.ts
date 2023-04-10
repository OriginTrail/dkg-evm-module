import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const hasOldVersion = hre.helpers.inConfig('ServiceAgreementV1');

  let deprecatedServiceAgreementV1Address = '';
  if (hasOldVersion) {
    deprecatedServiceAgreementV1Address = hre.helpers.contractDeployments.contracts['ServiceAgreementV1'].evmAddress;
  }

  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementV1',
  });

  if (hasOldVersion) {
    hre.helpers.newContracts.push(['ServiceAgreementV1Deprecated', deprecatedServiceAgreementV1Address]);
  }
};

export default func;
func.tags = ['ServiceAgreementV1'];
func.dependencies = [
  'CommitManagerV1',
  'CommitManagerV1U1',
  'Hub',
  'ScoringProxy',
  'Log2PLDSF',
  'ParametersStorage',
  'ProofManagerV1',
  'ProofManagerV1U1',
  'ServiceAgreementStorageProxy',
  'HashingProxy',
  'SHA256',
  'Token',
];
