import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const serviceAgreementStorageV1 = await hre.helpers.deploy({
    newContractName: 'ServiceAgreementStorageV1',
  });

  if (hre.network.name.startsWith('otp')) {
    const otpAddress = hre.helpers.convertEvmWallet(serviceAgreementStorageV1.address);
    hre.helpers.sendOTP(otpAddress, 2);
  }
};

export default func;
func.tags = ['ServiceAgreementStorageV1'];
func.dependencies = ['Hub'];
