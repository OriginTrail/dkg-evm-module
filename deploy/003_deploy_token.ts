import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('Token');

  const Token = await hre.helpers.deploy({
    newContractName: 'Token',
    passHubInConstructor: false,
    additionalArgs: ['TEST TOKEN', 'TEST'],
  });

  if (!isDeployed) {
    const setupRoleTx = await Token.setupRole(deployer, { from: deployer });
    await setupRoleTx.wait();
  }
  if (hre.network.name === 'hardhat') {
    const amountToMint = hre.ethers.utils.parseEther(`${5_000_000}`);
    const accounts = await hre.ethers.getSigners();

    for (const acc of accounts) {
      const mintTx = await Token.mint(acc.address, amountToMint, { from: deployer, gasLimit: 80_000 });
      await mintTx.wait();
    }
  }
};

export default func;
func.tags = ['Token', 'v1'];
func.dependencies = ['Hub'];
