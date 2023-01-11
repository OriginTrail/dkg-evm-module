import { DeployResult } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

type DeploymentParameters = {
  hre: HardhatRuntimeEnvironment;
  newContractName: string;
  newContractNameInHub?: string;
  passHubInConstructor?: boolean;
  setContractInHub?: boolean;
  setAssetStorageInHub?: boolean;
};

export class Helpers {
  public async deploy({
    hre,
    newContractName,
    newContractNameInHub,
    passHubInConstructor = true,
    setContractInHub = true,
    setAssetStorageInHub = false,
  }: DeploymentParameters): Promise<DeployResult> {
    const { deployer } = await hre.getNamedAccounts();

    const hub = await hre.deployments.get('Hub');

    const newContract = await hre.deployments.deploy(newContractName, {
      from: deployer,
      args: passHubInConstructor ? [hub.address] : [],
      log: true,
    });

    if (setContractInHub) {
      await hre.deployments.execute(
        'Hub',
        { from: deployer, log: true },
        'setContractAddress',
        newContractNameInHub ? newContractNameInHub : newContractName,
        newContract.address,
      );
    } else if (setAssetStorageInHub) {
      await hre.deployments.execute(
        'Hub',
        { from: deployer, log: true },
        'setAssetStorageAddress',
        newContractNameInHub ? newContractNameInHub : newContractName,
        newContract.address,
      );
    }

    return newContract;
  }
}
