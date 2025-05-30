import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'ParanetKnowledgeMinersRegistry',
  });
};

export default func;
func.tags = ['ParanetKnowledgeMinersRegistry'];
func.dependencies = ['Hub', 'ParanetsRegistry'];
