import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('StakingStorage');

  await hre.helpers.deploy({
    newContractName: 'StakingStorage',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const otpAddress = hre.helpers.contractDeployments.contracts['StakingStorage'].substrateAddress;
    await hre.helpers.sendOTP(otpAddress, 2);
  }
};

export default func;
func.tags = ['StakingStorage'];
func.dependencies = ['Hub'];
