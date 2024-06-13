import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, Identity, IdentityStorage } from '../../../typechain';
import { ADMIN_KEY, ECDSA, OPERATIONAL_KEY, ZERO_BYTES32 } from '../../helpers/constants';

type IdentityStorageFixture = {
  accounts: SignerWithAddress[];
  Identity: Identity;
  IdentityStorage: IdentityStorage;
};

describe('@v1 @unit IdentityStorage contract', function () {
  let accounts: SignerWithAddress[];
  let Identity: Identity;
  let IdentityStorage: IdentityStorage;
  let operationalKey: string,
    adminKey: string,
    newAdminKeyBytes32: string,
    operationalKeyBytes32: string,
    adminKeyBytes32: string,
    newOperationalKeyBytes32: string;

  async function deployIdentityStorageFixture(): Promise<IdentityStorageFixture> {
    await hre.deployments.fixture(['Identity']);
    Identity = await hre.ethers.getContract<Identity>('Identity');
    IdentityStorage = await hre.ethers.getContract<IdentityStorage>('IdentityStorage');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Identity, IdentityStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Identity, IdentityStorage } = await loadFixture(deployIdentityStorageFixture));
    operationalKey = accounts[1].address;
    adminKey = accounts[2].address;
    adminKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[2].address]));
    operationalKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[1].address]));
    newOperationalKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    newAdminKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[3].address]));
  });

  it('The contract is named "Identity"', async () => {
    expect(await IdentityStorage.name()).to.equal('IdentityStorage');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await IdentityStorage.version()).to.equal('1.0.0');
  });

  it('Get the identity id for operational key, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);

    expect(getIdentityId.toNumber()).to.equal(1);
  });

  it('Validate the purpose of the admin and operational key, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);
    const isAdminKey = await IdentityStorage.keyHasPurpose(getIdentityId, adminKeyBytes32, ADMIN_KEY);
    const isOperationalKey = await IdentityStorage.keyHasPurpose(getIdentityId, operationalKeyBytes32, OPERATIONAL_KEY);

    expect(isAdminKey).to.be.true;
    expect(isOperationalKey).to.be.true;
  });

  it('Get the admin key values and should matched, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);
    const getAdminKeyValue = await IdentityStorage.getKey(getIdentityId, adminKeyBytes32);

    expect(getAdminKeyValue[0].toNumber()).to.equal(ADMIN_KEY);
    expect(getAdminKeyValue[1].toNumber()).to.equal(ECDSA);
    expect(getAdminKeyValue[2]).to.equal(adminKeyBytes32);
  });

  it('Get the operational key values and should matched, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);
    const getOperationalKeyValue = await IdentityStorage.getKey(getIdentityId, operationalKeyBytes32);

    expect(getOperationalKeyValue[0].toNumber()).to.equal(OPERATIONAL_KEY);
    expect(getOperationalKeyValue[1].toNumber()).to.equal(ECDSA);
    expect(getOperationalKeyValue[2]).to.equal(operationalKeyBytes32);
  });

  it('Get the list of keys with admin purpose, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);
    await IdentityStorage.addKey(getIdentityId, newAdminKeyBytes32, ADMIN_KEY, ECDSA);
    const getKeysByPurpose = await IdentityStorage.getKeysByPurpose(getIdentityId, ADMIN_KEY);

    expect(getKeysByPurpose.length).to.equal(2);
    expect(getKeysByPurpose[0]).to.equal(adminKeyBytes32);
    expect(getKeysByPurpose[1]).to.equal(newAdminKeyBytes32);
  });

  it('Get the list of keys with operational purpose, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);
    await IdentityStorage.addKey(getIdentityId, newOperationalKeyBytes32, OPERATIONAL_KEY, ECDSA);
    const getKeysByPurpose = await IdentityStorage.getKeysByPurpose(getIdentityId, OPERATIONAL_KEY);

    expect(getKeysByPurpose.length).to.equal(2);
    expect(getKeysByPurpose[0]).to.equal(operationalKeyBytes32);
    expect(getKeysByPurpose[1]).to.equal(newOperationalKeyBytes32);
  });

  it('Set a new operational key identity id, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const getIdentityId = await IdentityStorage.getIdentityId(operationalKey);

    expect(getIdentityId.toNumber()).to.equal(1);

    const newIdentityId = 2;
    await IdentityStorage.setOperationalKeyIdentityId(operationalKeyBytes32, newIdentityId);
    const fetchNewIdentityId = await IdentityStorage.getIdentityId(operationalKey);

    expect(fetchNewIdentityId.toNumber()).to.equal(newIdentityId);
  });

  it('Remove a new set operational key identity id, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const newIdentityId = 2;
    await IdentityStorage.setOperationalKeyIdentityId(operationalKeyBytes32, newIdentityId);
    await IdentityStorage.removeOperationalKeyIdentityId(operationalKeyBytes32);
    const fetchIdentityId = await IdentityStorage.getIdentityId(operationalKey);

    expect(fetchIdentityId.toNumber()).to.equal(0);
  });

  it('Add 2 operational keys, remove operational key, expect event to be empty (bug)', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorage.getIdentityId(operationalKey);
    await IdentityStorage.addKey(identityId, newOperationalKeyBytes32, OPERATIONAL_KEY, ECDSA);

    await expect(IdentityStorage.removeKey(identityId, newOperationalKeyBytes32))
      .to.emit(IdentityStorage, 'KeyRemoved')
      .withArgs(identityId, ZERO_BYTES32, 0, 0);
  });
});
