import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { WhitelistStorage } from '../typechain';

type WhitelistStorageFixture = {
  accounts: SignerWithAddress[];
  WhitelistStorage: WhitelistStorage;
};

describe('WhitelistStorage contract', function () {
  let accounts: SignerWithAddress[];
  let WhitelistStorage: WhitelistStorage;

  async function deployWhitelistStorageFixture(): Promise<WhitelistStorageFixture> {
    await hre.deployments.fixture(['WhitelistStorage']);
    const WhitelistStorage = await hre.ethers.getContract<WhitelistStorage>('WhitelistStorage');
    const accounts = await hre.ethers.getSigners();

    return { accounts, WhitelistStorage };
  }

  beforeEach(async () => {
    ({ accounts, WhitelistStorage } = await loadFixture(deployWhitelistStorageFixture));
  });

  it('Address is not whitelisted; expect to be false', async () => {
    expect(await WhitelistStorage.whitelisted(accounts[1].address)).to.equal(false);
  });

  it('Whitelist address with owner; expect address to be whitelisted', async () => {
    await WhitelistStorage.whitelistAddress(accounts[1].address);

    expect(await WhitelistStorage.whitelisted(accounts[1].address)).to.equal(true);
  });

  it('Whitelist new address with non owner; expect to fail and not whitelisted', async () => {
    const WhitelistStorageWithNonOwnerSigner = WhitelistStorage.connect(accounts[1]);

    expect(WhitelistStorageWithNonOwnerSigner.whitelistAddress(accounts[2].address)).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );

    expect(await WhitelistStorageWithNonOwnerSigner.whitelisted(accounts[2].address)).to.equal(false);
  });

  it('Whitelist and blacklist address with owner; expect to be blacklisted', async () => {
    await WhitelistStorage.whitelistAddress(accounts[1].address);
    await WhitelistStorage.blacklistAddress(accounts[1].address);

    expect(await WhitelistStorage.whitelisted(accounts[1].address)).to.equal(false);
  });

  it('Block address with non owner, expect to be reverted', async () => {
    const WhitelistStorageWithNonOwnerSigner = WhitelistStorage.connect(accounts[1]);

    expect(WhitelistStorageWithNonOwnerSigner.blacklistAddress(accounts[1].address)).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('Enable whitelist, expect to be true', async () => {
    await WhitelistStorage.enableWhitelist();

    expect(await WhitelistStorage.whitelistingEnabled()).to.equal(true);
  });

  it('Disable whitelist, expect to be false', async () => {
    await WhitelistStorage.enableWhitelist();
    await WhitelistStorage.disableWhitelist();

    expect(await WhitelistStorage.whitelistingEnabled()).to.equal(false);
  });
});
