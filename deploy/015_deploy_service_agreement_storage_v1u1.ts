import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ServiceAgreementStorageV1U1');

  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementStorageV1U1',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const otpAddress = hre.helpers.contractDeployments.contracts['ServiceAgreementStorageV1U1'].otpAddress;
    await hre.helpers.sendOTP(otpAddress, 2);
  }
};

export default func;
func.tags = ['ServiceAgreementStorageV1U1'];
func.dependencies = ['Hub', 'Token'];
