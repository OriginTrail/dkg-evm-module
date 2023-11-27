import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('ParametersStorage');

  await hre.helpers.deploy({
    newContractName: 'ParametersStorage',
  });

  if (!isDeployed && ['otp_alphanet', 'otp_devnet', 'otp_testnet'].includes(hre.network.name)) {
    const variables = hre.helpers.contractDeployments.contracts['ParametersStorage'].variables ?? {};

    const ParametersStorageAbi = hre.helpers.getAbi('ParametersStorage');
    const ParametersStorageInterface = new hre.ethers.utils.Interface(ParametersStorageAbi);

    hre.helpers.setParametersEncodedData = [['ParametersStorage', []]];

    for (const variableName in variables) {
      hre.helpers.setParametersEncodedData[0][1].push(
        ParametersStorageInterface.encodeFunctionData(
          `set${variableName.charAt(0).toUpperCase() + variableName.slice(1)}`,
          [variables[variableName]],
        ),
      );
    }
  }
};

export default func;
func.tags = ['ParametersStorage', 'v1'];
func.dependencies = ['Hub'];
