import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Identity, IdentityStorage, HubController } from '../../../typechain';
import { ZERO_ADDRESS, ZERO_BYTES32 } from '../../helpers/constants';

type IdentityFixture = {
  accounts: SignerWithAddress[];
  Identity: Identity;
  IdentityStorage: IdentityStorage;
};

describe('@v1 @unit Identity contract', function () {
  let accounts: SignerWithAddress[];
  let Identity: Identity;
  let IdentityStorage: IdentityStorage;
  let operationalKey: string,
    adminKey: string,
    identityId: number,
    operationalKeyBytes32: string,
    adminKeyBytes32: string;
  const ADMIN_KEY = 1;
  const OPERATIONAL_KEY = 2;
  const ECDSA = 1;

  async function deployIdentityFixture(): Promise<IdentityFixture> {
    await hre.deployments.fixture(['Identity']);
    Identity = await hre.ethers.getContract<Identity>('Identity');
    IdentityStorage = await hre.ethers.getContract<IdentityStorage>('IdentityStorage');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Identity, IdentityStorage };
  }

  async function createIdentity(operationalKey: string, adminKey: string) {
    const createIdentity = await Identity.createIdentity(operationalKey, adminKey);

    await expect(createIdentity).to.emit(Identity, 'IdentityCreated');

    const receipt = await createIdentity.wait();

    identityId = receipt.events?.[2].args?.identityId.toNumber();
    const fetchIdentityId = await IdentityStorage.getIdentityId(operationalKey);

    expect(identityId).not.equal(0);
    expect(identityId).to.equal(fetchIdentityId.toNumber(), 'Error: Identities are not matched!');

    return identityId;
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Identity, IdentityStorage } = await loadFixture(deployIdentityFixture));
    operationalKey = accounts[1].address;
    adminKey = accounts[2].address;
    adminKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[2].address]));
    operationalKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[1].address]));
  });

  it('The contract is named "Identity"', async () => {
    expect(await Identity.name()).to.equal('Identity');
  });

  it('The contract is version "1.1.0"', async () => {
    expect(await Identity.version()).to.equal('1.1.0');
  });

  it('Create an identity as a contract, expect to pass', async () => {
    await createIdentity(operationalKey, adminKey);
  });

  it('Create an identity with non-hub contract, expect to fail', async () => {
    const IdentityWithNonHubContract = Identity.connect(accounts[1]);
    await expect(IdentityWithNonHubContract.createIdentity(operationalKey, adminKey)).to.be.revertedWith(
      'Fn can only be called by the hub',
    );
  });

  it('Create an identity with empty operational wallet, expect to fail', async () => {
    await expect(Identity.createIdentity(ZERO_ADDRESS, adminKey)).to.be.revertedWith(
      "Operational address can't be 0x0",
    );
  });

  it('Create an identity with empty admin wallet, expect to fail', async () => {
    await expect(Identity.createIdentity(operationalKey, ZERO_ADDRESS)).to.be.revertedWith(
      "Admin address can't be 0x0",
    );
  });

  it('Create an identity with same admin and operational key, expect to revert', async () => {
    const keyAddress = accounts[4].address;

    await expect(Identity.createIdentity(keyAddress, keyAddress)).to.be.revertedWith('Admin should != Operational');
  });

  it('Create and delete an identity, expect to pass', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const deleteIdentity = await Identity.deleteIdentity(getIdentityId);

    await expect(deleteIdentity).to.emit(Identity, 'IdentityDeleted');
  });

  it('Add an admin key to existing identity, expect to pass', async () => {
    const newAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await AddKeyWithAdminWallet.addKey(getIdentityId, newAdminKey, ADMIN_KEY, ECDSA);

    expect(await IdentityStorage.keyHasPurpose(getIdentityId, newAdminKey, ADMIN_KEY)).to.be.true;

    const adminKeys = await IdentityStorage.getKeysByPurpose(getIdentityId, ADMIN_KEY);

    expect(adminKeys.length).to.equal(2, 'Error: Failed to add admin key to identity!');
  });

  it('Add an operational key to existing identity, expect to pass', async () => {
    const newOperationalKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await AddKeyWithAdminWallet.addKey(getIdentityId, newOperationalKey, OPERATIONAL_KEY, ECDSA);

    expect(await IdentityStorage.keyHasPurpose(getIdentityId, newOperationalKey, OPERATIONAL_KEY)).to.be.true;

    const operationalKeys = await IdentityStorage.getKeysByPurpose(getIdentityId, OPERATIONAL_KEY);

    expect(operationalKeys.length).to.equal(2, 'Error: Failed to add operational key to identity!');
  });

  it('Add keys to existing identity without key value, expect to fail', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await expect(AddKeyWithAdminWallet.addKey(getIdentityId, ZERO_BYTES32, ADMIN_KEY, ECDSA)).to.be.revertedWith(
      'Key arg is empty',
    );

    await expect(AddKeyWithAdminWallet.addKey(getIdentityId, ZERO_BYTES32, OPERATIONAL_KEY, ECDSA)).to.be.revertedWith(
      'Key arg is empty',
    );
  });

  it('Add an existing admin key to identity, expect to fail', async () => {
    const newAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await AddKeyWithAdminWallet.addKey(getIdentityId, newAdminKey, ADMIN_KEY, ECDSA);

    expect(await IdentityStorage.keyHasPurpose(getIdentityId, newAdminKey, ADMIN_KEY)).to.be.true;

    const adminKeys = await IdentityStorage.getKeysByPurpose(getIdentityId, ADMIN_KEY);

    expect(adminKeys.length).to.equal(2, 'Error: Failed to add admin key to identity!');
    await expect(AddKeyWithAdminWallet.addKey(getIdentityId, newAdminKey, ADMIN_KEY, ECDSA)).to.be.revertedWith(
      'Key is already attached',
    );
  });

  it('Add an existing operational key to identity, expect to fail', async () => {
    const newOperationalKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await AddKeyWithAdminWallet.addKey(getIdentityId, newOperationalKey, OPERATIONAL_KEY, ECDSA);

    const adminKeys = await IdentityStorage.getKeysByPurpose(getIdentityId, OPERATIONAL_KEY);

    expect(adminKeys.length).to.equal(2, 'Error: Failed to add operational key to identity!');
    await expect(
      AddKeyWithAdminWallet.addKey(getIdentityId, newOperationalKey, OPERATIONAL_KEY, ECDSA),
    ).to.be.revertedWith('Operational key is taken');
  });

  it('Add an admin key to existing identity with operational wallet, expect to fail', async () => {
    const newAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithOprWallet = Identity.connect(accounts[1]);

    await expect(AddKeyWithOprWallet.addKey(getIdentityId, newAdminKey, ADMIN_KEY, ECDSA)).to.be.revertedWith(
      'Admin function',
    );
  });

  it('Remove the admin key from existing identity, expect to pass', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);
    const newAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    let adminKeysNumber;

    await AddKeyWithAdminWallet.addKey(getIdentityId, newAdminKey, ADMIN_KEY, ECDSA);
    adminKeysNumber = await IdentityStorage.getKeysByPurpose(getIdentityId, ADMIN_KEY);

    expect(adminKeysNumber.length).to.equal(2, 'Error: Failed to add admin key to identity!');

    await AddKeyWithAdminWallet.removeKey(getIdentityId, newAdminKey);
    adminKeysNumber = await IdentityStorage.getKeysByPurpose(getIdentityId, ADMIN_KEY);

    expect(adminKeysNumber.length).to.equal(1, 'Error: Failed to remove admin key!');
  });

  it('Remove the operational key from existing identity, expect to pass', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);
    const newOperationalKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[7].address]));
    let adminKeysNumber;

    await AddKeyWithAdminWallet.addKey(getIdentityId, newOperationalKey, OPERATIONAL_KEY, ECDSA);
    adminKeysNumber = await IdentityStorage.getKeysByPurpose(getIdentityId, OPERATIONAL_KEY);

    expect(adminKeysNumber.length).to.equal(2, 'Error: Failed to add operational key to identity!');

    await AddKeyWithAdminWallet.removeKey(getIdentityId, newOperationalKey);
    adminKeysNumber = await IdentityStorage.getKeysByPurpose(getIdentityId, ADMIN_KEY);

    expect(adminKeysNumber.length).to.equal(1, 'Error: Failed to remove operational key!');

    const fetchDeletedIdentityId = await IdentityStorage.getIdentityId(operationalKey);

    expect(fetchDeletedIdentityId.toNumber()).to.equal(1, 'Error: Identity was not deleted!');
  });

  it('Remove admin key from existing identity without key value, expect to fail', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await expect(AddKeyWithAdminWallet.removeKey(getIdentityId, ZERO_BYTES32)).to.be.revertedWith('Key arg is empty');
  });

  it('Remove not attached admin key from existing identity, expect to fail', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const notAttachedAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[5].address]));
    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);

    await expect(AddKeyWithAdminWallet.removeKey(getIdentityId, notAttachedAdminKey)).to.be.revertedWith(
      "Key isn't attached",
    );
  });

  it('Remove the only admin key from existing identity, expect to fail', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const RemoveKeyWithAdminWallet = Identity.connect(accounts[2]);

    await expect(RemoveKeyWithAdminWallet.removeKey(getIdentityId, adminKeyBytes32)).to.be.revertedWith(
      'Cannot delete the only admin key',
    );
  });

  it('Remove the only operational key from existing identity, expect to fail', async () => {
    const getIdentityId = await createIdentity(operationalKey, adminKey);
    const RemoveKeyWithAdminWallet = Identity.connect(accounts[2]);

    await expect(RemoveKeyWithAdminWallet.removeKey(getIdentityId, operationalKeyBytes32)).to.be.revertedWith(
      'Cannot delete the only oper. key',
    );
  });

  it('Add new admin key to existing identity, remove old admin key, expect to pass', async () => {
    const newAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[5].address]));
    const getIdentityId = await createIdentity(operationalKey, adminKey);

    expect(await IdentityStorage.keyHasPurpose(getIdentityId, adminKeyBytes32, ADMIN_KEY)).to.be.true;
    expect(await IdentityStorage.keyHasPurpose(getIdentityId, operationalKeyBytes32, OPERATIONAL_KEY)).to.be.true;

    const AddKeyWithAdminWallet = Identity.connect(accounts[2]);
    await AddKeyWithAdminWallet.addKey(getIdentityId, newAdminKey, ADMIN_KEY, ECDSA);

    expect(await IdentityStorage.keyHasPurpose(getIdentityId, newAdminKey, ADMIN_KEY)).to.be.true;

    const RemoveKeyWithNewAdminWallet = Identity.connect(accounts[5]);
    await RemoveKeyWithNewAdminWallet.removeKey(getIdentityId, adminKeyBytes32);

    expect(await IdentityStorage.keyHasPurpose(getIdentityId, adminKeyBytes32, ADMIN_KEY)).to.be.false;
  });

  it('Create 2 identities, try to attach operational key of the other identity, expect to revert', async () => {
    const identityId = await createIdentity(operationalKey, adminKey);
    await createIdentity(accounts[3].address, accounts[4].address);

    await expect(
      Identity.connect(accounts[2]).addKey(
        identityId,
        ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[3].address])),
        OPERATIONAL_KEY,
        ECDSA,
      ),
    ).to.be.revertedWith('Operational key is taken');
  });

  it('Create identity, try to attach multiple operational wallets with already existing key, expect to revert', async () => {
    const identityId = await createIdentity(operationalKey, adminKey);

    await expect(
      Identity.addOperationalWallets(identityId, [accounts[1].address, accounts[3].address]),
    ).to.be.revertedWith('Operational key is taken');
  });

  it('Create identity, try to attach multiple operational wallets with already taken key, expect to revert', async () => {
    const identityId = await createIdentity(operationalKey, adminKey);
    await createIdentity(accounts[3].address, accounts[4].address);

    await expect(
      Identity.addOperationalWallets(identityId, [accounts[3].address, accounts[5].address]),
    ).to.be.revertedWith('Operational key is taken');

    // We still can attach someones admin wallet as a key, but it shouldn't be a problem
    await expect(Identity.addOperationalWallets(identityId, [accounts[4].address, accounts[5].address])).not.to.be
      .reverted;
  });
});
