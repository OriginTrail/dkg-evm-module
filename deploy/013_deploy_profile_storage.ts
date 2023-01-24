import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const profileStorage = await hre.helpers.deploy({
    newContractName: 'ProfileStorage',
  });

  if (hre.network.name.startsWith('otp')) {
    const otpAddress = hre.helpers.convertEvmWallet(profileStorage.address);
    hre.helpers.sendOTP(otpAddress, 2);
  }
};

export default func;
func.tags = ['ProfileStorage'];
func.dependencies = ['Hub'];
