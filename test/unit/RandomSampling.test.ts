import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub, RandomSampling } from '../../typechain';

type RandomSamplingFixture = {
  accounts: SignerWithAddress[];
  RandomSampling: RandomSampling;
  Hub: Hub;
  avgBlockTimeInSeconds: number;
  w1: bigint;
  w2: bigint;
};

describe('@unit RandomSampling', () => {
  let accounts: SignerWithAddress[];
  let RandomSampling: RandomSampling;
  let Hub: Hub;
  let avgBlockTimeInSeconds: number;
  let w1: bigint;
  let w2: bigint;

  async function deployRandomSamplingFixture(): Promise<RandomSamplingFixture> {
    await hre.deployments.fixture(['Hub']);
    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await hre.ethers.getSigners();
    
    avgBlockTimeInSeconds = 12;
    w1 = hre.ethers.parseUnits('1', 18);
    w2 = hre.ethers.parseUnits('1', 18);

    const RandomSamplingFactory = await hre.ethers.getContractFactory('RandomSampling');
    RandomSampling = await RandomSamplingFactory.deploy(
      Hub.target, // use actual hub address
      avgBlockTimeInSeconds,
      w1,
      w2
    );
    
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSampling, Hub, avgBlockTimeInSeconds, w1, w2 };
  }

  beforeEach(async () => {
    ({ accounts, RandomSampling, Hub, avgBlockTimeInSeconds, w1, w2 } = await loadFixture(deployRandomSamplingFixture));
  });

  describe('name()', () => {
    it('Should return correct name', async () => {
      expect(await RandomSampling.name()).to.equal('RandomSampling');
    });
  });

  describe('version()', () => {
    it('Should return correct version', async () => {
      expect(await RandomSampling.version()).to.equal('1.0.0');
    });
  });

  describe('setProofingPeriodDurationInBlocks()', () => {
    it('Should revert if durationInBlocks is 0', async () => {
      await expect(
        RandomSampling.setProofingPeriodDurationInBlocks(0)
      ).to.be.revertedWith('Duration in blocks must be greater than 0');
    });
  });

  describe('setW1() and W1 getter', () => {
    it('Should update W1 correctly', async () => {
      const newW1 = hre.ethers.parseUnits('2', 18);
      await RandomSampling.setW1(newW1);
      expect(await RandomSampling.w1()).to.equal(newW1);
    });
  });

  describe('setW2() and W2 getter', () => {
    it('Should update W2 correctly', async () => {
      const newW2 = hre.ethers.parseUnits('3', 18);
      await RandomSampling.setW2(newW2);
      expect(await RandomSampling.w2()).to.equal(newW2);
    });
  });

  describe('setAvgBlockTimeInSeconds()', () => {
    it('Should update avgBlockTimeInSeconds and emit event', async () => {
      const newAvg = 15;
      await expect(RandomSampling.setAvgBlockTimeInSeconds(newAvg))
        .to.emit(RandomSampling, 'AvgBlockTimeUpdated')
        .withArgs(newAvg);

      expect(await RandomSampling.avgBlockTimeInSeconds()).to.equal(newAvg);
    });
  });
}); 