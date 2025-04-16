import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

export function getPublishingNode(
  accounts: SignerWithAddress[],
  admin: number,
  operational: number,
) {
  return {
    admin: accounts[admin],
    operational: accounts[operational],
  };
}

export function getDefaultPublishingNode(accounts: SignerWithAddress[]) {
  return getPublishingNode(accounts, 1, 2);
}

export function getDefaultReceivingNodes(
  accounts: SignerWithAddress[],
  receivingNodesNumber: number = 3,
) {
  return Array.from({ length: receivingNodesNumber }, (_, i) => ({
    admin: accounts[accounts.length - i - 1],
    operational: accounts[accounts.length - i - 2],
  }));
}

export function getKCCreator(accounts: SignerWithAddress[], account: number) {
  return accounts[account];
}

export function getDefaultKCCreator(accounts: SignerWithAddress[]) {
  return getKCCreator(accounts, 9);
}
