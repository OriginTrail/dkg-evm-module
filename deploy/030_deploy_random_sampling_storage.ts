import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const randomSamplingStorageParametersConfig =
    hre.helpers.parametersConfig[hre.network.config.environment]
      .RandomSamplingStorage;

  await hre.helpers.deploy({
    newContractName: 'RandomSamplingStorage',
    additionalArgs: [
      randomSamplingStorageParametersConfig.proofingPeriodDurationInBlocks,
    ],
  });
};

export default func;
func.tags = ['RandomSamplingStorage'];
func.dependencies = ['Hub', 'Chronos'];
