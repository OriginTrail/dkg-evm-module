import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
import hre from 'hardhat';
import { kcTools } from 'assertion-tools';

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

// Sample data for KC
const quads = [
  '<urn:us-cities:info:new-york> <http://schema.org/area> "468.9 sq mi" .',
  '<urn:us-cities:info:new-york> <http://schema.org/name> "New York" .',
  '<urn:us-cities:info:new-york> <http://schema.org/population> "8,336,817" .',
  '<urn:us-cities:info:new-york> <http://schema.org/state> "New York" .',
  '<urn:us-cities:info:new-york> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://schema.org/City> .',
  '<uuid:a1a241ad-9f62-4dcc-94b6-f59b299dee0a> <https://ontology.origintrail.io/dkg/1.0#privateMerkleRoot> "0xaac2a420672a1eb77506c544ff01beed2be58c0ee3576fe037c846f97481cefd" .',
  '<https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x5cb6421dd41c7a62a84c223779303919e7293753d8a1f6f49da2e598013fe652> <https://ontology.origintrail.io/dkg/1.0#representsPrivateResource> <uuid:396b91f8-977b-4f5d-8658-bc4bc195ba3c> .',
  '<https://ontology.origintrail.io/dkg/1.0#metadata-hash:0x6a2292b30c844d2f8f2910bf11770496a3a79d5a6726d1b2fd3ddd18e09b5850> <https://ontology.origintrail.io/dkg/1.0#representsPrivateResource> <uuid:7eab0ccb-dd6c-4f81-a342-3c22e6276ec5> .',
  '<https://ontology.origintrail.io/dkg/1.0#metadata-hash:0xc1f682b783b1b93c9d5386eb1730c9647cf4b55925ec24f5e949e7457ba7bfac> <https://ontology.origintrail.io/dkg/1.0#representsPrivateResource> <uuid:8b843b0c-33d8-4546-9a6d-207fd22c793c> .',
  // Add more quads to ensure we have enough chunks
  ...Array(1000).fill(
    '<urn:fake:quad> <urn:fake:predicate> <urn:fake:object> .',
  ),
];
const merkleRoot = kcTools.calculateMerkleRoot(quads, 32);

