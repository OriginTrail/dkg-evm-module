import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
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
import {
  createKnowledgeCollection,
  getKCSignaturesData,
} from '../helpers/kc-helpers';
import { createProfile, createProfiles } from '../helpers/profile-helpers';
import {
  getDefaultPublishingNode,
  getDefaultReceivingNodes,
  getDefaultKCCreator,
} from '../helpers/setup-helpers';

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
    const kcCreator = getDefaultKCCreator(accounts);
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);

    const contracts = {
      Profile,
      KnowledgeCollection,
      Token,
    };

    const { identityId: publishingNodeIdentityId } = await createProfile(
      contracts.Profile,
      publishingNode,
    );
    const receivingNodesIdentityIds = (
      await createProfiles(contracts.Profile, receivingNodes)
    ).map((p) => p.identityId);

    const { collectionId } = await createKnowledgeCollection(
      kcCreator,
      publishingNode,
      publishingNodeIdentityId,
      receivingNodes,
      receivingNodesIdentityIds,
      contracts,
    );

    expect(collectionId).to.equal(1);

    // Verify knowledge collection was created
    const metadata =
      await KnowledgeCollectionStorage.getKnowledgeCollectionMetadata(
        collectionId,
      );

    expect(metadata[0][0].length).to.equal(receivingNodesIdentityIds.length); // merkle roots
    expect(metadata[1].length).to.equal(0); // burned
    expect(metadata[2]).to.equal(10); // minted
    expect(metadata[3]).to.equal(1000); // byteSize
    expect(metadata[4]).to.equal(2); // startEpoch
    expect(metadata[5]).to.equal(4); // endEpoch
    expect(metadata[6]).to.equal(ethers.parseEther('100')); // tokenAmount
    expect(metadata[7]).to.equal(false); // isImmutable
  });

  it('Should revert if insufficient signatures provided', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);

    const { identityId: publisherIdentityId } = await createProfile(
      Profile,
      publishingNode,
    );

    const signaturesData = await getKCSignaturesData(
      publishingNode,
      publisherIdentityId,
      receivingNodes,
    );

    // Override receivers arrays to be empty
    const receiversIdentityIds: number[] = [];
    signaturesData.receiverRs = [];
    signaturesData.receiverVSs = [];

    // Approve tokens
    await Token.connect(kcCreator).increaseAllowance(
      KnowledgeCollection.getAddress(),
      ethers.parseEther('100'),
    );

    // Create knowledge collection
    await expect(
      KnowledgeCollection.connect(kcCreator).createKnowledgeCollection(
        'test-operation-id',
        signaturesData.merkleRoot,
        10,
        1000,
        2,
        ethers.parseEther('100'),
        false,
        ethers.ZeroAddress,
        publisherIdentityId,
        signaturesData.publisherR,
        signaturesData.publisherVS,
        receiversIdentityIds,
        signaturesData.receiverRs,
        signaturesData.receiverVSs,
      ),
    ).to.be.revertedWithCustomError(
      KnowledgeCollection,
      'MinSignaturesRequirementNotMet',
    );
  });
});
