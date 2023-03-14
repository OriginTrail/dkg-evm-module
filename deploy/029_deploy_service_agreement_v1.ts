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
  'SHA256',
  'Hub',
  'Log2PLDSF',
  'ParametersStorage',
  'ServiceAgreementStorageProxy',
  'ServiceAgreementHelperFunctions',
  'CommitManagerV1',
  'CommitManagerV1U1',
  'ProofManagerV1',
  'ProofManagerV1U1',
  'Token',
];
