import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('StakingStorage');

  await hre.helpers.deploy({
    newContractName: 'StakingStorage',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const substrateAddress = hre.helpers.contractDeployments.contracts['StakingStorage'].substrateAddress;
    await hre.helpers.sendOTP(substrateAddress, 2);
  }
};

export default func;
func.tags = ['StakingStorage', 'v1'];
func.dependencies = ['Hub', 'Token'];
