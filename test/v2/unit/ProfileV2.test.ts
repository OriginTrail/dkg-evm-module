import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { HubController, ParametersStorage, ProfileStorage, ProfileV2 } from '../../../typechain';

type ProfileV2Fixture = {
  accounts: SignerWithAddress[];
  HubController: HubController;
  ProfileV2: ProfileV2;
  ProfileStorage: ProfileStorage;
  ParametersStorage: ParametersStorage;
};

describe('@v2 @unit ProfileV2 contract', function () {
  let accounts: SignerWithAddress[];
  let HubController: HubController;
  let ProfileV2: ProfileV2;
  let ProfileStorage: ProfileStorage;
  let ParametersStorage: ParametersStorage;

  const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
  const nodeId2 = '0x08f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb67';

  async function createProfile(adminWallet: string, operationalWallets: string[]) {
    await expect(
      ProfileV2.connect(accounts[0]).createProfile(adminWallet, operationalWallets, nodeId1, 'Token', 'TKN', 0),
    ).to.emit(ProfileV2, 'ProfileCreated');
  }

  async function deployProfileFixture(): Promise<ProfileV2Fixture> {
    await hre.deployments.fixture(['IdentityStorageV2', 'ProfileV2']);
    ProfileV2 = await hre.ethers.getContract<ProfileV2>('Profile');
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    accounts = await hre.ethers.getSigners();
    HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, HubController, ProfileV2, ProfileStorage, ParametersStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, HubController, ProfileV2, ProfileStorage, ParametersStorage } = await loadFixture(
      deployProfileFixture,
    ));
  });

  it('The contract is named "Profile"', async () => {
    expect(await ProfileV2.name()).to.equal('Profile');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await ProfileV2.version()).to.equal('2.0.0');
  });

  it('Cannot create a profile with existing identity, expect to fail', async () => {
    await createProfile(accounts[1].address, [accounts[2].address]);

    await expect(
      ProfileV2.createProfile(accounts[3].address, [accounts[4].address], nodeId1, 'Token', 'TKN', 0),
    ).to.be.revertedWithCustomError(ProfileV2, 'IdentityAlreadyExists');
  });

  it('Cannot create a profile with msg.sender in operational wallets array, expect to fail', async () => {
    await expect(
      ProfileV2.createProfile(accounts[1].address, [accounts[0].address], nodeId1, 'Token', 'TKN', 0),
    ).to.be.revertedWith('Operational key is taken');
  });

  it('Cannot create a profile with existing operational wallet in the array, expect to fail', async () => {
    await createProfile(accounts[1].address, [accounts[2].address]);

    await expect(
      ProfileV2.connect(accounts[3]).createProfile(
        accounts[4].address,
        [accounts[2].address],
        nodeId2,
        'Token123',
        'TKN123',
        0,
      ),
    ).to.be.revertedWith('Operational key is taken');
  });

  it('Cannot create a profile with too many operational wallets, expect to fail', async () => {
    const opWalletsLimit = await ParametersStorage.opWalletsLimitOnProfileCreation();

    await expect(
      ProfileV2.createProfile(
        accounts[0].address,
        accounts.slice(2, 2 + opWalletsLimit + 1).map((acc) => acc.address),
        nodeId1,
        'Token',
        'TKN',
        0,
      ),
    )
      .to.be.revertedWithCustomError(ProfileV2, 'TooManyOperationalWallets')
      .withArgs(opWalletsLimit, opWalletsLimit + 1);
  });
});
