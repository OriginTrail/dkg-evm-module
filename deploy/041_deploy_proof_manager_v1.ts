import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const ProofManagerV1 = await hre.helpers.deploy({
    newContractName: 'ProofManagerV1',
  });

  await hre.helpers.updateContractParameters('ProofManagerV1', ProofManagerV1);
};

export default func;
func.tags = ['ProofManagerV1', 'v1'];
func.dependencies = [
  'AssertionStorage',
  'Hub',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'HashingProxy',
  'SHA256',
  'Staking',
];
