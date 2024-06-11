import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('Token');

  if (isDeployed) {
    const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
    const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);

    const tokenInHub = await Hub['isContract(string)']('Token');

    if (!tokenInHub) {
      hre.helpers.newContracts.push(['Token', hre.helpers.contractDeployments.contracts['Token'].evmAddress]);
    }
  } else if (!isDeployed && hre.network.config.environment === 'development') {
    const Token = await hre.helpers.deploy({
      newContractName: 'Token',
      passHubInConstructor: false,
      additionalArgs: ['TEST TOKEN', 'TEST'],
    });

    const minterRole = await Token.MINTER_ROLE();
    if (!(await Token.hasRole(minterRole, deployer))) {
      console.log(`Setting minter role for ${deployer}.`);
      const setupMinterRoleTx = await Token.setupRole(deployer, { from: deployer });
      await setupMinterRoleTx.wait();
    }

    const amountToMint = hre.ethers.utils.parseEther(`${10_000_000}`);
    const accounts = await hre.ethers.getSigners();

    for (const acc of accounts) {
      const mintTx = await Token.mint(acc.address, amountToMint, { from: deployer, gasLimit: 80_000 });
      await mintTx.wait();
    }
  } else {
    throw new Error('Missing Token address in the JSON config!');
  }
};

export default func;
func.tags = ['Token', 'v1'];
func.dependencies = ['Hub'];
