import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const log2pldsfContract = await hre.helpers.deploy({
    hre,
    newContractName: 'Log2PLDSF',
    setContractInHub: false,
  });

  await hre.deployments.execute(
    'ScoringProxy',
    { from: deployer, log: true },
    'setContractAddress',
    1,
    log2pldsfContract.address,
  );
};

export default func;
func.tags = ['Log2PLDSF'];
func.dependencies = ['Hub', 'ScoringProxy', 'ParametersStorage'];
