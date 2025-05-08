import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import parameters from '../../deployments/parameters.json';
import {
  Hub,
  RandomSamplingStorage,
  Chronos,
  KnowledgeCollectionStorage,
  RandomSampling,
  Profile,
  Token,
  KnowledgeCollection,
} from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';
import { createProfilesAndKC } from '../helpers/kc-helpers';
import {
  createMockChallenge,
  mineBlocks,
  mineProofPeriodBlocks,
} from '../helpers/random-sampling';
import {
  getDefaultKCCreator,
  getDefaultPublishingNode,
  getDefaultReceivingNodes,
  getKCCreator,
  getPublishingNode,
} from '../helpers/setup-helpers';

type RandomStorageFixture = {
  accounts: SignerWithAddress[];
  RandomSamplingStorage: RandomSamplingStorage;
  Hub: Hub;
  Chronos: Chronos;
};

const PANIC_ARITHMETIC_OVERFLOW = 0x11;

describe('@unit RandomSamplingStorage', function () {
  let Hub: Hub;
  let RandomSamplingStorage: RandomSamplingStorage;
  let RandomSampling: RandomSampling;
  let Chronos: Chronos;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let Token: Token;
  let KnowledgeCollection: KnowledgeCollection;
  let MockChallenge: RandomSamplingLib.ChallengeStruct;
  let Profile: Profile;
  let accounts: SignerWithAddress[];

  const proofingPeriodDurationInBlocks =
    parameters.development.RandomSamplingStorage.proofingPeriodDurationInBlocks;

  async function deployRandomSamplingFixture(): Promise<RandomStorageFixture> {
    await hre.deployments.fixture([
      'Token',
      'ParanetKnowledgeCollectionsRegistry',
      'ParanetKnowledgeMinersRegistry',
      'KnowledgeCollectionStorage',
      'KnowledgeCollection',
      'RandomSamplingStorage',
      'RandomSampling',
      'ShardingTableStorage',
      'EpochStorage',
      'Profile',
    ]);

    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await ethers.getSigners();
    Chronos = await hre.ethers.getContract<Chronos>('Chronos');
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );
    RandomSampling =
      await hre.ethers.getContract<RandomSampling>('RandomSampling');
    Token = await hre.ethers.getContract<Token>('Token');
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );
    KnowledgeCollection = await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    );
    Profile = await hre.ethers.getContract<Profile>('Profile');

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSamplingStorage, Hub, Chronos };
  }

  async function updateAndGetActiveProofPeriod() {
    const tx =
      await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    tx.wait();
    return await RandomSamplingStorage.getActiveProofPeriodStatus();
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ RandomSamplingStorage, Chronos } = await loadFixture(
      deployRandomSamplingFixture,
    ));

    MockChallenge = await createMockChallenge(
      RandomSamplingStorage,
      KnowledgeCollectionStorage,
      Chronos,
    );
  });

  describe('Initialization', () => {
    it('Should have correct name and version', async () => {
      expect(await RandomSamplingStorage.name()).to.equal('RandomSamplingStorage');
      expect(await RandomSamplingStorage.version()).to.equal('1.0.0');
    });

    it('Should set the initial parameters correctly', async function () {
      const proofingPeriod = await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(proofingPeriod.durationInBlocks).to.equal(proofingPeriodDurationInBlocks);
      const currentEpochTx = await Chronos.getCurrentEpoch();
      const currentEpoch = BigInt(currentEpochTx.toString());
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should set correct Chronos reference and epoch on initialize', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();
      await RandomSamplingStorage.initialize();
      const proofingPeriod = await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });

    it('Should only apply latest epoch on multiple initialize calls', async () => {
      const currentEpoch = await Chronos.getCurrentEpoch();
      
      // First initialization
      await RandomSamplingStorage.initialize();
      const firstProofingPeriod = await RandomSamplingStorage.proofingPeriodDurations(0);
      expect(firstProofingPeriod.effectiveEpoch).to.equal(currentEpoch);

      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));
      const nextEpoch = await Chronos.getCurrentEpoch();

      // Add a new duration before second initialization
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);

      // Second initialization
      await RandomSamplingStorage.initialize();
      
      // Verify durations are preserved
      const firstDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(currentEpoch);
      const secondDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(nextEpoch);
      
      expect(firstDuration).to.equal(firstProofingPeriod.durationInBlocks);
      expect(secondDuration).to.equal(newDuration);
    });
  });

  describe('Access Control', () => {
    it('Should revert contact call if not called by Hub', async () => {
      await expect(RandomSamplingStorage.connect(accounts[1]).initialize())
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Hub');
    });

    it('Should revert contact call on onlyContract modifiers', async () => {
      await expect(
        RandomSamplingStorage.connect(accounts[1]).replacePendingProofingPeriodDuration(0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addProofingPeriodDuration(0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).setNodeChallenge(0, MockChallenge)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).incrementEpochNodeValidProofsCount(0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToNodeScore(0, 0, 0, 0)
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToEpochNodeDelegatorScore(
          0,
          0,
          ethers.encodeBytes32String('0'),
          0
        )
      )
        .to.be.revertedWithCustomError(RandomSamplingStorage, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');
    });

    it('Should allow access when impersonating hub', async () => {
      const hubAddress = await Hub.getAddress();
      
      // Impersonate hub
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [hubAddress],
      });

      // Fund the impersonated account
      await hre.network.provider.send("hardhat_setBalance", [
        hubAddress,
        "0x1000000000000000000", // 1 ETH
      ]);

      const hubSigner = await ethers.getSigner(hubAddress);

      // Set Hub as HubOwner
      await Hub.connect(accounts[0]).setContractAddress('HubOwner', hubAddress);
      
      // Test initialize
      await expect(RandomSamplingStorage.connect(hubSigner).initialize())
        .to.not.be.reverted;

      // Test setNodeChallenge
      await expect(
        RandomSamplingStorage.connect(hubSigner).setNodeChallenge(0, MockChallenge)
      ).to.not.be.reverted;

      // Test replacePendingProofingPeriodDuration
      await expect(
        RandomSamplingStorage.connect(hubSigner).replacePendingProofingPeriodDuration(0, 0)
      ).to.not.be.reverted;

      // Test addProofingPeriodDuration
      await expect(
        RandomSamplingStorage.connect(hubSigner).addProofingPeriodDuration(0, 0)
      ).to.not.be.reverted;

      // Stop impersonating
      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [hubAddress],
      });
    });
  });

  describe('Proofing Period Management', () => {
    it('Should return the correct proofing period status', async () => {
      const status = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(status.activeProofPeriodStartBlock).to.be.a('bigint');
      expect(status.isValid).to.be.a('boolean');
    });

    it('Should update start block after one full proofing period (duration + 1)', async () => {
      const { activeProofPeriodStartBlock: initialPeriodStartBlock } = await updateAndGetActiveProofPeriod();
      const proofingPeriodDuration: bigint = await mineProofPeriodBlocks(
        initialPeriodStartBlock,
        RandomSamplingStorage
      );
      expect(proofingPeriodDuration).to.be.equal(proofingPeriodDurationInBlocks);

      const tx = await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();
      const statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      const newPeriodStartBlock = statusAfterUpdate.activeProofPeriodStartBlock;

      expect(newPeriodStartBlock).to.be.greaterThan(initialPeriodStartBlock);
      expect(newPeriodStartBlock).to.be.equal(initialPeriodStartBlock + proofingPeriodDuration);
    });

    it('Should update correctly when multiple full periods have passed', async () => {
      const PERIODS = 100;
      const { activeProofPeriodStartBlock: initialPeriodStartBlock } = await updateAndGetActiveProofPeriod();

      let proofingPeriodDuration: bigint;
      for (let i = 1; i < PERIODS; i++) {
        const proofPeriodStatus = await RandomSamplingStorage.getActiveProofPeriodStatus();
        const periodStartBlock = proofPeriodStatus.activeProofPeriodStartBlock;
        proofingPeriodDuration = await mineProofPeriodBlocks(periodStartBlock, RandomSamplingStorage);
        
        expect(proofingPeriodDuration).to.be.equal(BigInt(proofingPeriodDurationInBlocks));
        
        const { activeProofPeriodStartBlock: newPeriodStartBlock } = await updateAndGetActiveProofPeriod();
        expect(newPeriodStartBlock).to.be.greaterThan(periodStartBlock);
        expect(newPeriodStartBlock).to.be.equal(periodStartBlock + proofingPeriodDuration);
        expect((newPeriodStartBlock - initialPeriodStartBlock) / BigInt(i)).to.be.equal(proofingPeriodDuration);
      }
    });

    it('Should return correct historical proofing period start', async () => {
      const { activeProofPeriodStartBlock } = await updateAndGetActiveProofPeriod();

      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(0, 1)
      ).to.be.revertedWith('Proof period start block must be greater than 0');
      
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(100, 0)
      ).to.be.revertedWith('Offset must be greater than 0');
      
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(activeProofPeriodStartBlock + 10n, 1)
      ).to.be.revertedWith('Proof period start block is not valid');
      
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(activeProofPeriodStartBlock, 999)
      ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);

      await mineProofPeriodBlocks(activeProofPeriodStartBlock, RandomSamplingStorage);

      const { activeProofPeriodStartBlock: newPeriodStartBlock } = await updateAndGetActiveProofPeriod();
      const historicalPeriodStartBlock = await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
        newPeriodStartBlock,
        2
      );
      expect(historicalPeriodStartBlock).to.be.equal(
        newPeriodStartBlock - BigInt(proofingPeriodDurationInBlocks) * 2n
      );
    });

    it('Should return correct active proof period', async () => {
      const { activeProofPeriodStartBlock, isValid } = await updateAndGetActiveProofPeriod();
      expect(isValid).to.be.equal(true, 'Period should be valid');

      await mineProofPeriodBlocks(activeProofPeriodStartBlock, RandomSamplingStorage);

      let statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(false, 'Period should be valid');

      await updateAndGetActiveProofPeriod();
      await mineBlocks(Number(proofingPeriodDurationInBlocks) - 2);
      statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(true, 'Period should be valid');

      await mineBlocks(Number(proofingPeriodDurationInBlocks) * 20);
      statusAfterUpdate = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(false, 'Period should not be active');
    });

    it('Should pick correct proofing period duration based on epoch', async () => {
      let proofingPeriodDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(proofingPeriodDuration).to.be.equal(BigInt(proofingPeriodDurationInBlocks));

      await time.increase(Number(await Chronos.epochLength()) / 2);
      expect(proofingPeriodDuration).to.be.equal(BigInt(proofingPeriodDurationInBlocks));

      const newProofingPeriodDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newProofingPeriodDuration);
      proofingPeriodDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(proofingPeriodDuration).to.be.equal(proofingPeriodDuration);

      await time.increase(Number(await Chronos.epochLength()) + 1);

      proofingPeriodDuration = await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(proofingPeriodDuration).to.be.equal(BigInt(newProofingPeriodDuration));
    });

    it('Should return correct proofing period duration based on epoch history', async () => {
      const baseDuration = 100;
      const testEpochs = 3;

      const currentEpoch = await Chronos.getCurrentEpoch();

      for (let i = 0; i < testEpochs; i++) {
        const duration = baseDuration + i;
        await RandomSampling.setProofingPeriodDurationInBlocks(duration);
        await time.increase(Number(await Chronos.epochLength()));
      }

      const newEpoch = await Chronos.getCurrentEpoch();
      expect(newEpoch).to.equal(currentEpoch + BigInt(testEpochs));

      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(newEpoch - BigInt(testEpochs + 1))
      ).to.be.revertedWith('No applicable duration found');

      for (let i = 0; i < testEpochs; i++) {
        const targetEpoch = newEpoch - BigInt(i);
        const expectedDuration = baseDuration + (testEpochs - 1 - i);

        const actual = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(targetEpoch);
        expect(actual).to.equal(expectedDuration);
      }
    });

    it('Should return same block when no period has passed', async () => {
      const { activeProofPeriodStartBlock: initialBlock } = await updateAndGetActiveProofPeriod();
      
      // Mine blocks up to the last block of the current period
      await mineBlocks(Number(proofingPeriodDurationInBlocks) - 2);
      
      const tx = await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();
      const { activeProofPeriodStartBlock: newBlock } = await RandomSamplingStorage.getActiveProofPeriodStatus();
      
      // Should return the same block since we haven't reached the end of the period
      expect(newBlock).to.equal(initialBlock);

      // Mine one more block to reach the end of the period
      await mineBlocks(1);
      
      const tx2 = await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx2.wait();
      const { activeProofPeriodStartBlock: finalBlock } = await RandomSamplingStorage.getActiveProofPeriodStatus();
      
      // Should update the block since we've reached the end of the period
      expect(finalBlock).to.be.greaterThan(initialBlock);
    });
  });

  describe('Challenge Handling', () => {
    it('Should set and get challenge correctly', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Profile,
          KnowledgeCollection,
          Token,
        }
      );

      const signer = await ethers.getSigner(accounts[0].address);
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        MockChallenge
      );

      const challenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);

      expect(challenge.knowledgeCollectionId).to.be.equal(MockChallenge.knowledgeCollectionId);
      expect(challenge.chunkId).to.be.equal(MockChallenge.chunkId);
      expect(challenge.epoch).to.be.equal(MockChallenge.epoch);
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        MockChallenge.proofingPeriodDurationInBlocks
      );
      expect(challenge.activeProofPeriodStartBlock).to.be.equal(
        MockChallenge.activeProofPeriodStartBlock
      );
      expect(challenge.proofingPeriodDurationInBlocks).to.be.equal(
        MockChallenge.proofingPeriodDurationInBlocks
      );
      expect(challenge.solved).to.be.equal(MockChallenge.solved);
    });

    it('Should revert if challenge is not found', async () => {
      const invalidChallenge = [
        0n,
        0n,
        '0x0000000000000000000000000000000000000000',
        0n,
        0n,
        0n,
        false,
      ];
      const nodeChallenge: RandomSamplingLib.ChallengeStruct = await RandomSamplingStorage.getNodeChallenge(2);
      expect(nodeChallenge).to.be.deep.equal(invalidChallenge);
    });

    it('Should handle multiple challenges and updates correctly', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Profile,
          KnowledgeCollection,
          Token,
        }
      );

      const signer = await ethers.getSigner(accounts[0].address);

      // Test initial state
      const initialChallenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);
      expect(initialChallenge.solved).to.be.false;
      expect(initialChallenge.knowledgeCollectionId).to.be.equal(0n);

      // Set first challenge
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        MockChallenge
      );

      // Verify first challenge
      const firstChallenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);
      expect(firstChallenge.knowledgeCollectionId).to.be.equal(MockChallenge.knowledgeCollectionId);
      expect(firstChallenge.solved).to.be.equal(MockChallenge.solved);

      // Create and set second challenge
      const secondChallenge = {
        ...MockChallenge,
        knowledgeCollectionId: BigInt(MockChallenge.knowledgeCollectionId) + 1n,
        solved: true
      };
      await RandomSamplingStorage.connect(signer).setNodeChallenge(
        publishingNodeIdentityId,
        secondChallenge
      );

      // Verify second challenge overwrote first
      const finalChallenge = await RandomSamplingStorage.getNodeChallenge(publishingNodeIdentityId);
      expect(finalChallenge.knowledgeCollectionId).to.be.equal(secondChallenge.knowledgeCollectionId);
      expect(finalChallenge.solved).to.be.true;
      expect(finalChallenge.chunkId).to.be.equal(secondChallenge.chunkId);
    });
  });

  /*
    Test: incrementEpochNodeValidProofsCount and getEpochNodeValidProofsCount
    Assert increment logic over multiple epochs and nodes.
    Test: addToNodeScore correctly adds to individual and global scores
    Validate changes in both nodeEpochProofPeriodScore and allNodesEpochProofPeriodScore.
    Test: getEpochNodeDelegatorScore and addToEpochNodeDelegatorScore
    Confirm scores accumulate correctly per delegator key.
  */
  describe('Node Score System', () => {
    it('Should increment and get epoch node valid proofs count', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token }
      );

      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Test initial state
      expect(await RandomSamplingStorage.getEpochNodeValidProofsCount(currentEpoch, publishingNodeIdentityId)).to.equal(0n);

      // Increment and verify
      await RandomSamplingStorage.connect(signer).incrementEpochNodeValidProofsCount(currentEpoch, publishingNodeIdentityId);
      expect(await RandomSamplingStorage.getEpochNodeValidProofsCount(currentEpoch, publishingNodeIdentityId)).to.equal(1n);

      // Test next epoch
      await time.increase(Number(await Chronos.epochLength()));
      const nextEpoch = await Chronos.getCurrentEpoch();
      
      // Verify new epoch starts with 0
      expect(await RandomSamplingStorage.getEpochNodeValidProofsCount(nextEpoch, publishingNodeIdentityId)).to.equal(0n);
    });

    it('Should add to node score and update global scores', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token }
      );

      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const score = 100n;
      const proofPeriodIndex = 1n;

      // Test initial state
      expect(await RandomSamplingStorage.getNodeEpochProofPeriodScore(currentEpoch, publishingNodeIdentityId, proofPeriodIndex)).to.equal(0n);
      expect(await RandomSamplingStorage.allNodesEpochProofPeriodScore(currentEpoch, proofPeriodIndex)).to.equal(0n);

      // Add score and verify both individual and global scores
      await RandomSamplingStorage.connect(signer).addToNodeScore(currentEpoch, publishingNodeIdentityId, proofPeriodIndex, score);
      expect(await RandomSamplingStorage.getNodeEpochProofPeriodScore(currentEpoch, publishingNodeIdentityId, proofPeriodIndex)).to.equal(score);
      expect(await RandomSamplingStorage.allNodesEpochProofPeriodScore(currentEpoch, proofPeriodIndex)).to.equal(score);
    });

    it('Should accumulate delegator scores correctly', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const { publishingNodeIdentityId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token }
      );

      const signer = await ethers.getSigner(accounts[0].address);
      const currentEpoch = await Chronos.getCurrentEpoch();
      const delegatorKey = ethers.encodeBytes32String('delegator1');
      const score = 100n;

      // Test initial state
      expect(await RandomSamplingStorage.getEpochNodeDelegatorScore(currentEpoch, publishingNodeIdentityId, delegatorKey)).to.equal(0n);

      // Add score and verify accumulation
      await RandomSamplingStorage.connect(signer).addToEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        score
      );
      expect(await RandomSamplingStorage.getEpochNodeDelegatorScore(currentEpoch, publishingNodeIdentityId, delegatorKey)).to.equal(score);

      // Add more score and verify accumulation
      await RandomSamplingStorage.connect(signer).addToEpochNodeDelegatorScore(
        currentEpoch,
        publishingNodeIdentityId,
        delegatorKey,
        score
      );
      expect(await RandomSamplingStorage.getEpochNodeDelegatorScore(currentEpoch, publishingNodeIdentityId, delegatorKey)).to.equal(score * 2n);
    });
  });

  describe('Proofing Period Duration', () => {
    it('Should revert if no matching duration found', async () => {
      // Get current epoch
      const currentEpoch = await Chronos.getCurrentEpoch();
      
      // Add a new duration that will be effective in the next epoch
      const newDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(newDuration);
      
      // Move to next epoch
      await time.increase(Number(await Chronos.epochLength()));
      
      // Now try to get duration for an epoch before the first duration was set
      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(0n)
      ).to.be.revertedWith('No applicable duration found');
    });

    it('Should handle large number of proofing durations correctly', async () => {
      const baseDuration = 100;
      const numDurations = 50; // Large number of durations
      const currentEpoch = await Chronos.getCurrentEpoch();

      // Add multiple durations with different epochs
      for (let i = 0; i < numDurations; i++) {
        const duration = baseDuration + i;
        await RandomSamplingStorage.connect(await ethers.getSigner(accounts[0].address))
          .addProofingPeriodDuration(duration, currentEpoch + BigInt(i));
        await time.increase(Number(await Chronos.epochLength()));
      }

      // Verify each duration is accessible and correct
      for (let i = 0; i < numDurations; i++) {
        const targetEpoch = currentEpoch + BigInt(i);
        const expectedDuration = baseDuration + i;
        const actualDuration = await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(targetEpoch);
        expect(actualDuration).to.equal(expectedDuration);
      }
    });
  });
});
