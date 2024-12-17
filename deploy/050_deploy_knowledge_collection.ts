import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'KnowledgeCollection',
  });
};

export default func;
func.tags = ['KnowledgeCollection', 'v1', 'v2'];
func.dependencies = [
  'Hub',
  'KnowledgeCollectionStorage',
  'Chronos',
  'ShardingTableStorage',
  'Token',
  'ParametersStorage',
  'IdentityStorage',
  'ParanetKnowledgeAssetsRegistry',
  'ParanetKnowledgeMinersRegistry',
  'ParanetsRegistry',
];
