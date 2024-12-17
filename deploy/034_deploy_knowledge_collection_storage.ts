import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'KnowledgeCollectionStorage',
    setContractInHub: false,
    setAssetStorageInHub: true,
  });
};

export default func;
func.tags = ['KnowledgeCollectionStorage', 'v1', 'v2'];
func.dependencies = [];
