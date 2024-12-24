import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // TODO: Remove when paranets V2 are finished
  return;

  await hre.helpers.deploy({
    newContractName: 'Paranet',
  });
};

export default func;
func.tags = ['Paranet'];
func.dependencies = [
  'Hub',
  'ParanetKnowledgeAssetsRegistry',
  'ParanetKnowledgeMinersRegistry',
  'ParanetsRegistry',
  'ParanetServicesRegistry',
  'ProfileStorage',
  'IdentityStorage',
];
