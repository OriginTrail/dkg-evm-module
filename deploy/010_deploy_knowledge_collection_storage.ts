import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'KnowledgeCollectionStorage',
    additionalArgs: [1000, 'did:dkg'], // TODO: Update
  });
};

export default func;
func.tags = ['KnowledgeCollectionStorage'];
func.dependencies = ['Hub'];
