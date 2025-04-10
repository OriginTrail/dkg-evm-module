import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ContractTransactionResponse } from 'ethers';
import hre, { ethers } from 'hardhat';

import parameters from '../../deployments/parameters.json';
import {
  Hub,
  RandomSamplingStorage,
  Chronos,
  KnowledgeCollectionStorage,
} from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';
import {
  createMockChallenge,
  mineBlocks,
  mineProofPeriodBlocks,
} from '../helpers/random-sampling';

type RandomStorageFixture = {
  accounts: SignerWithAddress[];
  RandomSamplingStorage: RandomSamplingStorage;
  Hub: Hub;
  Chronos: Chronos;
};

const PANIC_ARITHMETIC_OVERFLOW = 0x11;

describe('@unit RandomSamplingStorage', function () {
  // let RandomSampling: RandomSampling;
  let RandomSamplingStorage: RandomSamplingStorage;
  let Hub: Hub;
  let accounts: SignerWithAddress[];
  const proofingPeriodDurationInBlocks =
    parameters.development.RandomSamplingStorage.proofingPeriodDurationInBlocks;
  let Chronos: Chronos;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let MockChallenge: RandomSamplingLib.ChallengeStruct;

  async function deployRandomSamplingFixture(): Promise<RandomStorageFixture> {
    await hre.deployments.fixture(['RandomSamplingStorage']);

    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await ethers.getSigners();
    Chronos = await hre.ethers.getContract<Chronos>('Chronos');
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSamplingStorage, Hub, Chronos };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ RandomSamplingStorage } = await loadFixture(
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

    // 1. Initialization tests
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

      // TODO: Test positive path - isContractAllowed contract can call this function
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

      //   await expect(
      //     RandomSamplingStorage.connect(
      //       accounts[1],
      //     ).incrementEpochNodeValidProofsCount(0, 0),
      //   )
      //     .to.be.revertedWithCustomError(
      //       RandomSamplingStorage,
      //       'UnauthorizedAccess',
      //     )
      //     .withArgs('Only Contracts in Hub');

      //   await expect(
      //     RandomSamplingStorage.connect(accounts[1]).addToNodeScore(0, 0, 0, 0),
      //   )
      //     .to.be.revertedWithCustomError(
      //       RandomSamplingStorage,
      //       'UnauthorizedAccess',
      //     )
      //     .withArgs('Only Contracts in Hub');

      //   await expect(
      //     RandomSamplingStorage.connect(accounts[1]).addToEpochNodeDelegatorScore(
      //       0,
      //       0,
      //       ethers.encodeBytes32String('0'),
      //       0,
      //     ),
      //   )
      //     .to.be.revertedWithCustomError(
      //       RandomSamplingStorage,
      //       'UnauthorizedAccess',
      //     )
      //     .withArgs('Only Contracts in Hub');
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
      const initialTx =
        await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
      await initialTx.wait();

      const initialStatus =
        await RandomSamplingStorage.getActiveProofPeriodStatus();
      const initialPeriodStartBlock = initialStatus.activeProofPeriodStartBlock;

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

    // it('Should update correctly when multiple full periods have passed', async () => {
    //   const PERIODS = 100;

    //   const initialTx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await initialTx.wait();

    //   let proofingPeriodDuration: bigint;
    //   for (let i = 1; i < PERIODS; i++) {
    //     const proofPeriodStatus =
    //       await RandomSamplingStorage.getActiveProofPeriodStatus();
    //     const periodStartBlock = proofPeriodStatus.activeProofPeriodStartBlock;

    //     proofingPeriodDuration = await mineProofPeriodBlocks(
    //       periodStartBlock,
    //       RandomSamplingStorage,
    //     );

    //     // Check if we get correct period back
    //     expect(proofingPeriodDuration).to.be.equal(
    //       BigInt(proofingPeriodDurationInBlocks) + 1n,
    //     );

    //     // Update and get the new active proof period
    //     const tx =
    //       await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //     await tx.wait();

    //     const statusAfterUpdate =
    //       await RandomSamplingStorage.getActiveProofPeriodStatus();
    //     const newPeriodStartBlock =
    //       statusAfterUpdate.activeProofPeriodStartBlock;

    //     expect(newPeriodStartBlock).to.be.greaterThan(periodStartBlock);
    //     expect(newPeriodStartBlock).to.be.equal(
    //       periodStartBlock + proofingPeriodDuration,
    //     );
    //     expect(
    //       (periodStartBlock + proofingPeriodDuration) / BigInt(i),
    //     ).to.be.equal(BigInt(proofingPeriodDurationInBlocks) + 1n);
    //   }
    // });

    // it('Should enforce +1 block gap between periods', async () => {
    //   let tx: ContractTransactionResponse;
    //   let statusAfterUpdate: RandomSamplingLib.ProofPeriodStatusStructOutput;
    //   let newPeriodStartBlock: bigint;

    //   const initialTx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await initialTx.wait();

    //   const initialStatus =
    //     await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   const initialPeriodStartBlock = initialStatus.activeProofPeriodStartBlock;

    //   const currentBlock = await ethers.provider.getBlockNumber();

    //   const diff = Number(proofingPeriodDurationInBlocks) - currentBlock;

    //   // Mine one block less than the proofing period duration
    //   await mineBlocks(diff - 1);

    //   tx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   tx.wait();

    //   statusAfterUpdate =
    //     await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   newPeriodStartBlock = statusAfterUpdate.activeProofPeriodStartBlock;

    //   // Should still be equal to the initial one
    //   expect(newPeriodStartBlock).to.be.equal(initialPeriodStartBlock);

    //   // Move another block
    //   await mineBlocks(1);

    //   tx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await tx.wait();

    //   statusAfterUpdate =
    //     await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   newPeriodStartBlock = statusAfterUpdate.activeProofPeriodStartBlock;

    //   expect(newPeriodStartBlock).to.be.greaterThan(initialPeriodStartBlock);
    //   expect(newPeriodStartBlock).to.be.equal(
    //     initialPeriodStartBlock + BigInt(proofingPeriodDurationInBlocks) + 1n,
    //   );
    // });

    // it('Should return correct historical proofing period start', async () => {
    //   // Update to current block
    //   await mineProofPeriodBlocks(100n, RandomSamplingStorage);

    //   let tx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await tx.wait();

    //   let status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   let periodStartBlock = status.activeProofPeriodStartBlock;

    //   await expect(
    //     RandomSamplingStorage.getHistoricalProofPeriodStartBlock(0, 1),
    //   ).to.be.revertedWith('Proof period start block must be greater than 0');
    //   await expect(
    //     RandomSamplingStorage.getHistoricalProofPeriodStartBlock(102, 1),
    //   ).to.be.revertedWith('Proof period start block is not valid');
    //   await expect(
    //     RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
    //       periodStartBlock,
    //       999,
    //     ),
    //   ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);

    //   await mineProofPeriodBlocks(periodStartBlock, RandomSamplingStorage);
    //   tx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await tx.wait();

    //   status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   periodStartBlock = status.activeProofPeriodStartBlock;

    //   const historicalPeriodStartBlock =
    //     await RandomSamplingStorage.getHistoricalProofPeriodStartBlock(
    //       periodStartBlock,
    //       2,
    //     );

    //   expect(historicalPeriodStartBlock).to.be.equal(
    //     periodStartBlock - BigInt(proofingPeriodDurationInBlocks) * 2n - 2n,
    //   );
    // });

    // it('Should return correct active proof period', async () => {
    //   let tx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await tx.wait();

    //   let status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   let periodStartBlock = status.activeProofPeriodStartBlock;

    //   expect(status.isValid).to.be.equal(true, 'Active period should be valid');

    //   await mineProofPeriodBlocks(periodStartBlock, RandomSamplingStorage);

    //   status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    //   periodStartBlock = status.activeProofPeriodStartBlock;

    //   tx =
    //     await RandomSamplingStorage.updateAndGetActiveProofPeriodStartBlock();
    //   await tx.wait();

    //   expect(status.isValid).to.be.equal(
    //     false,
    //     'Active period should be valid',
    //   );

    // status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    // periodStartBlock = status.activeProofPeriodStartBlock;

    // expect(status.isValid).to.be.equal(true, 'Active period should be valid');
    // // Mine a few blocks
    // mineBlocks(Number(proofingPeriodDuration - 10n));
    // status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    // periodStartBlock = status.activeProofPeriodStartBlock;

    // expect(status.isValid).to.be.equal(true, 'Active period should be valid');
    // mineBlocks(Number(proofingPeriodDuration));

    // status = await RandomSamplingStorage.getActiveProofPeriodStatus();
    // periodStartBlock = status.activeProofPeriodStartBlock;

    // console.log(status.isValid);

    // // Now should be invalid
    // expect(status.isValid).to.be.equal(false, 'Period should not be active');
    // });
  });
});
