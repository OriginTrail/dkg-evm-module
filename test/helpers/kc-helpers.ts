import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, getBytes } from 'ethers';

import { createProfile, createProfiles } from './profile-helpers';
import { KCSignaturesData, NodeAccounts } from './types';
import { KnowledgeCollection, Token, Profile } from '../../typechain';

export async function signMessage(
  signer: SignerWithAddress,
  messageHash: string | Uint8Array,
) {
  const packedMessage = getBytes(messageHash);
  const signature = await signer.signMessage(packedMessage);
  const { v, r, s } = ethers.Signature.from(signature);
  const vsValue = BigInt(s) | ((BigInt(v) - BigInt(27)) << BigInt(255));
  const vs = ethers.zeroPadValue(ethers.toBeHex(vsValue), 32);
  return { r, vs };
}

export async function getKCSignaturesData(
  publishingNode: NodeAccounts,
  publisherIdentityId: number,
  receivingNodes: NodeAccounts[],
): Promise<KCSignaturesData> {
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('test-merkle-root'));
  const publisherMessageHash = ethers.solidityPackedKeccak256(
    ['uint72', 'bytes32'],
    [publisherIdentityId, merkleRoot],
  );

  const { r: publisherR, vs: publisherVS } = await signMessage(
    publishingNode.operational,
    publisherMessageHash,
  );
  const { r: receiverR1, vs: receiverVS1 } = await signMessage(
    receivingNodes[0].operational,
    merkleRoot,
  );
  const { r: receiverR2, vs: receiverVS2 } = await signMessage(
    receivingNodes[1].operational,
    merkleRoot,
  );
  const { r: receiverR3, vs: receiverVS3 } = await signMessage(
    receivingNodes[2].operational,
    merkleRoot,
  );
  const receiverRs = [receiverR1, receiverR2, receiverR3];
  const receiverVSs = [receiverVS1, receiverVS2, receiverVS3];

  return {
    merkleRoot,
    publisherR,
    publisherVS,
    receiverRs,
    receiverVSs,
  };
}

export async function createKnowledgeCollection(
  kcCreator: SignerWithAddress,
  publisherIdentityId: number,
  receiversIdentityIds: number[],
  signaturesData: KCSignaturesData,
  contracts: {
    KnowledgeCollection: KnowledgeCollection;
    Token: Token;
  },
  publishOperationId: string = 'test-operation-id',
  knowledgeAssetsAmount: number = 10,
  byteSize: number = 1000,
  epochs: number = 2,
  tokenAmount: bigint = ethers.parseEther('100'),
  isImmutable: boolean = false,
  paymaster: string = ethers.ZeroAddress,
) {
  // Approve tokens
  await contracts.Token.connect(kcCreator).increaseAllowance(
    contracts.KnowledgeCollection.getAddress(),
    tokenAmount,
  );

  // Create knowledge collection
  const tx = await contracts.KnowledgeCollection.connect(
    kcCreator,
  ).createKnowledgeCollection(
    publishOperationId,
    signaturesData.merkleRoot,
    knowledgeAssetsAmount,
    byteSize,
    epochs,
    tokenAmount,
    isImmutable,
    paymaster,
    publisherIdentityId,
    signaturesData.publisherR,
    signaturesData.publisherVS,
    receiversIdentityIds,
    signaturesData.receiverRs,
    signaturesData.receiverVSs,
  );

  const receipt = await tx.wait();
  const collectionId = Number(receipt!.logs[2].topics[1]);

  return { tx, receipt, collectionId };
}

export async function createProfilesAndKC(
  kcCreator: SignerWithAddress,
  publishingNode: NodeAccounts,
  receivingNodes: NodeAccounts[],
  contracts: {
    Profile: Profile;
    KnowledgeCollection: KnowledgeCollection;
    Token: Token;
  },
  kcOptions?: {
    publishOperationId?: string;
    knowledgeAssetsAmount?: number;
    byteSize?: number;
    epochs?: number;
    tokenAmount?: bigint;
    isImmutable?: boolean;
    paymaster?: string;
  }
) {
  const { identityId: publishingNodeIdentityId } = await createProfile(
    contracts.Profile,
    publishingNode,
  );
  const receivingNodesIdentityIds = (
    await createProfiles(contracts.Profile, receivingNodes)
  ).map((p) => p.identityId);

  // Create knowledge collection
  const signaturesData = await getKCSignaturesData(
    publishingNode,
    publishingNodeIdentityId,
    receivingNodes,
  );
  const { collectionId } = await createKnowledgeCollection(
    kcCreator,
    publishingNodeIdentityId,
    receivingNodesIdentityIds,
    signaturesData,
    contracts,
    kcOptions?.publishOperationId,
    kcOptions?.knowledgeAssetsAmount,
    kcOptions?.byteSize,
    kcOptions?.epochs,
    kcOptions?.tokenAmount,
    kcOptions?.isImmutable,
    kcOptions?.paymaster
  );

  return {
    publishingNode,
    publishingNodeIdentityId,
    receivingNodes,
    receivingNodesIdentityIds,
    kcCreator,
    collectionId,
  };
}
