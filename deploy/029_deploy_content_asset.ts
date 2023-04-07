import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const isDeployed = hre.helpers.isDeployed('ContentAsset');
  const oldContentAssetAddress = hre.helpers.contractDeployments.contracts['ContentAsset'].evmAddress;

  const ContentAsset = await hre.helpers.deploy({
    newContractName: 'ContentAsset',
  });

  if (isDeployed) {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    let setContractAddressTx = await HubController.setContractAddress('ContentAsset', ContentAsset.address);
    await setContractAddressTx.wait();

    setContractAddressTx = await HubController.setContractAddress('ContentAssetV1Deprecated', oldContentAssetAddress);
    await setContractAddressTx.wait();

    hre.helpers.contractsForReinitialization.push(oldContentAssetAddress);
  }
};

export default func;
func.tags = ['ContentAsset'];
func.dependencies = [
  'Assertion',
  'ContentAssetStorage',
  'Hub',
  'ServiceAgreementV1',
  'HashingProxy',
  'SHA256',
  'UnfinalizedStateStorage',
];
