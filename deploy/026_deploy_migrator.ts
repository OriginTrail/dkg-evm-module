import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const oldHubAddress =
    hre.helpers.contractDeployments.contracts['OldHub']?.evmAddress;

  if (hre.network.config.environment === 'development' || !oldHubAddress) {
    return;
  }

  const migrator = await hre.helpers.deploy({
    newContractName: 'Migrator',
    additionalArgs: [oldHubAddress],
  });

  hre.helpers.setParametersEncodedData.push({
    contractName: 'Migrator',
    encodedData: [
      migrator.interface.encodeFunctionData('initializeOldContracts', []),
      migrator.interface.encodeFunctionData('initializeNewContracts', []),
    ],
  });
};

export default func;
func.tags = ['Migrator'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ProfileStorage',
  'StakingStorage',
  'Ask',
];
