import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ProfileStorage');

  await hre.helpers.deploy({
    newContractName: 'ProfileStorage',
  });

  if (!isDeployed && hre.network.name.startsWith('otp')) {
    const substrateAddress =
      hre.helpers.contractDeployments.contracts['ProfileStorage']
        .substrateAddress;
    await hre.helpers.sendOTP(substrateAddress, 2);
  }
};

export default func;
func.tags = ['ProfileStorage'];
func.dependencies = ['Hub', 'Token'];
