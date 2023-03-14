import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ProofManagerV1',
  });
};

export default func;
func.tags = ['ProofManagerV1'];
func.dependencies = [
  'HashingProxy',
  'Hub',
  'Staking',
  'AssertionStorage',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'ServiceAgreementHelperFunctions',
];
