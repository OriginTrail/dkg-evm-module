import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

type EncoderParameters = {
  signature: string;
};

task('encode_selector', 'Calculates EVM function/error selector (sighash)')
  .addParam<string>('signature')
  .setAction(async (taskArgs: EncoderParameters, hre: HardhatRuntimeEnvironment) => {
    const sighash = hre.ethers.utils.hexDataSlice(
      hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(taskArgs.signature)),
      0,
      4,
    );

    console.log(`Selector (sighash) for ${taskArgs.signature}: ${sighash}`);
  });
