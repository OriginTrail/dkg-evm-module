import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { minter } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('Token');

  const Token = await hre.helpers.deploy({
    newContractName: 'Token',
  });

  if (!isDeployed) {
    const setupRoleTx = await Token.setupRole(minter);
    await setupRoleTx.wait();
  }
};

export default func;
func.tags = ['Token'];
func.dependencies = ['Hub'];
