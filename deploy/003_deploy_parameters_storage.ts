import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const ParametersStorage = await hre.helpers.deploy({
    newContractName: 'ParametersStorage',
  });

  if (['otp_alphanet', 'otp_devnet', 'otp_testnet'].includes(hre.network.name)) {
    const variablesMap = hre.helpers.contractDeployments.contracts['ParametersStorage'].variables;
    for (const variable in variablesMap) {
      const setParamTx = await ParametersStorage[`set${variable.charAt(0).toUpperCase() + variable.slice(1)}`](
        variablesMap[variable],
      );
      await setParamTx.wait();
      console.log(`[ParametersStorage] ${variable} parameter set to ${variablesMap[variable]}`);
    }
  }
};

export default func;
func.tags = ['ParametersStorage'];
func.dependencies = ['Hub'];
