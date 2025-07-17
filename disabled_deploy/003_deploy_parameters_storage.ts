import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

type ParametersStorageConfig = {
  v81ReleaseEpoch: string;
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const parametersStorageParametersConfig = hre.helpers.parametersConfig[
    hre.network.config.environment
  ].ParametersStorage as unknown as ParametersStorageConfig;

  // if (!parametersStorageParametersConfig?.v81ReleaseEpoch) {
  //   throw new Error(
  //     `v81ReleaseEpoch not found in parameters config for network: ${hre.network.name}`,
  //   );
  // }

  const ParametersStorage = await hre.helpers.deploy({
    newContractName: 'ParametersStorage',
    // additionalArgs: [parametersStorageParametersConfig.v81ReleaseEpoch],
  });

  await hre.helpers.updateContractParameters(
    'ParametersStorage',
    ParametersStorage,
  );
};

export default func;
func.tags = ['ParametersStorage'];
func.dependencies = ['Hub'];
