import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('Deploying IdentityStorage V2...');

  await hre.helpers.deploy({
    newContractName: 'IdentityStorageV2',
    newContractNameInHub: 'IdentityStorage',
  });
};

export default func;
func.tags = ['IdentityStorageV2', 'v2'];
func.dependencies = ['HubV2'];
