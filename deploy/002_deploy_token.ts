import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, minter } = await hre.getNamedAccounts();

  await hre.helpers.deploy({
    hre,
    newContractName: 'Token',
  });

  await hre.deployments.execute('Token', { from: deployer, log: true }, 'setupRole', minter);
};

export default func;
func.tags = ['Token'];
func.dependencies = ['Hub'];
