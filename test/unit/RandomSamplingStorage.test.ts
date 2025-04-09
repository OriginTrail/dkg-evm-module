import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import parameters from '../../deployments/parameters.json';
import { Hub, RandomSamplingStorage, Chronos } from '../../typechain';

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
  });

  it('Should have correct name and version', async () => {
    expect(await RandomSamplingStorage.name()).to.equal(
      'RandomSamplingStorage',
    );
    expect(await RandomSamplingStorage.version()).to.equal('1.0.0');
  });

  /** 1. Initialization TESTS **/
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
