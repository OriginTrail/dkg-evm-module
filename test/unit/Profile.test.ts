import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Profile, WhitelistStorage } from '../../typechain';

type ProfileFixture = {
  accounts: SignerWithAddress[];
  Profile: Profile;
  WhitelistStorage: WhitelistStorage;
};

describe('@unit Profile contract', function () {
  let accounts: SignerWithAddress[];
  let Profile: Profile;
  let WhitelistStorage: WhitelistStorage;

  const nodeId1 =
    '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
  const identityId1 = 1;

  async function deployProfileFixture(): Promise<ProfileFixture> {
    await hre.deployments.fixture(['Profile']);

    accounts = await hre.ethers.getSigners();
    Profile = await hre.ethers.getContract<Profile>('Profile');
    WhitelistStorage =
      await hre.ethers.getContract<WhitelistStorage>('WhitelistStorage');

    return {
      accounts,
      Profile,
      WhitelistStorage,
    };
  }

  beforeEach(async () => {
    ({ accounts, Profile, WhitelistStorage } =
      await loadFixture(deployProfileFixture));
  });

  it('The contract is named "Profile"', async () => {
    expect(await Profile.name()).to.equal('Profile');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await Profile.version()).to.equal('1.0.0');
  });

  it('Create a profile with valid inputs, expect to pass', async () => {
    await expect(
      Profile.createProfile(accounts[1].address, [], 'Node 1', nodeId1, 1000),
    ).to.not.be.reverted;
  });

  it('Cannot create a profile with empty node name, expect to fail', async () => {
    await expect(
      Profile.createProfile(accounts[1].address, [], '', nodeId1, 1000),
    ).to.be.revertedWithCustomError(Profile, 'EmptyNodeName');
  });

  it('Cannot create a profile with empty node ID, expect to fail', async () => {
    await expect(
      Profile.createProfile(accounts[1].address, [], 'Node 1', '0x', 1000),
    ).to.be.revertedWithCustomError(Profile, 'EmptyNodeId');
  });

  it('Cannot create a profile with node ID already taken, expect to fail', async () => {
    await Profile.createProfile(
      accounts[1].address,
      [],
      'Node 1',
      nodeId1,
      1000,
    );

    await expect(
      Profile.connect(accounts[3]).createProfile(
        accounts[2].address,
        [],
        'Node 2',
        nodeId1,
        1000,
      ),
    ).to.be.revertedWithCustomError(Profile, 'NodeIdAlreadyExists');
  });

  it('Cannot create a profile with operator fee greater than 10000, expect to fail', async () => {
    await expect(
      Profile.createProfile(accounts[1].address, [], 'Node 1', nodeId1, 10001),
    ).to.be.revertedWithCustomError(Profile, 'OperatorFeeOutOfRange');
  });

  it('Update ask for a profile with valid input, expect to pass', async () => {
    await Profile.createProfile(
      accounts[1].address,
      [],
      'Node 1',
      nodeId1,
      1000,
    );

    await expect(Profile.updateAsk(identityId1, 2000)).to.not.be.reverted;
  });

  it('Update ask with zero value, expect to fail', async () => {
    await Profile.createProfile(
      accounts[1].address,
      [],
      'Node 1',
      nodeId1,
      1000,
    );

    await expect(
      Profile.connect(accounts[1]).updateAsk(identityId1, 0),
    ).to.be.revertedWithCustomError(Profile, 'ZeroAsk');
  });

  it('Update operator fee with valid input, expect to pass', async () => {
    await Profile.createProfile(
      accounts[1].address,
      [],
      'Node 1',
      nodeId1,
      1000,
    );

    await expect(
      Profile.connect(accounts[1]).updateOperatorFee(identityId1, 500),
    ).to.not.be.reverted;
  });

  it('Update operator fee with value greater than 10000, expect to fail', async () => {
    await Profile.createProfile(
      accounts[1].address,
      [],
      'Node 1',
      nodeId1,
      1000,
    );

    await expect(
      Profile.connect(accounts[1]).updateOperatorFee(identityId1, 10001),
    ).to.be.revertedWithCustomError(Profile, 'InvalidOperatorFee');
  });

  it('Cannot update ask during cooldown, expect to fail', async () => {
    await Profile.createProfile(
      accounts[1].address,
      [],
      'Node 1',
      nodeId1,
      1000,
    );
    await Profile.connect(accounts[1]).updateAsk(identityId1, 2000);

    await expect(
      Profile.connect(accounts[1]).updateAsk(identityId1, 3000),
    ).to.be.revertedWithCustomError(Profile, 'AskUpdateOnCooldown');
  });

  it('Whitelist check prevents unauthorized profile creation, expect to fail', async () => {
    await WhitelistStorage.enableWhitelist();

    await expect(
      Profile.createProfile(accounts[1].address, [], 'Node 1', nodeId1, 1000),
    ).to.be.revertedWithCustomError(
      Profile,
      'OnlyWhitelistedAddressesFunction',
    );
  });
});
