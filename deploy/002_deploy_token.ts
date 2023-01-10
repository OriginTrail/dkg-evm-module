import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, helpers, getNamedAccounts} = hre;
    const {execute} = deployments;

    const {deployer, minter} = await getNamedAccounts();

    await helpers.deploy({
        hre,
        newContractName: 'ERC20Token',
        newContractNameInHub: 'Token',
    });

    await execute(
        'ERC20Token',
        {from: deployer, log: true},
        'setupRole',
        minter,
    );
};

export default func;
func.tags = ['Token', 'ERC20Token'];
