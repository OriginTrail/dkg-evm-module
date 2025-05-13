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
      Hub.target,
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

  describe('constructor', () => {
    it('Should set correct initial values', async () => {
      // Check initial values set in constructor
      expect(await RandomSampling.avgBlockTimeInSeconds()).to.equal(avgBlockTimeInSeconds);
      expect(await RandomSampling.w1()).to.equal(w1);
      expect(await RandomSampling.w2()).to.equal(w2);
    });

    it('Should revert if avgBlockTimeInSeconds is 0', async () => {
      const RandomSamplingFactory = await hre.ethers.getContractFactory('RandomSampling');
      await expect(
        RandomSamplingFactory.deploy(
          Hub.target,
          0,
          w1,
          w2
        )
      ).to.be.revertedWith('Average block time in seconds must be greater than 0');
    });

    it('Should set correct Hub reference', async () => {
      const hubAddress = await RandomSampling.hub();
      expect(hubAddress).to.equal(Hub.target);
    });
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

    it('Should revert if called by non-contract', async () => {
      await expect(
        RandomSampling.connect(accounts[1]).setProofingPeriodDurationInBlocks(100)
      ).to.be.revertedWithCustomError(RandomSampling, 'UnauthorizedAccess')
        .withArgs('Only Contracts in Hub');
    });
  });

  describe('setW1() and W1 getter', () => {
    it('Should update W1 correctly and revert for non-owners', async () => {
      // Test successful update by owner
      const newW1 = hre.ethers.parseUnits('2', 18);
      const oldW1 = await RandomSampling.w1();
      
      const tx = await RandomSampling.setW1(newW1);
      const receipt = await tx.wait();
      
      await expect(tx)
        .to.emit(RandomSampling, 'W1Updated')
        .withArgs(oldW1, newW1);
      
      expect(await RandomSampling.w1()).to.equal(newW1);

      // Test revert for non-owner
      await expect(RandomSampling.connect(accounts[1]).setW1(newW1))
        .to.be.revertedWithCustomError(RandomSampling, 'UnauthorizedAccess')
        .withArgs('Only Hub Owner');
    });
  });

  describe('setW2() and W2 getter', () => {
    it('Should update W2 correctly and revert for non-owners', async () => {
      // Test successful update by owner
      const newW2 = hre.ethers.parseUnits('3', 18);
      const oldW2 = await RandomSampling.w2();
      
      const tx = await RandomSampling.setW2(newW2);
      const receipt = await tx.wait();
      
      await expect(tx)
        .to.emit(RandomSampling, 'W2Updated')
        .withArgs(oldW2, newW2);
      
      expect(await RandomSampling.w2()).to.equal(newW2);

      // Test revert for non-owner
      await expect(RandomSampling.connect(accounts[1]).setW2(newW2))
        .to.be.revertedWithCustomError(RandomSampling, 'UnauthorizedAccess')
        .withArgs('Only Hub Owner');
    });
  });

  describe('setAvgBlockTimeInSeconds()', () => {
    it('Should update avgBlockTimeInSeconds and revert for non-owners', async () => {
      // Test successful update by owner
      const newAvg = 15;
      const tx = await RandomSampling.setAvgBlockTimeInSeconds(newAvg);
      const receipt = await tx.wait();
      
      await expect(tx)
        .to.emit(RandomSampling, 'AvgBlockTimeUpdated')
        .withArgs(newAvg);
      
      expect(await RandomSampling.avgBlockTimeInSeconds()).to.equal(newAvg);

      // Test revert for non-owner
      await expect(RandomSampling.connect(accounts[1]).setAvgBlockTimeInSeconds(newAvg))
        .to.be.revertedWithCustomError(RandomSampling, 'UnauthorizedAccess')
        .withArgs('Only Hub Owner');
    });

    it('Should revert if blockTimeInSeconds is 0', async () => {
      await expect(RandomSampling.setAvgBlockTimeInSeconds(0))
        .to.be.revertedWith('Block time in seconds must be greater than 0');
    });
  });
}); 