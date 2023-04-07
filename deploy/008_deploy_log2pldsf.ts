import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('Log2PLDSF');

  const Log2PLDSF = await hre.helpers.deploy({
    newContractName: 'Log2PLDSF',
    dependencies: func.dependencies,
  });

  if (!isDeployed) {
    hre.helpers.newScoreFunctions.push(Log2PLDSF.address);
  }
};

export default func;
func.tags = ['Log2PLDSF'];
func.dependencies = ['Hub', 'HashingProxy', 'SHA256', 'ScoringProxy', 'ParametersStorage'];
