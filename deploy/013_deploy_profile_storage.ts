import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ProfileStorage');

  await hre.helpers.deploy({
    newContractName: 'ProfileStorage',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const otpAddress = hre.helpers.contractDeployments.contracts['ProfileStorage'].substrateAddress;
    hre.helpers.sendOTP(otpAddress, 2);
  }
};

export default func;
func.tags = ['ProfileStorage'];
func.dependencies = ['Hub'];
