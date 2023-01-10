import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, helpers, getNamedAccounts} = hre;
    const {execute} = deployments;

    const {deployer} = await getNamedAccounts();

    const log2pldsfContract = await helpers.deploy({
        hre,
        newContractName: 'Log2PLDSF',
        setContractInHub: false,
    });

    await execute(
        'ScoringProxy',
        {from: deployer, log: true},
        'setContractAddress',
        1,
        log2pldsfContract.address,
    );
};

export default func;
func.tags = ['Log2PLDSF'];
