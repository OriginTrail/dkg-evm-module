import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const ProofManagerV1U1 = await hre.helpers.deploy({
    newContractName: 'ProofManagerV1U1',
  });

  await hre.helpers.updateContractParameters('ProofManagerV1U1', ProofManagerV1U1);
};

export default func;
func.tags = ['ProofManagerV1U1', 'v1'];
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
