import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ParanetKnowledgeAssetsRegistry',
  });
};

export default func;
func.tags = ['ParanetKnowledgeAssetsRegistry'];
func.dependencies = ['Hub'];
