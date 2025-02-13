import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, getBytes } from 'ethers';

import { NodeAccounts } from './profile-helpers';
import { KnowledgeCollection, Token } from '../../typechain';

export type ValidatorInfo = {
  identityId: number;
  r: string;
  vs: string;
};

export type KCSignaturesData = {
  merkleRoot: string;
  publisherR: string;
  publisherVS: string;
  receiverRs: string[];
  receiverVSs: string[];
};

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
  KnowledgeCollection: KnowledgeCollection,
  Token: Token,
  kcCreator: SignerWithAddress,
  publisherIdentityId: number,
  receiversIdentityIds: number[],
  signaturesData: KCSignaturesData,
  publishOperationId: string = 'test-operation-id',
  knowledgeAssetsAmount: number = 10,
  byteSize: number = 1000,
  epochs: number = 2,
  tokenAmount: bigint = ethers.parseEther('100'),
  isImmutable: boolean = false,
  paymaster: string = ethers.ZeroAddress,
) {
  // Approve tokens
  await Token.connect(kcCreator).increaseAllowance(
    KnowledgeCollection.getAddress(),
    tokenAmount,
  );

  // Create knowledge collection
  const tx = await KnowledgeCollection.connect(
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
