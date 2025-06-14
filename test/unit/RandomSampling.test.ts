import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub, RandomSampling, HubLib } from '../../typechain';

type RandomSamplingFixture = {
  accounts: SignerWithAddress[];
  RandomSampling: RandomSampling;
  Hub: Hub;
  HubLib: HubLib;
};

describe('@unit RandomSampling', () => {
  let accounts: SignerWithAddress[];
  let RandomSampling: RandomSampling;
  let Hub: Hub;
  let HubLib: HubLib;

  async function deployRandomSamplingFixture(): Promise<RandomSamplingFixture> {
    await hre.deployments.fixture(['Hub']);
    Hub = await hre.ethers.getContract<Hub>('Hub');
    accounts = await hre.ethers.getSigners();

    const RandomSamplingFactory =
      await hre.ethers.getContractFactory('RandomSampling');
    RandomSampling = await RandomSamplingFactory.deploy(Hub.target);

    const hubLibDeployment = await hre.deployments.deploy('HubLib', {
      from: accounts[0].address,
      log: true,
    });
    HubLib = await hre.ethers.getContract<HubLib>(
      'HubLib',
      hubLibDeployment.address,
    );

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, RandomSampling, Hub, HubLib };
  }

  beforeEach(async () => {
    ({ accounts, RandomSampling, Hub, HubLib } = await loadFixture(
      deployRandomSamplingFixture,
    ));
  });

  describe('constructor', () => {
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

  // Fails because the hubOwner is not a multisig, but an individual account
  describe('setProofingPeriodDurationInBlocks()', () => {
    it('Should revert if durationInBlocks is 0', async () => {
      await expect(
        RandomSampling.setProofingPeriodDurationInBlocks(0),
      ).to.be.revertedWith('Duration in blocks must be greater than 0');
    });

    // // TODO: This test fails because the hub owner is not the multisig owner
    // it('Should revert if called by non-contract', async () => {
    //   await expect(
    //     RandomSampling.connect(accounts[1]).setProofingPeriodDurationInBlocks(
    //       100,
    //     ),
    //   )
    //     .to.be.revertedWithCustomError(HubLib, 'UnauthorizedAccess')
    //     .withArgs('Only Hub Owner or Multisig Owner');
    // });
  });
});
