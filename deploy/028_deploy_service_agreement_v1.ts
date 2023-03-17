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
  'CommitManagerV1',
  'CommitManagerV1U1',
  'Hub',
  'Log2PLDSF',
  'ParametersStorage',
  'ProofManagerV1',
  'ProofManagerV1U1',
  'ServiceAgreementStorageProxy',
  'SHA256',
  'Token',
];
