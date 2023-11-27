import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub, HubController, Profile } from '../../../typechain';
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
    await HubController.setAndReinitializeContracts([newProfileStruct], [], [], [], [newProfile.address], []);

    expect(await Profile.status()).to.be.false;
    expect(await newProfile.status()).to.be.true;
  });

  it('Set new HashProxy/ScoringProxy and hash/score functions in the Hub using HubController; Expect to be successful', async () => {
    await hre.deployments.fixture(['Hub', 'ParametersStorage']);

    const Hub = await hre.ethers.getContract<Hub>('Hub');
    HubController = await hre.ethers.getContract<HubController>('HubController');

    const HashingProxy = await hre.helpers.deploy({
      newContractName: 'HashingProxy',
      setContractInHub: false,
    });
    const ScoringProxy = await hre.helpers.deploy({
      newContractName: 'ScoringProxy',
      setContractInHub: false,
    });

    const SHA256 = await hre.helpers.deploy({
      newContractName: 'SHA256',
      passHubInConstructor: false,
      setContractInHub: false,
    });
    const Log2PLDSF = await hre.helpers.deploy({
      newContractName: 'Log2PLDSF',
      setContractInHub: false,
    });

    const newHashingProxyStruct: GeneralStructs.ContractStruct = {
      name: 'HashingProxy',
      addr: HashingProxy.address,
    };
    const newScoringProxyStruct: GeneralStructs.ContractStruct = {
      name: 'ScoringProxy',
      addr: ScoringProxy.address,
    };

    const tx = HubController.setAndReinitializeContracts(
      [newHashingProxyStruct, newScoringProxyStruct],
      [],
      [SHA256.address],
      [Log2PLDSF.address],
      [Log2PLDSF.address],
      [],
    );

    await expect(tx).to.not.be.reverted;
    await expect(tx)
      .to.emit(Hub, 'NewContract')
      .withArgs('HashingProxy', HashingProxy.address)
      .to.emit(Hub, 'NewContract')
      .withArgs('ScoringProxy', ScoringProxy.address)
      .to.emit(HashingProxy, 'NewHashFunctionContract')
      .withArgs(1, SHA256.address)
      .to.emit(ScoringProxy, 'NewScoringFunctionContract')
      .withArgs(1, Log2PLDSF.address);
  });
});
