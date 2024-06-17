import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ParanetKnowledgeAssetsRegistry',
  });
};

export default func;
func.tags = ['ParanetKnowledgeAssetsRegistry', 'v2'];
func.dependencies = ['HubV2'];
