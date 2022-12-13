const WhitelistStorage = artifacts.require('WhitelistStorage');
const truffleAssert = require('truffle-assertions');
const { expect } = require('chai');

contract('WhitelistStorage', async accounts => {
  let whitelistStorage;
  const owner = accounts[0];
  const nonOwner = accounts[1];

  const address = '0xFf0E628E60d466a74768B4e9fc956Bae5f1F2D87';
  const notWhitelisted = '0x74699a895Ec4959adB0850F3B06Cb8E38fDEF4f7';

  before('Deploy a new instances', async () => {
    whitelistStorage = await WhitelistStorage.deployed();
  });

  it('Address is not whitelisted, expect to be false', async () => {
    const isWhitelisted = await whitelistStorage.whitelisted(address);

    expect(isWhitelisted).to.equal(false);
  });

  it('Whitelist address with owner, expect to pass', async () => {
    await truffleAssert.passes(
      whitelistStorage.whitelistAddress(address, { from: owner }),
    );
  });

  it('Validate that the address is whitelisted, expect to be true', async () => {
    const isWhitelisted = await whitelistStorage.whitelisted(address);

    expect(isWhitelisted).to.equal(true);
  });

  it('Whitelist new address with non owner, expect to fail and not whitelisted', async () => {
    await truffleAssert.reverts(
      whitelistStorage.whitelistAddress(notWhitelisted, { from: nonOwner }),
    );
    const isWhitelisted = await whitelistStorage.whitelisted(notWhitelisted);

    expect(isWhitelisted).to.equal(false);
  });

  it('Block address with owner, expect to pass', async () => {
    await truffleAssert.passes(
      whitelistStorage.blacklistAddress(address, { from: owner }),
    );
    const isWhitelisted = await whitelistStorage.whitelisted(address);

    expect(isWhitelisted).to.equal(false);
  });

  it('Block address with non owner, expect to fail', async () => {
    await truffleAssert.reverts(
      whitelistStorage.blacklistAddress(address, { from: nonOwner }),
    );
  });

  it('Disable whitelist, expect to be false', async () => {
    await truffleAssert.passes(whitelistStorage.disableWhitelist());
    const isDisabled = await whitelistStorage.whitelistingEnabled();

    expect(isDisabled).to.equal(false);
  });

  it('Enable whitelist, expect to be true', async () => {
    await truffleAssert.passes(whitelistStorage.enableWhitelist());
    const isEnabled = await whitelistStorage.whitelistingEnabled();

    expect(isEnabled).to.equal(true);
  });
});
