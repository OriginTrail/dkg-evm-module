import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ServiceAgreementStorageV1');

  await hre.helpers.deploy({
    newContractName: 'ServiceAgreementStorageV1',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const substrateAddress = hre.helpers.contractDeployments.contracts['ServiceAgreementStorageV1'].substrateAddress;
    await hre.helpers.sendOTP(substrateAddress, 2);
  }
};

export default func;
func.tags = ['ServiceAgreementStorageV1', 'v1'];
func.dependencies = ['Hub', 'Token'];
