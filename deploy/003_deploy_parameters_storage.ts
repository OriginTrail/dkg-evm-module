import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {helpers} = hre;

    await helpers.deploy({
        hre,
        newContractName: 'ParametersStorage',
    });
};

export default func;
func.tags = ['ParametersStorage'];
