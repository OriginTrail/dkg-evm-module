import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub, ProfileStorage } from '../typechain';
import { ZERO_ADDRESS } from './helpers/constants';

type ProfileStorageFixture = {
  accounts: SignerWithAddress[];
  ProfileStorage: ProfileStorage;
};

describe('ProfileStorage contract', function () {
  let accounts: SignerWithAddress[];
  let ProfileStorage: ProfileStorage;
  const identityId = 1;
  const nodeId = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const newNodeId = '0x0000000000000000000000000000000000000000000000000000000000000002';

  async function deployProfileStorageFixture(): Promise<ProfileStorageFixture> {
    await hre.deployments.fixture(['ProfileStorage']);
    const ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    const accounts = await hre.ethers.getSigners();
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ProfileStorage };
  }

  async function createProfile() {
    const SharesContract = await hre.ethers.getContractFactory('Shares');
    const Shares = await SharesContract.deploy(accounts[0].address, 'Token1', 'TKN1');

    await Shares.deployed();
    await ProfileStorage.createProfile(identityId, nodeId, Shares.address);

    return Shares;
  }

  beforeEach(async () => {
    ({ accounts, ProfileStorage } = await loadFixture(deployProfileStorageFixture));
  });

  it('The contract is named "ProfileStorage"', async function () {
    expect(await ProfileStorage.name()).to.equal('ProfileStorage');
  });

  it('The contract is version "1.0.0"', async function () {
    expect(await ProfileStorage.version()).to.equal('1.0.0');
  });

  it('Validate creating and getting a profile, expect to pass', async () => {
    const sharesAddress = await createProfile();
    const profileData = await ProfileStorage.getProfile(identityId);

    expect(profileData[0]).to.be.equal(nodeId);
    expect(profileData[1][0]).to.be.equal(0);
    expect(profileData[1][1]).to.be.equal(0);
    expect(profileData[2]).to.be.equal(sharesAddress.address);
  });

  it('Validate deleting a profile, expect to pass', async () => {
    await createProfile();
    await ProfileStorage.deleteProfile(identityId);
    const getProfileResult = await ProfileStorage.getProfile(identityId);

    expect(getProfileResult[0]).to.equal('0x');
    expect(getProfileResult[1][0].toNumber()).to.deep.equal(0);
    expect(getProfileResult[1][1].toNumber()).to.deep.equal(0);
    expect(getProfileResult[2]).to.equal(ZERO_ADDRESS);
  });

  it('Validate setting and getting the profile node Id, expect to pass', async () => {
    await createProfile();
    await ProfileStorage.setNodeId(identityId, newNodeId);
    const resultNodeId = await ProfileStorage.getNodeId(identityId);

    expect(resultNodeId).to.be.eql(newNodeId);
  });

  it('Validate setting and getting ask, expect to pass', async () => {
    await createProfile();
    const newAsk = 1;
    await ProfileStorage.setAsk(identityId, newAsk);
    const resultAsk = await ProfileStorage.getAsk(identityId);

    expect(resultAsk.toNumber()).to.be.eql(newAsk);
  });

  it('Validate setting and getting profile accumulated operator fee', async () => {
    await createProfile();
    const newOperatorFeeAmount = 123;
    await ProfileStorage.setAccumulatedOperatorFee(identityId, newOperatorFeeAmount);
    const resultOperatorFeeAmount = await ProfileStorage.getAccumulatedOperatorFee(identityId);

    expect(resultOperatorFeeAmount.toNumber()).to.be.eql(newOperatorFeeAmount);
  });

  it('Validate setting and getting profile accumulated operator fee withdrawal amount', async () => {
    await createProfile();
    const newOperatorFeeWithdrawalAmount = 5;
    await ProfileStorage.setAccumulatedOperatorFeeWithdrawalAmount(identityId, newOperatorFeeWithdrawalAmount);
    const resultOperatorFeeWithdrawalAmount = await ProfileStorage.getAccumulatedOperatorFeeWithdrawalAmount(
      identityId,
    );

    expect(resultOperatorFeeWithdrawalAmount.toNumber()).to.be.eql(newOperatorFeeWithdrawalAmount);
  });

  it.skip('Validate profile accumulated operator fee amount transfer ', async () => {
    //TODO: It will be done by Nikola
  });

  it('Validate setting and getting profile accumulated operator fee withdrawal timestamp', async () => {
    await createProfile();
    const newOperatorFeeWithdrawalTimestamp = 1234567890;
    await ProfileStorage.setAccumulatedOperatorFeeWithdrawalTimestamp(identityId, newOperatorFeeWithdrawalTimestamp);
    const resultOperatorFeeWithdrawalTimestamp = await ProfileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(
      identityId,
    );

    expect(resultOperatorFeeWithdrawalTimestamp.toNumber()).to.be.eql(newOperatorFeeWithdrawalTimestamp);
  });

  it('Check if profile exists with valid identityId, expect to pass', async () => {
    await createProfile();
    const profileExist = await ProfileStorage.profileExists(identityId);

    expect(profileExist).to.be.eql(true);
  });

  it('Check if profile exists with invalid identityId, expect to fail', async () => {
    await createProfile();
    const wrongIdentityId = 2;
    const profileExist = await ProfileStorage.profileExists(wrongIdentityId);

    expect(profileExist).to.be.eql(false);
  });

  it('Validate that valid node id is registered, expect to pass', async () => {
    await createProfile();
    const isRegistered = await ProfileStorage.nodeIdsList(nodeId);

    expect(isRegistered).to.be.eql(true);
  });

  it('Validate that invalid node id is not registered, expect to fail', async () => {
    await createProfile();
    const isRegistered = await ProfileStorage.nodeIdsList(newNodeId);

    expect(isRegistered).to.be.eql(false);
  });

  it('Validate setting and getting node address, expect to pass', async () => {
    await createProfile();
    const newNodeAddress = '0xc783df8a850f42e7f7e57013759c285caa701eb6701eb6701eb6701eb6701eb6';
    await ProfileStorage.setNodeAddress(identityId, 1, newNodeAddress);
    const getNodeAddressResult = await ProfileStorage.getNodeAddress(identityId, 1);

    expect(getNodeAddressResult).to.be.eql(newNodeAddress);
  });
});
