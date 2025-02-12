import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, getBytes } from 'ethers';

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
  publisher: SignerWithAddress,
  publisherIdentityId: number,
  receivers: SignerWithAddress[],
): Promise<KCSignaturesData> {
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('test-merkle-root'));
  const publisherMessageHash = ethers.solidityPackedKeccak256(
    ['uint72', 'bytes32'],
    [publisherIdentityId, merkleRoot],
  );

  const { r: publisherR, vs: publisherVS } = await signMessage(
    publisher,
    publisherMessageHash,
  );
  const { r: receiverR1, vs: receiverVS1 } = await signMessage(
    receivers[0],
    merkleRoot,
  );
  const { r: receiverR2, vs: receiverVS2 } = await signMessage(
    receivers[1],
    merkleRoot,
  );
  const { r: receiverR3, vs: receiverVS3 } = await signMessage(
    receivers[2],
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
  owner: SignerWithAddress,
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
  await Token.mint(owner.address, tokenAmount);
  await Token.approve(KnowledgeCollection.getAddress(), tokenAmount);

  // Create knowledge collection
  const tx = await KnowledgeCollection.createKnowledgeCollection(
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
