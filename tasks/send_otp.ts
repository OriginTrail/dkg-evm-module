import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

type SenderParameters = {
  otp_address: string;
  amount: number;
};

task('send_otp', 'Sends OTP from account with tokens to the specified (Substrate) address')
  .addParam<string>('otpAddress', 'Substrate OTP address')
  .addParam<number>('amount', 'Amount of tokens to send')
  .setAction(async (taskArgs: SenderParameters, hre: HardhatRuntimeEnvironment) => {
    hre.helpers.sendOTP(taskArgs.otp_address, taskArgs.amount);
  });
