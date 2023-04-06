import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const ParametersStorage = await hre.helpers.deploy({
    newContractName: 'ParametersStorage',
  });

  if (['otp_alphanet', 'otp_devnet', 'otp_testnet'].includes(hre.network.name)) {
    const variablesMap = hre.helpers.contractDeployments.contracts['ParametersStorage'].variables;

    const { deployer } = await hre.getNamedAccounts();

    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    const ParametersStorageAbi = hre.helpers.getAbi('ParametersStorage');
    const ParametersStorageInterface = new hre.ethers.utils.Interface(ParametersStorageAbi);

    for (const variable in variablesMap) {
      const setParamTx = await HubController.forwardCall(
        ParametersStorage.address,
        ParametersStorageInterface.encodeFunctionData(`set${variable.charAt(0).toUpperCase() + variable.slice(1)}`, [
          variablesMap[variable],
        ]),
      );
      await setParamTx.wait();
      console.log(`[ParametersStorage] '${variable}' parameter set to ${variablesMap[variable]}`);
    }
  }
};

export default func;
func.tags = ['ParametersStorage'];
func.dependencies = ['Hub'];
