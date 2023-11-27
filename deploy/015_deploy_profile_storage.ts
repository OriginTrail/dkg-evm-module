import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ProfileStorage');

  await hre.helpers.deploy({
    newContractName: 'ProfileStorage',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const substrateAddress = hre.helpers.contractDeployments.contracts['ProfileStorage'].substrateAddress;
    await hre.helpers.sendOTP(substrateAddress, 2);
  }
};

export default func;
func.tags = ['ProfileStorage', 'v1'];
func.dependencies = ['Hub', 'Token'];
