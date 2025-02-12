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
    const admin = accounts[0];
    const publisher = accounts[1];
    const receivers = [accounts[2], accounts[3], accounts[4]];

    const { identityId: publisherIdentityId } = await createProfile(
      Profile,
      admin,
      publisher,
    );

    const receiversIdentityIds = (
      await createProfiles(Profile, admin, receivers)
    ).map((p) => p.identityId);

    const signaturesData = await getKCSignaturesData(
      publisher,
      publisherIdentityId,
      receivers,
    );

    const { tx, collectionId } = await createKnowledgeCollection(
      KnowledgeCollection,
      Token,
      admin,
      publisherIdentityId,
      receiversIdentityIds,
      signaturesData,
    );

    await expect(tx).to.not.be.reverted;
    expect(collectionId).to.equal(1);

    // Verify knowledge collection was created
    const metadata =
      await KnowledgeCollectionStorage.getKnowledgeCollectionMetadata(
        collectionId,
      );

    expect(metadata[0][0].length).to.equal(3); // merkle roots
    expect(metadata[1].length).to.equal(0); // burned
    expect(metadata[2]).to.equal(10); // minted
    expect(metadata[3]).to.equal(1000); // byteSize
    expect(metadata[4]).to.equal(2); // startEpoch
    expect(metadata[5]).to.equal(4); // endEpoch
    expect(metadata[6]).to.equal(ethers.parseEther('100')); // tokenAmount
    expect(metadata[7]).to.equal(false); // isImmutable
  });

  it('Should revert if insufficient signatures provided', async () => {
    const admin = accounts[0];
    const publisher = accounts[1];
    const receivers = [accounts[2], accounts[3], accounts[4]];

    const { identityId: publisherIdentityId } = await createProfile(
      Profile,
      admin,
      publisher,
    );

    const signaturesData = await getKCSignaturesData(
      publisher,
      publisherIdentityId,
      receivers,
    );

    // Override receivers arrays to be empty
    const receiversIdentityIds: number[] = [];
    signaturesData.receiverRs = [];
    signaturesData.receiverVSs = [];

    await expect(
      createKnowledgeCollection(
        KnowledgeCollection,
        Token,
        admin,
        publisherIdentityId,
        receiversIdentityIds,
        signaturesData,
      ),
    ).to.be.revertedWithCustomError(
      KnowledgeCollection,
      'MinSignaturesRequirementNotMet',
    );
  });
});
