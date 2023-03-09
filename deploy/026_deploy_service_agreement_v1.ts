import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementV1',
  });
};

export default func;
func.tags = ['ServiceAgreementV1'];
func.dependencies = [
  'HashingProxy',
  'SHA256',
  'Hub',
  'ScoringProxy',
  'Log2PLDSF',
  'ParametersStorage',
  'ServiceAgreementStorageProxy',
  'CommitManagerV1',
  'ProofManagerV1',
];
