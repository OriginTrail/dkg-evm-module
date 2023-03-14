import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('Log2PLDSF');

  const Log2PLDSF = await hre.helpers.deploy({
    newContractName: 'Log2PLDSF',
    setContractInHub: false,
  });

  if (!isDeployed) {
    const Hub = await hre.ethers.getContractAt(
      'Hub',
      hre.helpers.contractDeployments.contracts['Hub'].evmAddress,
      deployer,
    );

    const scoringProxyAddress = await Hub.getContractAddress('ScoringProxy');
    const ScoringProxy = await hre.ethers.getContractAt('ScoringProxy', scoringProxyAddress, deployer);
    const setContractTx = await ScoringProxy.setContractAddress(1, Log2PLDSF.address);
    await setContractTx.wait();
  }
};

export default func;
func.tags = ['Log2PLDSF'];
func.dependencies = ['Hub', 'HashingProxy', 'ScoringProxy', 'ParametersStorage'];
