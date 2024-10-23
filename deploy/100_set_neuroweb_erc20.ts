import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const neuroERC20Exists = hre.helpers.inConfig('NeurowebERC20');

  if (neuroERC20Exists) {
    const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
    const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);

    const tokenInHub = await Hub['isContract(string)']('NeurowebERC20');

    if (!tokenInHub && hre.network.config.environment !== 'development') {
      hre.helpers.newContracts.push([
        'NeurowebERC20',
        hre.helpers.contractDeployments.contracts['NeurowebERC20'].evmAddress,
      ]);
    }
  } else if (hre.network.config.environment === 'development') {
    const Token = await hre.helpers.deploy({
      newContractName: 'Token',
      newContractNameInHub: 'NeurowebERC20',
      passHubInConstructor: false,
      additionalArgs: ['NEURO TEST TOKEN', 'NEURO'],
    });

    const minterRole = await Token.MINTER_ROLE();
    if (!(await Token.hasRole(minterRole, deployer))) {
      console.log(`Setting ERC20 Neuro minter role for ${deployer}.`);
      const setupMinterRoleTx = await Token.setupRole(deployer, { from: deployer });
      await setupMinterRoleTx.wait();
    }

    const amountToMint = hre.ethers.utils.parseEther(`${10_000_000}`);
    const accounts = await hre.ethers.getSigners();

    for (const acc of accounts) {
      const mintTx = await Token.mint(acc.address, amountToMint, { from: deployer, gasLimit: 80_000 });
      await mintTx.wait();
    }
  }
};

export default func;
func.tags = ['Neuro', 'v1'];
func.dependencies = ['Hub'];
