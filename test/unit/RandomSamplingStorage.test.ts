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
      expect(await RandomSamplingStorage.name()).to.equal(
        'RandomSamplingStorage',
      );
      expect(await RandomSamplingStorage.version()).to.equal('1.0.0');
    });

    it('Should set the initial parameters correctly', async function () {
      const proofingPeriod =
        await RandomSamplingStorage.proofingPeriodDurations(0);

      expect(proofingPeriod.durationInBlocks).to.equal(
        proofingPeriodDurationInBlocks,
      );

      const currentEpochTx = await Chronos.getCurrentEpoch();
      const currentEpoch = BigInt(currentEpochTx.toString());
      expect(proofingPeriod.effectiveEpoch).to.equal(currentEpoch);
    });
  });

  describe('Access Control', () => {
    // 2. Access tests
    it('Should revert contact call if not called by Hub', async () => {
      await expect(RandomSamplingStorage.connect(accounts[1]).initialize())
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Hub');
    });

    it('Should revert contact call on onlyContract modifiers', async () => {
      await expect(
        RandomSamplingStorage.connect(
          accounts[1],
        ).replacePendingProofingPeriodDuration(0, 0),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addProofingPeriodDuration(
          0,
          0,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).setNodeChallenge(
          0,
          MockChallenge,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(
          accounts[1],
        ).incrementEpochNodeValidProofsCount(0, 0),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToNodeScore(0, 0, 0, 0),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');

      await expect(
        RandomSamplingStorage.connect(accounts[1]).addToEpochNodeDelegatorScore(
          0,
          0,
          ethers.encodeBytes32String('0'),
          0,
        ),
      )
        .to.be.revertedWithCustomError(
          RandomSamplingStorage,
          'UnauthorizedAccess',
        )
        .withArgs('Only Contracts in Hub');
    });
  });

  describe('Proofing Period Management', () => {
    it('Should return the correct proofing period status', async () => {
      const status = await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(status.activeProofPeriodStartBlock).to.be.a('bigint');
      expect(status.isValid).to.be.a('boolean');
    });
    it('Should update start block after one full proofing period (duration + 1)', async () => {
      // Get initial active proof period using a view function
      const { activeProofPeriodStartBlock: initialPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();

      const proofingPeriodDuration: bigint = await mineProofPeriodBlocks(
        initialPeriodStartBlock,
        RandomSamplingStorage,
      );
      expect(proofingPeriodDuration).to.be.equal(
        proofingPeriodDurationInBlocks,
      );
      // Update and get the new active proof period
      const tx =
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await tx.wait();
      const statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      const newPeriodStartBlock = statusAfterUpdate.activeProofPeriodStartBlock;
      // The new period should be different from the initial one
      expect(newPeriodStartBlock).to.be.greaterThan(initialPeriodStartBlock);
      expect(newPeriodStartBlock).to.be.equal(
        initialPeriodStartBlock + proofingPeriodDuration,
      );
    });
    it('Should update correctly when multiple full periods have passed', async () => {
      const PERIODS = 100;
      const { activeProofPeriodStartBlock: initialPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();

      let proofingPeriodDuration: bigint;
      for (let i = 1; i < PERIODS; i++) {
        const proofPeriodStatus =
          await RandomSamplingStorage.getActiveProofPeriodStatus();
        const periodStartBlock = proofPeriodStatus.activeProofPeriodStartBlock;
        proofingPeriodDuration = await mineProofPeriodBlocks(
          periodStartBlock,
          RandomSamplingStorage,
        );
        // Check if we get correct period back
        expect(proofingPeriodDuration).to.be.equal(
          BigInt(proofingPeriodDurationInBlocks),
        );
        // Update and get the new active proof period
        const { activeProofPeriodStartBlock: newPeriodStartBlock } =
          await updateAndGetActiveProofPeriod();
        expect(newPeriodStartBlock).to.be.greaterThan(periodStartBlock);
        expect(newPeriodStartBlock).to.be.equal(
          periodStartBlock + proofingPeriodDuration,
        );
        expect(
          (newPeriodStartBlock - initialPeriodStartBlock) / BigInt(i),
        ).to.be.equal(proofingPeriodDuration);
      }
    });

    it('Should return correct historical proofing period start', async () => {
      const { activeProofPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();

      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(0, 1),
      ).to.be.revertedWith('Proof period start block must be greater than 0');
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(100, 0),
      ).to.be.revertedWith('Offset must be greater than 0');
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          activeProofPeriodStartBlock + 10n,
          1,
        ),
      ).to.be.revertedWith('Proof period start block is not valid');
      await expect(
        RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          activeProofPeriodStartBlock,
          999,
        ),
      ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);

      await mineProofPeriodBlocks(
        activeProofPeriodStartBlock,
        RandomSamplingStorage,
      );

      const { activeProofPeriodStartBlock: newPeriodStartBlock } =
        await updateAndGetActiveProofPeriod();
      const historicalPeriodStartBlock =
        await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
          newPeriodStartBlock,
          2,
        );
      expect(historicalPeriodStartBlock).to.be.equal(
        newPeriodStartBlock - BigInt(proofingPeriodDurationInBlocks) * 2n,
      );
    });

    it('Should return correct active proof period', async () => {
      const { activeProofPeriodStartBlock, isValid } =
        await updateAndGetActiveProofPeriod();

      expect(isValid).to.be.equal(true, 'Period should be valid');

      await mineProofPeriodBlocks(
        activeProofPeriodStartBlock,
        RandomSamplingStorage,
      );

      let statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(
        false,
        'Period should be valid',
      );

      await updateAndGetActiveProofPeriod();
      await mineBlocks(Number(proofingPeriodDurationInBlocks) - 2);
      statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(
        true,
        'Period should be valid',
      );

      await mineBlocks(Number(proofingPeriodDurationInBlocks) * 20);
      statusAfterUpdate =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      expect(statusAfterUpdate.isValid).to.be.equal(
        false,
        'Period should not be active',
      );
    });

    it('Should pick correct proofing period duration based on epoch', async () => {
      let proofingPeriodDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(proofingPeriodDuration).to.be.equal(
        BigInt(proofingPeriodDurationInBlocks),
      );

      // Increase time half of the next epoch
      await time.increase(Number(await Chronos.epochLength()) / 2);
      // Should still pick the same proofing period duration
      expect(proofingPeriodDuration).to.be.equal(
        BigInt(proofingPeriodDurationInBlocks),
      );

      // Set new proofing period duration for the new epoch
      const newProofingPeriodDuration = 1000;
      await RandomSampling.setProofingPeriodDurationInBlocks(
        newProofingPeriodDuration,
      );
      proofingPeriodDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(proofingPeriodDuration).to.be.equal(proofingPeriodDuration);

      // Increate time to the next epoch
      await time.increase(Number(await Chronos.epochLength()) + 1);

      // Should now be able to pick new proofing period duration
      proofingPeriodDuration =
        await RandomSamplingStorage.getActiveProofingPeriodDurationInBlocks();
      expect(proofingPeriodDuration).to.be.equal(
        BigInt(newProofingPeriodDuration),
      );
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

      // go back before any effectiveEpoch
      await expect(
        RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
          newEpoch - BigInt(testEpochs + 1),
        ),
      ).to.be.revertedWith('No applicable duration found');

      for (let i = 0; i < testEpochs; i++) {
        const targetEpoch = newEpoch - BigInt(i);
        const expectedDuration = baseDuration + (testEpochs - 1 - i);

        const actual =
          await RandomSamplingStorage.getEpochProofingPeriodDurationInBlocks(
            targetEpoch,
          );

        expect(actual).to.equal(expectedDuration);
      }
    });
  });

  // await expect(RandomSamplingStorage.connect(accounts[1]).initialize())
  describe('Challenge Handling', async () => {
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
      },
    );

    it('Should set and get challenge correctly', async () => {
      const challenge = await RandomSampling.connect(
        publishingNode.operational,
      ).createChallenge();
      const nodeChallenge = await RandomSamplingStorage.getNodeChallenge(
        publishingNodeIdentityId,
      );

      expect(challenge).to.deep.equal(nodeChallenge);
    });

    it('Should revert if challenge is not found', async () => {
      await expect(
        RandomSamplingStorage.getNodeChallenge(1),
      ).to.be.revertedWithCustomError(
        RandomSamplingStorage,
        'ChallengeNotFound',
      );
    });
  });
});
