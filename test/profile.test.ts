import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub, Profile, ProfileStorage, WhitelistStorage } from '../typechain';

type ProfileFixture = {
  accounts: SignerWithAddress[];
  Profile: Profile;
  ProfileStorage: ProfileStorage;
  WhitelistStorage: WhitelistStorage;
};

describe('Profile contract', function () {
  let accounts: SignerWithAddress[];
  let Hub: Hub;
  let Profile: Profile;
  let ProfileStorage: ProfileStorage;
  let WhitelistStorage: WhitelistStorage;
  const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
  const nodeId2 = '0x08f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb67';
  const identityId1 = 1;

  async function createProfile() {
    await expect(Profile.createProfile(accounts[0].address, nodeId1, 'Token', 'TKN'))
      .to.emit(Profile, 'ProfileCreated')
      .withArgs(identityId1, nodeId1);
  }

  async function deployProfileFixture(): Promise<ProfileFixture> {
    await hre.deployments.fixture(['Profile']);
    Profile = await hre.ethers.getContract<Profile>('Profile');
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    WhitelistStorage = await hre.ethers.getContract<WhitelistStorage>('WhitelistStorage');
    accounts = await hre.ethers.getSigners();
    Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Profile, ProfileStorage, WhitelistStorage };
  }

  beforeEach(async () => {
    ({ accounts, Profile, ProfileStorage, WhitelistStorage } = await loadFixture(deployProfileFixture));
  });

  it('The contract is named "Profile"', async function () {
    expect(await Profile.name()).to.equal('Profile');
  });

  it('The contract is version "1.0.1"', async function () {
    expect(await Profile.version()).to.equal('1.0.1');
  });

  it('Create a profile with whitelisted node, expect to pass', async () => {
    await createProfile();
  });

  it('Cannot create a profile with not whitelisted node, expect to fail', async () => {
    await WhitelistStorage.enableWhitelist();
    expect(await WhitelistStorage.whitelisted(accounts[0].address)).to.equal(false);

    await expect(Profile.createProfile(accounts[0].address, nodeId1, 'Token', 'TKN')).to.be.revertedWith(
      "Address isn't whitelisted",
    );
  });

  it('Should allow creating a profile (whitelist enabled) for node in the whitelist', async () => {
    await WhitelistStorage.enableWhitelist();
    await WhitelistStorage.whitelistAddress(accounts[0].address);
    expect(await WhitelistStorage.whitelisted(accounts[0].address)).to.equal(true);

    await createProfile();
  });

  it('Cannot create a profile with existing identity, expect to fail', async () => {
    await createProfile();

    await expect(Profile.createProfile(accounts[0].address, nodeId1, 'Token', 'TKN')).to.be.revertedWith(
      'Identity already exists',
    );
  });

  it('Cannot create a profile with registered nodeId, expect to fail', async () => {
    await createProfile();

    const ProfileWithAccount1 = await Profile.connect(accounts[1]);
    await expect(ProfileWithAccount1.createProfile(accounts[1].address, nodeId1, 'Token', 'TKN')).to.be.revertedWith(
      'Node ID is already registered',
    );
  });

  it('Cannot create a profile without nodeId, expect to fail', async () => {
    await expect(Profile.createProfile(accounts[0].address, '0x', 'Token', 'TKN')).to.be.revertedWith(
      "Node ID can't be empty",
    );
  });

  it('Cannot create a profile without tokenName, expect to fail', async () => {
    await expect(Profile.createProfile(accounts[0].address, nodeId1, '', 'TKN')).to.be.revertedWith(
      'Token name cannot be empty',
    );
  });

  it('Cannot create a profile without tokenName, expect to fail', async () => {
    await expect(Profile.createProfile(accounts[0].address, nodeId1, 'Token', '')).to.be.revertedWith(
      'Token symbol cannot be empty',
    );
  });

  it('Cannot create a profile with taken tokenName, expect to fail', async () => {
    await createProfile();

    const ProfileWithAccount1 = await Profile.connect(accounts[1]);
    await expect(ProfileWithAccount1.createProfile(accounts[1].address, nodeId2, 'Token', 'TKN')).to.be.revertedWith(
      'Token name is already taken',
    );
  });

  it('Cannot create a profile with taken tokenSymbol, expect to fail', async () => {
    await createProfile();

    const ProfileWithAccount1 = await Profile.connect(accounts[1]);
    await expect(ProfileWithAccount1.createProfile(accounts[1].address, nodeId2, 'Token 2', 'TKN')).to.be.revertedWith(
      'Token symbol is already taken',
    );
  });

  it('Set ask for a profile to be 0, expect to fail', async () => {
    await createProfile();

    await expect(Profile.setAsk(identityId1, 0)).to.be.revertedWith('Ask cannot be 0');
  });

  it('Set ask for a profile with non identity owner, expect to fail', async () => {
    await createProfile();

    const ProfileWithAccount1 = await Profile.connect(accounts[1]);
    await expect(ProfileWithAccount1.setAsk(identityId1, 1)).to.be.revertedWith('Fn can be used only by id owner');
  });

  it('Get and verify data for created profile, expect to pass', async () => {
    await createProfile();
    const sharesContractAddress = await ProfileStorage.getSharesContractAddress(identityId1);
    const profileData = await ProfileStorage.getProfile(identityId1);

    expect(profileData[0]).to.equal(nodeId1);
    expect(profileData[1][0]).to.equal(0);
    expect(profileData[1][1]).to.equal(0);
    expect(profileData[2]).to.equal(sharesContractAddress);
  });
});
