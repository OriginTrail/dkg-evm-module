import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { AssertionStorage, HubController } from '../../../typechain';

type AssertionStorageFixture = {
  accounts: SignerWithAddress[];
  AssertionStorage: AssertionStorage;
};

describe('@v1 @unit AssertionStorage contract', function () {
  const assertionId = '0x74657374696e6720617373657274696f6e2069640209100f5047b080c0440ae1';
  const nonExistingAssertionId = '0x23457374696e6720617373657274696f6e2069640209100f5047b080c0440ae1';
  const size = 20;
  const triplesNumber = 10;
  const chunksNumber = 3;
  let accounts: SignerWithAddress[];
  let AssertionStorage: AssertionStorage;

  async function deployAssertionStorageFixture(): Promise<AssertionStorageFixture> {
    await hre.deployments.fixture(['AssertionStorage']);
    AssertionStorage = await hre.ethers.getContract<AssertionStorage>('AssertionStorage');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, AssertionStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, AssertionStorage } = await loadFixture(deployAssertionStorageFixture));
  });

  it('The contract is named "AssertionStorage"', async () => {
    expect(await AssertionStorage.name()).to.equal('AssertionStorage');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await AssertionStorage.version()).to.equal('1.0.0');
  });

  it('Create an assertion with non owner, expect to fail', async () => {
    const AssertionStorageWithNonOwnerAsSigner = AssertionStorage.connect(accounts[1]);

    await expect(
      AssertionStorageWithNonOwnerAsSigner.createAssertion(assertionId, size, triplesNumber, chunksNumber),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Create an assertion with owner, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);

    const getAssertionResponse = await AssertionStorage.getAssertion(assertionId);
    expect(getAssertionResponse.size).to.equal(size);
    expect(getAssertionResponse.triplesNumber).to.equal(triplesNumber);
    expect(getAssertionResponse.chunksNumber).to.equal(chunksNumber);
  });

  it('Create an assertion from non-owner wallet, expect to revert', async () => {
    const AssertionStorageWithNonOwnerAsSigner = AssertionStorage.connect(accounts[1]);

    await expect(
      AssertionStorageWithNonOwnerAsSigner.createAssertion(assertionId, size, triplesNumber, chunksNumber),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Get assertion for non-existing assertionId, expect to get 0', async () => {
    const getAssertionResponse = await AssertionStorage.getAssertion(nonExistingAssertionId);

    getAssertionResponse.forEach((e) => {
      expect(e).to.equal(0);
    });
  });

  it('Get assertion timestamp, size, triples/chunks number for non-existing assertionId, expect to get 0', async () => {
    const getTimestampResult = await AssertionStorage.getAssertionTimestamp(nonExistingAssertionId);
    const getSizeResult = await AssertionStorage.getAssertionSize(nonExistingAssertionId);
    const getTriplesNumber = await AssertionStorage.getAssertionTriplesNumber(nonExistingAssertionId);
    const getChunksNumber = await AssertionStorage.getAssertionChunksNumber(nonExistingAssertionId);

    expect(getTimestampResult).to.equal(0);
    expect(getSizeResult).to.equal(0);
    expect(getTriplesNumber).to.equal(0);
    expect(getChunksNumber).to.equal(0);
  });

  it('Get the assertion timestamp for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getTimestampResult = await AssertionStorage.getAssertionTimestamp(assertionId);

    expect(getTimestampResult).to.not.equal(0);
  });

  it('Get the assertion size for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getSizeResult = await AssertionStorage.getAssertionSize(assertionId);

    expect(getSizeResult).to.equal(size);
    expect(getSizeResult).to.not.equal(0);
  });

  it('Get the assertion triple number for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getTriplesNumber = await AssertionStorage.getAssertionTriplesNumber(assertionId);

    expect(getTriplesNumber).to.equal(triplesNumber);
    expect(getTriplesNumber).to.not.equal(0);
  });

  it('Get the assertion chunks number for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getChunksNumber = await AssertionStorage.getAssertionChunksNumber(assertionId);

    expect(getChunksNumber).to.equal(chunksNumber);
    expect(getChunksNumber).to.not.equal(0);
  });

  it('Validate that assertion exists with valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const isAssertionExist = await AssertionStorage.assertionExists(assertionId);

    expect(isAssertionExist).to.equal(true);
  });

  it('Validate that assertion can be deleted, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const isAssertionExist = await AssertionStorage.assertionExists(assertionId);

    expect(isAssertionExist).to.equal(true);

    await AssertionStorage.deleteAssertion(assertionId);
    const checkAssertion = await AssertionStorage.assertionExists(assertionId);

    expect(checkAssertion).to.equal(false);
  });
});
