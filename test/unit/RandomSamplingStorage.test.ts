import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import parameters from '../../deployments/parameters.json';
import { Hub, RandomSamplingStorage, Chronos } from '../../typechain';
import { RandomSamplingLib } from '../../typechain/contracts/storage/RandomSamplingStorage';
import { createMockChallenge } from '../helpers/random-sampling';

type RandomStorageFixture = {
  accounts: SignerWithAddress[];
  RandomSamplingStorage: RandomSamplingStorage;
  Hub: Hub;
  Chronos: Chronos;
};

describe('@unit RandomSamplingStorage', function () {
  // let RandomSampling: RandomSampling;
  let RandomSamplingStorage: RandomSamplingStorage;
  let Hub: Hub;
  let accounts: SignerWithAddress[];
  const proofingPeriodDurationInBlocks =
    parameters.development.RandomSamplingStorage.proofingPeriodDurationInBlocks;
  let Chronos: Chronos;
  let MockChallenge: RandomSamplingLib.ChallengeStruct;

  async function deployRandomSamplingFixture(): Promise<RandomStorageFixture> {
    await hre.deployments.fixture(['RandomSamplingStorage']);

    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await ethers.getSigners();
    Chronos = await hre.ethers.getContract<Chronos>('Chronos');
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSamplingStorage, Hub, Chronos };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ RandomSamplingStorage } = await loadFixture(
      deployRandomSamplingFixture,
    ));

    MockChallenge = await createMockChallenge(RandomSamplingStorage, Chronos);
  });

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

  // 2. Access tests
  it('Should revert contact call if not called by Hub', async () => {
    await expect(RandomSamplingStorage.connect(accounts[1]).initialize())
      .to.be.revertedWithCustomError(
        RandomSamplingStorage,
        'UnauthorizedAccess',
      )
      .withArgs('Only Hub');
  });

  it('Should revert contact call if not called by other Contracts', async () => {
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
