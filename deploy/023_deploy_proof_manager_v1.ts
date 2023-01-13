import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    hre,
    newContractName: 'ProofManagerV1',
  });
};

export default func;
func.tags = ['ProofManagerV1'];
func.dependencies = [
  'Hub',
  'ServiceAgreementV1',
  'Staking',
  'AssertionStorage',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'ServiceAgreementStorageV1',
];
