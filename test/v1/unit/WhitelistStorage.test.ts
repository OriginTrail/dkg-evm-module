import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { Interface } from 'ethers/lib/utils';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, WhitelistStorage } from '../../../typechain';

type WhitelistStorageFixture = {
  accounts: SignerWithAddress[];
  HubController: HubController;
  WhitelistStorageInterface: Interface;
  WhitelistStorage: WhitelistStorage;
};

describe('@v1 @unit WhitelistStorage contract', function () {
  let accounts: SignerWithAddress[];
  let HubController: HubController;
  let WhitelistStorageInterface: Interface;
  let WhitelistStorage: WhitelistStorage;

  async function deployWhitelistStorageFixture(): Promise<WhitelistStorageFixture> {
    await hre.deployments.fixture(['WhitelistStorage']);
    HubController = await hre.ethers.getContract<HubController>('HubController');
    WhitelistStorage = await hre.ethers.getContract<WhitelistStorage>('WhitelistStorage');
    WhitelistStorageInterface = new hre.ethers.utils.Interface(hre.helpers.getAbi('WhitelistStorage'));
    accounts = await hre.ethers.getSigners();

    return { accounts, HubController, WhitelistStorageInterface, WhitelistStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, HubController, WhitelistStorage } = await loadFixture(deployWhitelistStorageFixture));
  });

  it('The contract is named "WhitelistStorage"', async () => {
    expect(await WhitelistStorage.name()).to.equal('WhitelistStorage');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await WhitelistStorage.version()).to.equal('1.0.0');
  });

  it('Address is not whitelisted; expect to be false', async () => {
    expect(await WhitelistStorage.whitelisted(accounts[1].address)).to.equal(false);
  });

  it('Whitelist address with owner; expect address to be whitelisted', async () => {
    await HubController.forwardCall(
      WhitelistStorage.address,
      WhitelistStorageInterface.encodeFunctionData('whitelistAddress', [accounts[1].address]),
    );

    expect(await WhitelistStorage.whitelisted(accounts[1].address)).to.equal(true);
  });

  it('Whitelist new address with non owner; expect to fail and not whitelisted', async () => {
    const WhitelistStorageWithNonOwnerSigner = WhitelistStorage.connect(accounts[1]);

    await expect(WhitelistStorageWithNonOwnerSigner.whitelistAddress(accounts[2].address)).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );

    expect(await WhitelistStorageWithNonOwnerSigner.whitelisted(accounts[2].address)).to.equal(false);
  });

  it('Whitelist and blacklist address with owner; expect to be blacklisted', async () => {
    await HubController.forwardCall(
      WhitelistStorage.address,
      WhitelistStorageInterface.encodeFunctionData('whitelistAddress', [accounts[1].address]),
    );
    await HubController.forwardCall(
      WhitelistStorage.address,
      WhitelistStorageInterface.encodeFunctionData('blacklistAddress', [accounts[1].address]),
    );

    expect(await WhitelistStorage.whitelisted(accounts[1].address)).to.equal(false);
  });

  it('Block address with non owner, expect to be reverted', async () => {
    const WhitelistStorageWithNonOwnerSigner = WhitelistStorage.connect(accounts[1]);

    await expect(WhitelistStorageWithNonOwnerSigner.blacklistAddress(accounts[1].address)).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('Enable whitelist, expect to be true', async () => {
    await HubController.forwardCall(
      WhitelistStorage.address,
      WhitelistStorageInterface.encodeFunctionData('enableWhitelist'),
    );

    expect(await WhitelistStorage.whitelistingEnabled()).to.equal(true);
  });

  it('Disable whitelist, expect to be false', async () => {
    await HubController.forwardCall(
      WhitelistStorage.address,
      WhitelistStorageInterface.encodeFunctionData('enableWhitelist'),
    );
    await HubController.forwardCall(
      WhitelistStorage.address,
      WhitelistStorageInterface.encodeFunctionData('disableWhitelist'),
    );

    expect(await WhitelistStorage.whitelistingEnabled()).to.equal(false);
  });
});