// Helper function for distribution calculation
function calcDistribution(
  tokenAmount: bigint,
  numberOfEpochs: bigint,
  epochLen: bigint,
  timeLeft: bigint,
) {
  const basePer = tokenAmount / numberOfEpochs;
  const curPart = (basePer * timeLeft) / epochLen;
  const tailPart = basePer - curPart;
  const allocated = curPart + basePer * (numberOfEpochs - 1n) + tailPart;
  return { curPart, basePer, tailPart, allocated };
}

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

  it('Should create a KC & distribute tokens fractionally across epochs', async () => {
    /* ---------- actors & helpers ---------- */
    const kcCreator = getDefaultKCCreator(accounts);
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);
    const contracts = { Profile, KnowledgeCollection, Token };

    const { identityId: publishingNodeIdentityId } = await createProfile(
      Profile,
      publishingNode,
    );
    const receivingNodesIdentityIds = (
      await createProfiles(Profile, receivingNodes)
    ).map((p) => p.identityId);

    /* ---------- parameters ---------- */
    const tokenAmount = ethers.parseEther('100');
    const numberOfEpochs = 5n;
    const merkleRoot = kcTools.calculateMerkleRoot(
      ['<urn:x> <urn:y> <urn:z> .'],
      32,
    );

    /* ---------- epoch telemetry BEFORE tx ---------- */
    const currentEpoch = await Chronos.getCurrentEpoch();
    const epochLen = await Chronos.epochLength(); // bigint
    const timeLeft0 = await Chronos.timeUntilNextEpoch();
    const elapsed0 = epochLen - timeLeft0;
    const pct0 = Number((elapsed0 * 100n) / epochLen);

    console.log(
      `\n⏱️  BEFORE  | Epoch #${currentEpoch}: ` +
        `${elapsed0.toString()}s elapsed / ${epochLen.toString()}s  (${pct0}%)`,
    );

    /* ---------- create KC ---------- */
    const { collectionId } = await createKnowledgeCollection(
      kcCreator,
      publishingNode,
      publishingNodeIdentityId,
      receivingNodes,
      receivingNodesIdentityIds,
      contracts,
      merkleRoot,
      'test-operation-id',
      10,
      1000,
      Number(numberOfEpochs),
      tokenAmount,
      false,
      ethers.ZeroAddress,
    );
    expect(collectionId).to.equal(1);

    /* ---------- epoch telemetry AFTER tx ---------- */
    const timeLeft1 = await Chronos.timeUntilNextEpoch();
    const elapsed1 = epochLen - timeLeft1;
    const pct1 = Number((elapsed1 * 100n) / epochLen);
    const delta = elapsed1 - elapsed0;

    console.log(
      `⏱️  AFTER   | Epoch #${currentEpoch}: ` +
        `${elapsed1.toString()}s elapsed / ${epochLen.toString()}s  (${pct1}%)`,
    );
    console.log(
      `🕑  Δ during tx: ${delta.toString()}s (${Number((delta * 100n) / epochLen)}%)`,
    );

    /* ---------- metadata sanity ---------- */
    const meta =
      await KnowledgeCollectionStorage.getKnowledgeCollectionMetadata(1);
    expect(meta[4]).to.equal(currentEpoch);
    expect(meta[5]).to.equal(currentEpoch + numberOfEpochs);
    expect(meta[6]).to.equal(tokenAmount);

    /* ---------- expected distribution ---------- */
    const basePer = tokenAmount / numberOfEpochs;
    const curPart = (basePer * timeLeft1) / epochLen;
    let tailPart = basePer - curPart;
    const fullCnt = numberOfEpochs - 1n;
    const alloc = curPart + basePer * fullCnt + tailPart;
    if (alloc < tokenAmount) tailPart += tokenAmount - alloc;

    console.log('\n🧮  Expected token split');
    console.table({
      'current (fraction)': curPart.toString(),
      'full per epoch': basePer.toString(),
      'tail (fraction)': tailPart.toString(),
      'sum check': (curPart + basePer * fullCnt + tailPart).toString(),
    });

    /* ---------- on-chain pools & assertions ---------- */
    const pools: bigint[] = [];
    for (let i = 0n; i <= numberOfEpochs; i++) {
      const ep = currentEpoch + i;
      const p = await EpochStorage.getEpochPool(1, ep);
      pools.push(p);
      console.log(`epoch ${ep} ➜ ${p.toString()}`);
    }

    // current epoch
    expect(pools[0]).to.equal(curPart);

    // full middle epochs
    for (let i = 1; i < Number(numberOfEpochs); i++) {
      expect(pools[i]).to.equal(basePer);
    }

    // final fractional
    expect(pools[Number(numberOfEpochs)]).to.equal(tailPart);

    // beyond final
    expect(
      await EpochStorage.getEpochPool(1, currentEpoch + numberOfEpochs + 1n),
    ).to.equal(0);

    // sum check
    const total = pools.reduce((a, v) => a + v, 0n);
    expect(total).to.equal(tokenAmount);
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

  it('Should create KC at ~half-epoch mark and distribute tokens correctly', async () => {
    /* ---------- actors ---------- */
    const kcCreator = getDefaultKCCreator(accounts);
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);
    const contracts = { Profile, KnowledgeCollection, Token };

    const { identityId: pubNodeId } = await createProfile(
      Profile,
      publishingNode,
    );
    const recvIds = (await createProfiles(Profile, receivingNodes)).map(
      (p) => p.identityId,
    );

    /* ---------- params ---------- */
    const tokenAmount = ethers.parseEther('50');
    const numberOfEpochs = 3n;
    const merkleRoot = kcTools.calculateMerkleRoot(
      ['<urn:x> <urn:y> <urn:z> .'],
      32,
    );

    /* ---------- warp EVM to ~50 % of next epoch ---------- */
    const epochLen = await Chronos.epochLength(); // bigint
    const timeLeftInit = await Chronos.timeUntilNextEpoch(); // bigint

    // Δ = remaining-to-end + half epoch
    const delta = timeLeftInit + epochLen / 2n;
    await hre.ethers.provider.send('evm_increaseTime', [Number(delta)]);
    await hre.ethers.provider.send('evm_mine', []); // mine new block

    /* ---------- telemetry just before tx ---------- */
    const currentEpoch = await Chronos.getCurrentEpoch();
    const timeLeft0 = await Chronos.timeUntilNextEpoch();
    const elapsed0 = epochLen - timeLeft0;
    console.log(
      `\n⏱️  HALF-EPOCH TEST | Epoch #${currentEpoch}: ` +
        `${elapsed0.toString()}s elapsed of ${epochLen.toString()}s ` +
        `(~${Number((elapsed0 * 100n) / epochLen)}%)`,
    );

    /* ---------- create KC ---------- */
    const { collectionId } = await createKnowledgeCollection(
      kcCreator,
      publishingNode,
      pubNodeId,
      receivingNodes,
      recvIds,
      contracts,
      merkleRoot,
      'half-epoch-op',
      5, // knowledgeAssetsAmount
      500, // byteSize
      Number(numberOfEpochs),
      tokenAmount,
      false,
      ethers.ZeroAddress,
    );
    expect(collectionId).to.equal(1);

    /* ---------- compute expected parts (use on-chain timeLeft1) ---------- */
    const timeLeft1 = await Chronos.timeUntilNextEpoch();
    const basePer = tokenAmount / numberOfEpochs;
    const curPart = (basePer * timeLeft1) / epochLen;
    let tailPart = basePer - curPart;
    const fullCnt = numberOfEpochs - 1n;
    let alloc = curPart + basePer * fullCnt + tailPart;
    if (alloc < tokenAmount) tailPart += tokenAmount - alloc; // crumbs

    console.log('\n🧮  Expected split (half-epoch)');
    console.table({
      'current (fraction)': curPart.toString(),
      'full per epoch': basePer.toString(),
      'tail (fraction)': tailPart.toString(),
    });

    /* ---------- fetch pools ---------- */
    const pools: bigint[] = [];
    for (let i = 0n; i <= numberOfEpochs; i++) {
      pools.push(await EpochStorage.getEpochPool(1, currentEpoch + i));
    }
    pools.forEach((v, i) =>
      console.log(`epoch ${currentEpoch + BigInt(i)} ➜ ${v.toString()}`),
    );

    /* ---------- assertions ---------- */
    expect(pools[0]).to.equal(curPart); // fractional start
    for (let i = 1; i < Number(numberOfEpochs); i++)
      expect(pools[i]).to.equal(basePer); // full middles
    expect(pools[Number(numberOfEpochs)]).to.equal(tailPart); // fractional end
    expect(
      await EpochStorage.getEpochPool(1, currentEpoch + numberOfEpochs + 1n),
    ).to.equal(0); // nothing beyond

    const sum = pools.reduce((a, v) => a + v, 0n);
    expect(sum).to.equal(tokenAmount); // total check
  });

  it('Should revert when tokenAmount is lower than _validateTokenAmount expects', async () => {
    /* ---------- environment setup ---------- */
    // Force stake-weighted average ASK to 20 tokens / epoch
    const ask = ethers.parseEther('20'); // 20 TRAC/epoch
    const stake = ethers.parseEther('1'); // 1  TRAC stake
    await AskStorage.connect(accounts[0]).setWeightedActiveAskSum(ask * stake); // 20 * 10^36
    await AskStorage.connect(accounts[0]).setTotalActiveStake(stake); // 1  * 10^18

    const kcCreator = getDefaultKCCreator(accounts); // same sender as other tests
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);

    // Profiles
    const { identityId: publisherId } = await createProfile(
      Profile,
      publishingNode,
    );
    const receiverIds = (await createProfiles(Profile, receivingNodes)).map(
      (p) => p.identityId,
    );

    // Signatures (publisher + receivers)
    const sig = await getKCSignaturesData(
      publishingNode,
      publisherId,
      receivingNodes,
    );

    // Common params
    const byteSize = 1024; // 1 KB
    const epochs = 5; // 5 epochs
    const needTokens = ethers.parseEther('100'); // 20 * 5
    const fewTokens = ethers.parseEther('99'); // deliberately low

    // Allow kcCreator to spend TRAC
    await Token.connect(kcCreator).increaseAllowance(
      KnowledgeCollection.getAddress(),
      needTokens,
    );

    /* ---------- expect revert: tokenAmount too small ---------- */
    await expect(
      KnowledgeCollection.connect(kcCreator).createKnowledgeCollection(
        'validate-fail',
        sig.merkleRoot,
        1, // knowledgeAssetsAmount
        byteSize,
        epochs,
        fewTokens, // < expected
        false, // isImmutable
        ethers.ZeroAddress,
        publisherId,
        sig.publisherR,
        sig.publisherVS,
        receiverIds,
        sig.receiverRs,
        sig.receiverVSs,
      ),
    ).to.be.revertedWithCustomError(KnowledgeCollection, 'InvalidTokenAmount');

    /* ---------- same call with correct tokenAmount should succeed ---------- */
    const { collectionId } = await createKnowledgeCollection(
      kcCreator,
      publishingNode,
      publisherId,
      receivingNodes,
      receiverIds,
      { KnowledgeCollection, Token },
      sig.merkleRoot,
      'validate-pass',
      1, // knowledgeAssetsAmount
      byteSize,
      epochs,
      needTokens, // correct amount
      false,
      ethers.ZeroAddress,
    );

    expect(collectionId).to.equal(1);
  });
});
