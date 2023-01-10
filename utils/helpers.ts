import './type-extensions'
import { DeployResult } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

type DeploymentParameters = {
    hre: HardhatRuntimeEnvironment;
    newContractName: string;
    newContractNameInHub?: string;
    passHubInConstructor?: boolean;
    setContractInHub?: boolean;
    setAssetStorageInHub?: boolean;
}

export class Helpers {
    public async deploy({
        hre,
        newContractName,
        newContractNameInHub,
        passHubInConstructor = true,
        setContractInHub = true,
        setAssetStorageInHub = false,
    }: DeploymentParameters): Promise<DeployResult> {
        const {deployments, getNamedAccounts} = hre;
        const {deploy, execute} = deployments;

        const {deployer} = await getNamedAccounts();

        const hub = await deployments.get('Hub')

        const newContract = await deploy(
            newContractName,
            {from: deployer, args: passHubInConstructor? [hub.address]: [], log: true},
        )
        
        if (setContractInHub) {
            await execute(
                'Hub',
                {from: deployer, log: true},
                'setContractAddress',
                newContractNameInHub ? newContractNameInHub: newContractName,
                newContract.address,
            )
        } else if (setAssetStorageInHub) {
            await execute(
                'Hub',
                {from: deployer, log: true},
                'setAssetStorageAddress',
                newContractNameInHub ? newContractNameInHub: newContractName,
                newContract.address,
            )
        }

        return newContract;
    }
}
