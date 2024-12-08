import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const block = await hre.ethers.provider.getBlock('latest');

  await hre.helpers.deploy({
    newContractName: 'Chronos',
    passHubInConstructor: false,
    additionalArgs: [block!.timestamp, 1 * 30 * 24 * 60 * 60], // TODO: Update
  });
};

export default func;
func.tags = ['Chronos'];
func.dependencies = ['Hub'];
