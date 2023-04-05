import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const HubController = await hre.helpers.deploy({
    newContractName: 'HubController',
    setContractInHub: false,
    dependencies: func.dependencies,
  });

  if (!['otp_testnet', 'otp_mainnet'].includes(hre.network.name)) {
    const hubAddress = hre.helpers.contractDeployments.contracts['Hub'].evmAddress;
    const Hub = await hre.ethers.getContractAt('Hub', hubAddress, deployer);
    const hubOwner = await Hub.owner();

    if (hubOwner != HubController.address) {
      const transferOwneshipTx = await Hub.transferOwnership(HubController.address);
      await transferOwneshipTx.wait();
    }
  }
};

export default func;
func.tags = ['HubController'];
func.dependencies = ['Hub'];
