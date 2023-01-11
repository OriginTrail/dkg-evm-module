import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, minter } = await hre.getNamedAccounts();

  await hre.helpers.deploy({
    hre,
    newContractName: 'ERC20Token',
    newContractNameInHub: 'Token',
  });

  await hre.deployments.execute('ERC20Token', { from: deployer, log: true }, 'setupRole', minter);
};

export default func;
func.tags = ['Token', 'ERC20Token'];
func.dependencies = ['Hub'];
