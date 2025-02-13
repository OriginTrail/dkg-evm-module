import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'ethers';

import { ACCESS_POLICIES } from './constants';
import { createProfilesAndKC } from './kc-helpers';
import { NodeAccounts } from './types';
import {
  Profile,
  KnowledgeCollection,
  Token,
  KnowledgeCollectionStorage,
  Paranet,
} from '../../typechain';

export async function setupParanet(
  kcCreator: SignerWithAddress,
  publishingNode: NodeAccounts,
  receivingNodes: NodeAccounts[],
  contracts: {
    Paranet: Paranet;
    Profile: Profile;
    Token: Token;
    KnowledgeCollection: KnowledgeCollection;
    KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  },
  paranetName: string = 'Test Paranet',
  paranetDescription: string = 'Test Paranet Description',
  nodesAccessPolicy: number = ACCESS_POLICIES.OPEN,
  minersAccessPolicy: number = ACCESS_POLICIES.OPEN,
) {
  const { publishingNodeIdentityId, receivingNodesIdentityIds, collectionId } =
    await createProfilesAndKC(
      kcCreator,
      publishingNode,
      receivingNodes,
      contracts,
    );

  // Register paranet
  const paranetKCStorageContract =
    await contracts.KnowledgeCollectionStorage.getAddress();
  const paranetKATokenId = 1;

  await contracts.Paranet.connect(kcCreator).registerParanet(
    paranetKCStorageContract,
    collectionId,
    paranetKATokenId,
    paranetName,
    paranetDescription,
    nodesAccessPolicy,
    minersAccessPolicy,
  );

  return {
    publishingNode,
    receivingNodes,
    publishingNodeIdentityId,
    receivingNodesIdentityIds,
    paranetOwner: kcCreator,
    paranetKCStorageContract,
    paranetKCTokenId: collectionId,
    paranetKATokenId,
    paranetName,
    paranetDescription,
    nodesAccessPolicy,
    minersAccessPolicy,
    paranetId: ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'uint256'],
        [paranetKCStorageContract, collectionId, paranetKATokenId],
      ),
    ),
  };
}
