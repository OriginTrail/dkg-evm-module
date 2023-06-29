import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, minter } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('Token');

  const Token = await hre.helpers.deploy({
    newContractName: 'Token',
  });

  if (!isDeployed) {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    const TokenAbi = hre.helpers.getAbi('Token');
    const TokenInterface = new hre.ethers.utils.Interface(TokenAbi);

    const setupRoleTx = await HubController.forwardCall(
      Token.address,
      TokenInterface.encodeFunctionData('setupRole', [minter]),
    );
    await setupRoleTx.wait();
  }
  if (hre.network.name === 'hardhat' || hre.network.name == 'bellecour_testnet') {
    const amountToMint = hre.ethers.utils.parseEther(`${5_000_000}`);
    const signersAccounts = await hre.ethers.getSigners();
    const accounts = [signersAccounts[0].address];

    for (const acc of accounts) {
      const mintTx = await Token.mint(acc, amountToMint, { from: minter, gasLimit: 80_000 });
      await mintTx.wait();
    }
  }
};

export default func;
func.tags = ['Token'];
func.dependencies = ['Hub'];
