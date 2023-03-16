import { task, types } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

type ConverterParameters = {
  evm: string;
  prefix: number;
};

task('ss58', 'Converts EVM address to SS58 (Substrate) address')
  .addParam<string>('evm', 'EVM address')
  .addOptionalParam<number>('prefix', 'SS58 address prefix from registry', 101, types.int)
  .setAction(async (taskArgs: ConverterParameters, hre: HardhatRuntimeEnvironment) => {
    const ss58Address = hre.helpers.convertEvmWallet(taskArgs.evm);

    console.log(`Substrate Address is ${ss58Address} for EVM address ${taskArgs.evm}.`);
  });
