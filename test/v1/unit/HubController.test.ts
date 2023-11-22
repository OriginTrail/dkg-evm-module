import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { HubController, Profile } from '../../../typechain';
import { GeneralStructs } from '../../../typechain/contracts/v1/HubController';

type HubControllerFixture = {
  accounts: SignerWithAddress[];
  HubController: HubController;
  Profile: Profile;
};

describe('@v1 @unit HubController contract', function () {
  let accounts: SignerWithAddress[];
  let HubController: HubController;
  let Profile: Profile;

  async function deployHubControllerFixture(): Promise<HubControllerFixture> {
    await hre.deployments.fixture(['Profile', 'HashingProxy', 'ScoringProxy']);
    HubController = await hre.ethers.getContract<HubController>('HubController');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    accounts = await hre.ethers.getSigners();

    return { accounts, HubController, Profile };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, HubController } = await loadFixture(deployHubControllerFixture));
  });

  it('Should deploy successfully with correct initial parameters', async function () {
    expect(await HubController.name()).to.equal('HubController');
    expect(await HubController.version()).to.equal('1.0.1');
  });

  it('New Profile contract set in the Hub through the HubController; Expect status for old Profile to be false, status for the new Profile to be true', async function () {
    expect(await Profile.status()).to.be.true;

    const newProfile = await hre.helpers.deploy({
      newContractName: 'Profile',
      setContractInHub: false,
      setAssetStorageInHub: false,
      deterministicDeployment: true,
    });

    const newProfileStruct: GeneralStructs.ContractStruct = {
      name: 'Profile',
      addr: newProfile.address,
    };
    await HubController.setAndReinitializeContracts([newProfileStruct], [], [newProfile.address], [], [], []);

    expect(await Profile.status()).to.be.false;
    expect(await newProfile.status()).to.be.true;
  });
});
