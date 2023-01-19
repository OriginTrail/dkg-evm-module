import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    hre,
    newContractName: 'ServiceAgreementV1',
  });
};

export default func;
func.tags = ['ServiceAgreementV1'];
func.dependencies = ['HashingProxy', 'Hub', 'ScoringProxy', 'ParametersStorage', 'ServiceAgreementStorageV1'];
