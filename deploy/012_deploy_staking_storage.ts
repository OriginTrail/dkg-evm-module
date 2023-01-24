import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const stakingStorage = await hre.helpers.deploy({
    newContractName: 'StakingStorage',
  });

  if (hre.network.name.startsWith('otp')) {
    const otpAddress = hre.helpers.convertEvmWallet(stakingStorage.address);
    hre.helpers.sendOTP(otpAddress, 2);
  }
};

export default func;
func.tags = ['StakingStorage'];
func.dependencies = ['Hub'];
