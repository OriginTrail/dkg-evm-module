import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { PaymasterManager } from '../../typechain';

export async function createPaymaster(
  paymasterCreator: SignerWithAddress,
  paymasterManager: PaymasterManager
) {
  const tx = await paymasterManager.connect(paymasterCreator).deployPaymaster();
  const receipt = await tx.wait();

  const paymasterDeployedEvent = receipt!.logs.find(
    log => log.topics[0] === paymasterManager.interface.getEvent('PaymasterDeployed').topicHash
  );

  if (!paymasterDeployedEvent) {
    throw new Error('PaymasterDeployed event not found in transaction logs');
  }

  const parsedEvent = paymasterManager.interface.parseLog({
    topics: paymasterDeployedEvent.topics as string[],
    data: paymasterDeployedEvent.data
  });

  if (!parsedEvent) {
    throw new Error('Failed to parse PaymasterDeployed event');
  }

  const deployer = parsedEvent.args.deployer;
  const paymasterAddress = parsedEvent.args.paymasterAddress;

  return {deployer, paymasterAddress}
};
