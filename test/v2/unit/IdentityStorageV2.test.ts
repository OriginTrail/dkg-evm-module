import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, Identity, IdentityStorageV2 } from '../../../typechain';
import { ECDSA, OPERATIONAL_KEY, ADMIN_KEY } from '../../helpers/constants';

type IdentityStorageFixture = {
  accounts: SignerWithAddress[];
  Identity: Identity;
  IdentityStorageV2: IdentityStorageV2;
};

describe('@v2 @unit IdentityStorageV2 contract', function () {
  let accounts: SignerWithAddress[];
  let Identity: Identity;
  let IdentityStorageV2: IdentityStorageV2;
  let operationalKey: string,
    adminKey: string,
    newAdminKeyBytes32: string,
    operationalKeyBytes32: string,
    adminKeyBytes32: string,
    newOperationalKeyBytes32: string;

  async function deployIdentityStorageFixture(): Promise<IdentityStorageFixture> {
    await hre.deployments.fixture(['IdentityStorageV2', 'Identity'], { keepExistingDeployments: false });
    Identity = await hre.ethers.getContract<Identity>('Identity');
    IdentityStorageV2 = await hre.ethers.getContract<IdentityStorageV2>('IdentityStorage');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Identity, IdentityStorageV2 };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Identity, IdentityStorageV2 } = await loadFixture(deployIdentityStorageFixture));
    operationalKey = accounts[1].address;
    adminKey = accounts[2].address;
    adminKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[2].address]));
    operationalKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[1].address]));
    newOperationalKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[4].address]));
    newAdminKeyBytes32 = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [accounts[3].address]));
  });

  it('The contract is named "Identity"', async () => {
    expect(await IdentityStorageV2.name()).to.equal('IdentityStorage');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await IdentityStorageV2.version()).to.equal('2.0.0');
  });

  it('Get the identity id for operational key, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);

    expect(identityId.toNumber()).to.equal(1);
  });

  it('Validate the purpose of the admin and operational key, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);
    const isAdminKey = await IdentityStorageV2.keyHasPurpose(identityId, adminKeyBytes32, ADMIN_KEY);
    const isOperationalKey = await IdentityStorageV2.keyHasPurpose(identityId, operationalKeyBytes32, OPERATIONAL_KEY);

    expect(isAdminKey).to.be.true;
    expect(isOperationalKey).to.be.true;
  });

  it('Get the admin key values and should matched, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);
    const getAdminKeyValue = await IdentityStorageV2.getKey(identityId, adminKeyBytes32);

    expect(getAdminKeyValue[0].toNumber()).to.equal(ADMIN_KEY);
    expect(getAdminKeyValue[1].toNumber()).to.equal(ECDSA);
    expect(getAdminKeyValue[2]).to.equal(adminKeyBytes32);
  });

  it('Get the operational key values and should matched, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);
    const getOperationalKeyValue = await IdentityStorageV2.getKey(identityId, operationalKeyBytes32);

    expect(getOperationalKeyValue[0].toNumber()).to.equal(OPERATIONAL_KEY);
    expect(getOperationalKeyValue[1].toNumber()).to.equal(ECDSA);
    expect(getOperationalKeyValue[2]).to.equal(operationalKeyBytes32);
  });

  it('Get the list of keys with admin purpose, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);
    await IdentityStorageV2.addKey(identityId, newAdminKeyBytes32, ADMIN_KEY, ECDSA);
    const getKeysByPurpose = await IdentityStorageV2.getKeysByPurpose(identityId, ADMIN_KEY);

    expect(getKeysByPurpose.length).to.equal(2);
    expect(getKeysByPurpose[0]).to.equal(adminKeyBytes32);
    expect(getKeysByPurpose[1]).to.equal(newAdminKeyBytes32);
  });

  it('Get the list of keys with operational purpose, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);
    await IdentityStorageV2.addKey(identityId, newOperationalKeyBytes32, OPERATIONAL_KEY, ECDSA);
    const getKeysByPurpose = await IdentityStorageV2.getKeysByPurpose(identityId, OPERATIONAL_KEY);

    expect(getKeysByPurpose.length).to.equal(2);
    expect(getKeysByPurpose[0]).to.equal(operationalKeyBytes32);
    expect(getKeysByPurpose[1]).to.equal(newOperationalKeyBytes32);
  });

  it('Set a new operational key identity id, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);

    expect(identityId.toNumber()).to.equal(1);

    const newIdentityId = 2;
    await IdentityStorageV2.setOperationalKeyIdentityId(operationalKeyBytes32, newIdentityId);
    const fetchNewIdentityId = await IdentityStorageV2.getIdentityId(operationalKey);

    expect(fetchNewIdentityId.toNumber()).to.equal(newIdentityId);
  });

  it('Remove a new set operational key identity id, expect to pass', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const newIdentityId = 2;
    await IdentityStorageV2.setOperationalKeyIdentityId(operationalKeyBytes32, newIdentityId);
    await IdentityStorageV2.removeOperationalKeyIdentityId(operationalKeyBytes32);
    const fetchIdentityId = await IdentityStorageV2.getIdentityId(operationalKey);

    expect(fetchIdentityId.toNumber()).to.equal(0);
  });

  it('Add 2 operational keys, remove operational key, expect KeyRemoved event to be emitted', async () => {
    await Identity.createIdentity(operationalKey, adminKey);
    const identityId = await IdentityStorageV2.getIdentityId(operationalKey);
    await IdentityStorageV2.addKey(identityId, newOperationalKeyBytes32, OPERATIONAL_KEY, ECDSA);

    await expect(IdentityStorageV2.removeKey(identityId, newOperationalKeyBytes32))
      .to.emit(IdentityStorageV2, 'KeyRemoved')
      .withArgs(identityId, newOperationalKeyBytes32, OPERATIONAL_KEY, ECDSA);
  });
});
