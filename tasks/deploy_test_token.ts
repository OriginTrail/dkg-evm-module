import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

type TestTokenDeploymentParameters = {
  tokenName: string;
  tokenSymbol: string;
};

task('deploy_test_token', 'Deploy Test Trace Token')
  .addParam<string>('tokenName', 'Token Name')
  .addParam<string>('tokenSymbol', 'Token Symbol')
  .setAction(async (taskArgs: TestTokenDeploymentParameters, hre: HardhatRuntimeEnvironment) => {
    const { tokenName, tokenSymbol } = taskArgs;

    const TokenFactory = await hre.ethers.getContractFactory('Token');
    const Token = await TokenFactory.deploy(tokenName, tokenSymbol);

    await Token.deployed();

    console.log(
      `${tokenName} ($${tokenSymbol}) token has been deployed to: ${Token.address} on the ${hre.network.name} blockchain!`,
    );
  });
