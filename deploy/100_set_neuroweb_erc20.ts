import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const neuroERC20Exists = hre.helpers.inConfig('NeurowebERC20');

  if (neuroERC20Exists) {
    const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
    const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);

    const tokenInHub = await Hub['isContract(string)']('NeurowebERC20');

    if (!tokenInHub) {
      hre.helpers.newContracts.push([
        'NeurowebERC20',
        hre.helpers.contractDeployments.contracts['NeurowebERC20'].evmAddress,
      ]);
    }
  }
};

export default func;
func.tags = ['Neuro', 'v1'];
func.dependencies = ['Hub'];
