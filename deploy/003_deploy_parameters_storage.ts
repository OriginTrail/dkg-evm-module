import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('Token');

  await hre.helpers.deploy({
    newContractName: 'ParametersStorage',
  });

  if (!isDeployed && ['otp_alphanet', 'otp_devnet', 'otp_testnet'].includes(hre.network.name)) {
    const variables = hre.helpers.contractDeployments.contracts['ParametersStorage'].variables;

    const ParametersStorageAbi = hre.helpers.getAbi('ParametersStorage');
    const ParametersStorageInterface = new hre.ethers.utils.Interface(ParametersStorageAbi);

    for (const variable in variables) {
      hre.helpers.setParametersEncodedData.push(
        ParametersStorageInterface.encodeFunctionData(`set${variable.charAt(0).toUpperCase() + variable.slice(1)}`, [
          variable,
        ]),
      );
    }
  }
};

export default func;
func.tags = ['ParametersStorage'];
func.dependencies = ['Hub'];
