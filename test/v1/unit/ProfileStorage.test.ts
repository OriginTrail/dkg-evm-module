import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Token, ProfileStorage, HubController } from '../../../typechain';
import { ZERO_ADDRESS } from '../../helpers/constants';

type ProfileStorageFixture = {
  accounts: SignerWithAddress[];
  ProfileStorage: ProfileStorage;
  Token: Token;
};

describe('@v1 @unit ProfileStorage contract', function () {
  let accounts: SignerWithAddress[];
  let ProfileStorage: ProfileStorage;
  let Token: Token;
  const newNodeId = '0x0000000000000000000000000000000000000000000000000000000000000002';

  async function deployProfileStorageFixture(): Promise<ProfileStorageFixture> {
    await hre.deployments.fixture(['ProfileStorage']);
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    Token = await hre.ethers.getContract<Token>('Token');
    accounts = await hre.ethers.getSigners();
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Token, ProfileStorage };
  }

  async function createProfile() {
    const identityId = 1;
    const nodeId = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const SharesContract = await hre.ethers.getContractFactory('Shares');
    const Shares = await SharesContract.deploy(accounts[0].address, 'Token1', 'TKN1');

    await Shares.deployed();
    await ProfileStorage.createProfile(identityId, nodeId, Shares.address);

    return { Shares, identityId, nodeId };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Token, ProfileStorage } = await loadFixture(deployProfileStorageFixture));
  });

  it('The contract is named "ProfileStorage"', async () => {
    expect(await ProfileStorage.name()).to.equal('ProfileStorage');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ProfileStorage.version()).to.equal('1.0.0');
  });

  it('Validate creating and getting a profile, expect to pass', async () => {
    const createProfileValues = await createProfile();
    const profileData = await ProfileStorage.getProfile(createProfileValues.identityId);

    expect(profileData[0]).to.equal(createProfileValues.nodeId);
    expect(profileData[1][0]).to.equal(0);
    expect(profileData[1][1]).to.equal(0);
    expect(profileData[2]).to.equal(createProfileValues.Shares.address);
  });

  it('Validate deleting a profile, expect to pass', async () => {
    const createProfileValues = await createProfile();
    await ProfileStorage.deleteProfile(createProfileValues.identityId);
    const getProfileResult = await ProfileStorage.getProfile(createProfileValues.identityId);

    expect(getProfileResult[0]).to.equal('0x');
    expect(getProfileResult[1][0].toNumber()).to.deep.equal(0);
    expect(getProfileResult[1][1].toNumber()).to.deep.equal(0);
    expect(getProfileResult[2]).to.equal(ZERO_ADDRESS);
  });

  it('Validate setting and getting the profile node Id, expect to pass', async () => {
    const createProfileValues = await createProfile();
    await ProfileStorage.setNodeId(createProfileValues.identityId, newNodeId);
    const resultNodeId = await ProfileStorage.getNodeId(createProfileValues.identityId);

    expect(resultNodeId).to.equal(newNodeId);
  });

  it('Validate setting and getting ask, expect to pass', async () => {
    const createProfileValues = await createProfile();
    const newAsk = 1;
    await ProfileStorage.setAsk(createProfileValues.identityId, newAsk);
    const resultAsk = await ProfileStorage.getAsk(createProfileValues.identityId);

    expect(resultAsk.toNumber()).to.equal(newAsk);
  });

  it('Validate setting and getting profile accumulated operator fee', async () => {
    const createProfileValues = await createProfile();
    const newOperatorFeeAmount = 123;
    await ProfileStorage.setAccumulatedOperatorFee(createProfileValues.identityId, newOperatorFeeAmount);
    const resultOperatorFeeAmount = await ProfileStorage.getAccumulatedOperatorFee(createProfileValues.identityId);

    expect(resultOperatorFeeAmount.toNumber()).to.equal(newOperatorFeeAmount);
  });

  it('Validate setting and getting profile accumulated operator fee withdrawal amount', async () => {
    const createProfileValues = await createProfile();
    const newOperatorFeeWithdrawalAmount = 5;
    await ProfileStorage.setAccumulatedOperatorFeeWithdrawalAmount(
      createProfileValues.identityId,
      newOperatorFeeWithdrawalAmount,
    );
    const resultOperatorFeeWithdrawalAmount = await ProfileStorage.getAccumulatedOperatorFeeWithdrawalAmount(
      createProfileValues.identityId,
    );

    expect(resultOperatorFeeWithdrawalAmount.toNumber()).to.equal(newOperatorFeeWithdrawalAmount);
  });

  it('Validate profile accumulated operator fee amount transfer ', async () => {
    const transferAmount = hre.ethers.utils.parseEther('100');
    const receiver = accounts[1].address;
    await Token.mint(ProfileStorage.address, transferAmount);

    const initialReceiverBalance = await Token.balanceOf(receiver);
    await ProfileStorage.transferAccumulatedOperatorFee(receiver, transferAmount);
    expect(await Token.balanceOf(receiver)).to.equal(initialReceiverBalance.add(transferAmount));
  });

  it('Validate setting and getting profile accumulated operator fee withdrawal timestamp', async () => {
    const createProfileValues = await createProfile();
    const newOperatorFeeWithdrawalTimestamp = 1234567890;
    await ProfileStorage.setAccumulatedOperatorFeeWithdrawalTimestamp(
      createProfileValues.identityId,
      newOperatorFeeWithdrawalTimestamp,
    );
    const resultOperatorFeeWithdrawalTimestamp = await ProfileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(
      createProfileValues.identityId,
    );

    expect(resultOperatorFeeWithdrawalTimestamp.toNumber()).to.equal(newOperatorFeeWithdrawalTimestamp);
  });

  it('Check if profile exists with valid identityId, expect to pass', async () => {
    const createProfileValues = await createProfile();
    const profileExist = await ProfileStorage.profileExists(createProfileValues.identityId);

    expect(profileExist).to.equal(true);
  });

  it('Check if profile exists with invalid identityId, expect to fail', async () => {
    const wrongIdentityId = 2;
    const profileExist = await ProfileStorage.profileExists(wrongIdentityId);

    expect(profileExist).to.equal(false);
  });

  it('Validate that valid node id is registered, expect to pass', async () => {
    const createProfileValues = await createProfile();
    const isRegistered = await ProfileStorage.nodeIdsList(createProfileValues.nodeId);

    expect(isRegistered).to.equal(true);
  });

  it('Validate that invalid node id is not registered, expect to fail', async () => {
    const isRegistered = await ProfileStorage.nodeIdsList(newNodeId);

    expect(isRegistered).to.equal(false);
  });

  it('Validate setting and getting node address, expect to pass', async () => {
    const createProfileValues = await createProfile();
    const newNodeAddress = '0xc783df8a850f42e7f7e57013759c285caa701eb6701eb6701eb6701eb6701eb6';
    await ProfileStorage.setNodeAddress(createProfileValues.identityId, 1, newNodeAddress);
    const getNodeAddressResult = await ProfileStorage.getNodeAddress(createProfileValues.identityId, 1);

    expect(getNodeAddressResult).to.equal(newNodeAddress);
  });
});
