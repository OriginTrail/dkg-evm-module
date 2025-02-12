import { randomBytes } from 'crypto';

import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers, getBytes } from 'ethers';
import hre from 'hardhat';

import {
  KnowledgeCollection,
  KnowledgeCollectionStorage,
  EpochStorage,
  AskStorage,
  Chronos,
  Token,
  ParametersStorage,
  IdentityStorage,
  Hub,
  Profile,
  ParanetKnowledgeCollectionsRegistry,
  ParanetKnowledgeMinersRegistry,
  Identity,
  Staking,
} from '../../typechain';

type KnowledgeCollectionFixture = {
  accounts: SignerWithAddress[];
  KnowledgeCollection: KnowledgeCollection;
  KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  EpochStorage: EpochStorage;
  AskStorage: AskStorage;
  Chronos: Chronos;
  Token: Token;
  ParametersStorage: ParametersStorage;
  IdentityStorage: IdentityStorage;
  Identity: Identity;
  Profile: Profile;
  ParanetsKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  Staking: Staking;
};

describe('@unit KnowledgeCollection', () => {
  let accounts: SignerWithAddress[];
  let KnowledgeCollection: KnowledgeCollection;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let EpochStorage: EpochStorage;
  let AskStorage: AskStorage;
  let Chronos: Chronos;
  let Token: Token;
  let ParametersStorage: ParametersStorage;
  let IdentityStorage: IdentityStorage;
  let Identity: Identity;
  let Profile: Profile;
  let ParanetsKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let Staking: Staking;

  async function deployKnowledgeCollectionFixture(): Promise<KnowledgeCollectionFixture> {
    await hre.deployments.fixture([
      'Token',
      'AskStorage',
      'EpochStorage',
      'KnowledgeCollection',
      'ParanetKnowledgeCollectionsRegistry',
      'ParanetKnowledgeMinersRegistry',
      'Chronos',
      'Profile',
      'Identity',
      'Staking',
    ]);

    accounts = await hre.ethers.getSigners();
    const Hub = await hre.ethers.getContract<Hub>('Hub');

    KnowledgeCollection = await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    );
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );
    EpochStorage = await hre.ethers.getContract<EpochStorage>('EpochStorageV8');
    AskStorage = await hre.ethers.getContract<AskStorage>('AskStorage');
    Chronos = await hre.ethers.getContract<Chronos>('Chronos');
    Token = await hre.ethers.getContract<Token>('Token');
    ParametersStorage =
      await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    IdentityStorage =
      await hre.ethers.getContract<IdentityStorage>('IdentityStorage');
    Identity = await hre.ethers.getContract<Identity>('Identity');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    ParanetsKnowledgeCollectionsRegistry =
      await hre.ethers.getContract<ParanetKnowledgeCollectionsRegistry>(
        'ParanetKnowledgeCollectionsRegistry',
      );
    ParanetKnowledgeMinersRegistry =
      await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
        'ParanetKnowledgeMinersRegistry',
      );
    Staking = await hre.ethers.getContract<Staking>('Staking');

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return {
      accounts,
      KnowledgeCollection,
      KnowledgeCollectionStorage,
      EpochStorage,
      AskStorage,
      Chronos,
      Token,
      ParametersStorage,
      IdentityStorage,
      Profile,
      ParanetsKnowledgeCollectionsRegistry,
      ParanetKnowledgeMinersRegistry,
      Identity,
      Staking,
    };
  }

  const createProfile = async (
    admin: SignerWithAddress,
    operational: SignerWithAddress,
  ) => {
    const nodeId = '0x' + randomBytes(32).toString('hex');
    const tx = await Profile.connect(operational).createProfile(
      admin.address,
      [],
      `Node ${Math.floor(Math.random() * 1000)}`,
      nodeId,
      0,
    );
    const receipt = await tx.wait();
    const identityId = Number(receipt!.logs[0].topics[1]);
    return { nodeId, identityId };
  };

  async function signMessage(
    signer: SignerWithAddress,
    messageHash: string | Uint8Array,
  ) {
    // Pack the message the same way as the contract
    const packedMessage = getBytes(messageHash);

    // Sign the message
    const signature = await signer.signMessage(packedMessage);

    const { v, r, s } = ethers.Signature.from(signature);

    // Calculate the combined value
    const vsValue = BigInt(s) | ((BigInt(v) - BigInt(27)) << BigInt(255));

    // Convert to proper bytes32 format
    const vs = ethers.zeroPadValue(ethers.toBeHex(vsValue), 32);

    return { r, vs };
  }

  const setupTestProfiles = async () => {
    const { identityId: identityIdPublisher } = await createProfile(
      accounts[0],
      accounts[1],
    );
    const { identityId: identityIdValidator1 } = await createProfile(
      accounts[0],
      accounts[2],
    );
    const { identityId: identityIdValidator2 } = await createProfile(
      accounts[0],
      accounts[3],
    );
    const { identityId: identityIdValidator3 } = await createProfile(
      accounts[0],
      accounts[4],
    );

    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('test-merkle-root'));
    const publisherMessageHash = ethers.solidityPackedKeccak256(
      ['uint72', 'bytes32'],
      [identityIdPublisher, merkleRoot],
    );

    // Get signatures
    const { r: publisherR, vs: publisherVS } = await signMessage(
      accounts[1],
      publisherMessageHash,
    );
    const { r: validatorR1, vs: validatorVS1 } = await signMessage(
      accounts[2],
      merkleRoot,
    );
    const { r: validatorR2, vs: validatorVS2 } = await signMessage(
      accounts[3],
      merkleRoot,
    );
    const { r: validatorR3, vs: validatorVS3 } = await signMessage(
      accounts[4],
      merkleRoot,
    );

    const validatorIds = [
      identityIdValidator1,
      identityIdValidator2,
      identityIdValidator3,
    ];
    const validatorRs = [validatorR1, validatorR2, validatorR3];
    const validatorVSs = [validatorVS1, validatorVS2, validatorVS3];

    return {
      identityIdPublisher,
      merkleRoot,
      publisherR,
      publisherVS,
      validatorIds,
      validatorRs,
      validatorVSs,
    };
  };

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({
      accounts,
      KnowledgeCollection,
      KnowledgeCollectionStorage,
      EpochStorage,
      AskStorage,
      Chronos,
      Token,
      ParametersStorage,
      IdentityStorage,
      Profile,
    } = await loadFixture(deployKnowledgeCollectionFixture));
  });

  it('Should create a knowledge collection successfully', async () => {
    const {
      identityIdPublisher,
      merkleRoot,
      publisherR,
      publisherVS,
      validatorIds,
      validatorRs,
      validatorVSs,
    } = await setupTestProfiles();

    // Setup test parameters
    const tokenAmount = hre.ethers.parseEther('100');
    const byteSize = 1000;
    const isImmutable = false;

    // Approve tokens
    await Token.mint(accounts[0].address, tokenAmount);
    await Token.approve(KnowledgeCollection.getAddress(), tokenAmount);

    // Create knowledge collection
    const tx = await KnowledgeCollection.createKnowledgeCollection(
      'test-operation-id', // publishOperationId
      merkleRoot,
      10, // knowledgeAssetsAmount
      byteSize,
      2, // epochs
      tokenAmount,
      isImmutable,
      ethers.ZeroAddress, // paymaster
      identityIdPublisher,
      publisherR,
      publisherVS,
      validatorIds,
      validatorRs,
      validatorVSs,
    );

    await expect(tx).to.not.be.reverted;

    const receipt = await tx.wait();
    const collectionId = Number(receipt!.logs[2].topics[1]);

    expect(collectionId).to.equal(1);

    // Verify knowledge collection was created
    const metadata =
      await KnowledgeCollectionStorage.getKnowledgeCollectionMetadata(
        collectionId,
      );

    expect(metadata[0][0].length).to.equal(3); // merkle roots
    expect(metadata[1].length).to.equal(0); // burned
    expect(metadata[2]).to.equal(10); // minted
    expect(metadata[3]).to.equal(byteSize); // byteSize
    expect(metadata[4]).to.equal(2); // startEpoch
    expect(metadata[5]).to.equal(4); // endEpoch
    expect(metadata[6]).to.equal(tokenAmount); // tokenAmount
    expect(metadata[7]).to.equal(isImmutable); // isImmutable
  });

  it('Should revert if insufficient signatures provided', async () => {
    const { identityIdPublisher, merkleRoot, publisherR, publisherVS } =
      await setupTestProfiles();

    const tokenAmount = hre.ethers.parseEther('100');
    await Token.mint(accounts[0].address, tokenAmount);
    await Token.approve(KnowledgeCollection.getAddress(), tokenAmount);

    await expect(
      KnowledgeCollection.createKnowledgeCollection(
        'test-operation-id', // publishOperationId
        merkleRoot,
        10, // knowledgeAssetsAmount
        1000, // byteSize
        10, // epochs
        tokenAmount,
        false, // isImmutable
        ethers.ZeroAddress, // paymaster
        identityIdPublisher,
        publisherR,
        publisherVS,
        [], // Empty validator identityIds array
        [], // Empty validator R array
        [], // Empty validator VS array
      ),
    ).to.be.revertedWithCustomError(
      KnowledgeCollection,
      'MinSignaturesRequirementNotMet',
    );
  });
});
