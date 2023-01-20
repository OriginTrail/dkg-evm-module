import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub, ProfileStorage } from '../typechain';

type ProfileStorageFixture = {
  accounts: SignerWithAddress[];
  ProfileStorage: ProfileStorage;
};

describe('ProfileStorage contract', function () {
  let accounts: SignerWithAddress[];
  let ProfileStorage: ProfileStorage;

  async function deployProfileStorageFixture(): Promise<ProfileStorageFixture> {
    await hre.deployments.fixture(['ProfileStorage']);
    const ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    const accounts = await hre.ethers.getSigners();
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ProfileStorage };
  }

  beforeEach(async () => {
    ({ accounts, ProfileStorage } = await loadFixture(deployProfileStorageFixture));
  });

  it('The contract is named "ProfileStorage"', async function () {
    expect(await ProfileStorage.name()).to.equal('ProfileStorage');
  });

  it('The contract is version "1.0.0"', async function () {
    expect(await ProfileStorage.version()).to.equal('1.0.0');
  });

  it('Should allow creating and getting a profile', async () => {
    const identityId = 1;
    const nodeId = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const SharesContract = await hre.ethers.getContractFactory('Shares');
    const Shares = await SharesContract.deploy(accounts[0].address, 'Token1', 'TKN1');
    await Shares.deployed();
    await ProfileStorage.createProfile(identityId, nodeId, Shares.address);

    const profileData = await ProfileStorage.getProfile(identityId);

    expect(profileData[0]).to.be.equal(nodeId);
    expect(profileData[1][0]).to.be.equal(0);
    expect(profileData[1][1]).to.be.equal(0);
    expect(profileData[2]).to.be.equal(Shares.address);
  });
});
