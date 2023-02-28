import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementStorageProxy',
  });
};

export default func;
func.tags = ['ServiceAgreementStorageProxy'];
func.dependencies = ['Hub', 'Token', 'ServiceAgreementStorageV1', 'ServiceAgreementStorageV1U1'];
