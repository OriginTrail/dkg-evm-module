import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementV1',
  });
};

export default func;
func.tags = ['ServiceAgreementV1', 'v1'];
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
