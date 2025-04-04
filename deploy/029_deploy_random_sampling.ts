import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const address = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;

  await hre.helpers.deploy({
    newContractName: 'RandomSamplingStorage',
    passHubInConstructor: false,
    additionalArgs: [address],
  });
};

export default func;
func.tags = ['RandomSamplingStorage'];
func.dependencies = ['Hub'];
