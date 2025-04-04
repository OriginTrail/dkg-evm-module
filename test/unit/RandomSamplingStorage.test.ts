import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

import { Hub, RandomSamplingStorage } from '../../typechain';
import { RandomSampling } from '../../typechain/contracts/RandomSampling';

type RandomStorageFixture = {
  accounts: SignerWithAddress[];
  RandomSamplingStorage: RandomSamplingStorage;
  Hub: Hub;
};

describe('@unit RandomSamplingStorage', function () {
  let RandomSampling: RandomSampling;
  let RandomSamplingStorage: RandomSamplingStorage;
  let Hub: Hub;
  let accounts: SignerWithAddress[];

  async function deployRandomSamplingFixture(): Promise<RandomStorageFixture> {
    await hre.deployments.fixture(['RandomSamplingStorage']);
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
      'RandomSamplingStorage',
    );
    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await hre.ethers.getSigners();
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSamplingStorage, Hub };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ RandomSamplingStorage } = await loadFixture(
      deployRandomSamplingFixture,
    ));

    const RandomSamplingFactory =
      await ethers.getContractFactory('RandomSampling');
    RandomSampling = await RandomSamplingFactory.deploy(
      accounts[0].address,
      64,
    );
  });

  it('Should have correct name and version', async () => {
    expect(await RandomSamplingStorage.name()).to.equal(
      'RandomSamplingStorage',
    );
    expect(await RandomSamplingStorage.version()).to.equal('1.0.0');
  });

  it('Should set correct period duration', async () => {
    await RandomSamplingStorage.setProofingPeriodDurationInBlocks(128);
    expect(
      await RandomSamplingStorage.proofingPeriodDurationInBlocks(),
    ).to.equal(128);
  });

  it('Should set correct challenge for node', async () => {
    RandomSamplingStorage = await hre.ethers.getContract<RandomSamplingStorage>(
    // const storageChallenge = await RandomSamplingStorage.getNodeChallenge(
    //   accounts[0].address,
    // );
    // expect(storageChallenge).to.equal(challenge);
  });
});
