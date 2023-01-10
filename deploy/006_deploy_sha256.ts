import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, helpers, getNamedAccounts} = hre;
    const {execute} = deployments;

    const {deployer} = await getNamedAccounts();

    const sha256Contract = await helpers.deploy({
        hre,
        newContractName: 'SHA256',
        passHubInConstructor: false,
        setContractInHub: false,
    });

    await execute(
        'HashingProxy',
        {from: deployer, log: true},
        'setContractAddress',
        1,
        sha256Contract.address,
    );
};

export default func;
func.tags = ['SHA256'];
