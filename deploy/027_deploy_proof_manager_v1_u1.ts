import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ProofManagerV1U1',
  });
};

export default func;
func.tags = ['ProofManagerV1U1'];
func.dependencies = [
  'AssertionStorage',
  'Hub',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageProxy',
  'SHA256',
  'Staking',
];
