import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await hre.helpers.deploy({
    newContractName: 'Profile',
  });
};

export default func;
func.tags = ['Profile'];
func.dependencies = [
  'Hub',
  'Identity',
  'IdentityStorage',
  'ParametersStorage',
  'ProfileStorage',
  'SHA256',
  'Staking',
  'WhitelistStorage',
];
