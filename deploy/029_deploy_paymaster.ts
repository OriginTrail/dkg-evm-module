import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'Paymaster',
  });
};

export default func;
func.tags = ['Paymaster'];
func.dependencies = [
  'Hub',
];
