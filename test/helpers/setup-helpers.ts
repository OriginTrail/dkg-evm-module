import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

export function getDefaultPublishingNode(accounts: SignerWithAddress[]) {
  return {
    admin: accounts[1],
    operational: accounts[2],
  };
}

export function getDefaultReceivingNodes(
  accounts: SignerWithAddress[],
  receivingNodesNumber: number = 3,
) {
  return Array.from({ length: receivingNodesNumber }, (_, i) => ({
    admin: accounts[3 + i],
    operational: accounts[4 + i],
  }));
}

export function getDefaultKCCreator(accounts: SignerWithAddress[]) {
  return accounts[9];
}
