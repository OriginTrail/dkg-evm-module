import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, getBytes } from 'ethers';
import { HexString } from 'ethers/lib.commonjs/utils/data';

import { KCSignaturesData, NodeAccounts } from './types';
import { KnowledgeCollection, Token } from '../../typechain';

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
  merkleRoot: HexString = ethers.keccak256(
    ethers.toUtf8Bytes('test-merkle-root'),
  ),
): Promise<KCSignaturesData> {
  const publisherMessageHash = ethers.solidityPackedKeccak256(
    ['uint72', 'bytes32'],
    [publisherIdentityId, merkleRoot],
  );

  const { r: publisherR, vs: publisherVS } = await signMessage(
    publishingNode.operational,
    publisherMessageHash,
  );

  const receiverRs = [];
  const receiverVSs = [];
  for (const node of receivingNodes) {
    const { r: receiverR, vs: receiverVS } = await signMessage(
      node.operational,
      merkleRoot,
    );
    receiverRs.push(receiverR);
    receiverVSs.push(receiverVS);
  }

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
  publishingNode: NodeAccounts,
  publishingNodeIdentityId: number,
  receivingNodes: NodeAccounts[],
  receivingNodesIdentityIds: number[],
  contracts: {
    KnowledgeCollection: KnowledgeCollection;
    Token: Token;
  },
  merkleRoot: HexString = ethers.keccak256(
    ethers.toUtf8Bytes('test-merkle-root'),
  ),
  publishOperationId: string = 'test-operation-id',
  knowledgeAssetsAmount: number = 10,
  byteSize: number = 1000,
  epochs: number = 2,
  tokenAmount: bigint = ethers.parseEther('100'),
  isImmutable: boolean = false,
  paymaster: string = ethers.ZeroAddress,
) {
  const signaturesData = await getKCSignaturesData(
    publishingNode,
    publishingNodeIdentityId,
    receivingNodes,
    merkleRoot,
  );

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
    publishingNodeIdentityId,
    signaturesData.publisherR,
    signaturesData.publisherVS,
    receivingNodesIdentityIds,
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
