import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { AssertionStorage, Hub } from '../typechain';

type AssertionStorageFixture = {
  accounts: SignerWithAddress[];
  AssertionStorage: AssertionStorage;
  Hub: Hub;
};

describe('AssertionStorage contract', function () {
  const assertionId = '0x74657374696e6720617373657274696f6e2069640209100f5047b080c0440ae1';
  const nonExistingAssertionId = '0x23457374696e6720617373657274696f6e2069640209100f5047b080c0440ae1';
  const size = 20;
  const triplesNumber = 10;
  const chunksNumber = 3;
  let accounts: SignerWithAddress[];
  let AssertionStorage: AssertionStorage;
  let Hub: Hub;

  async function deployAssertionStorageFixture(): Promise<AssertionStorageFixture> {
    await hre.deployments.fixture(['AssertionStorage']);
    const AssertionStorage = await hre.ethers.getContract<AssertionStorage>('AssertionStorage');
    Hub = await hre.ethers.getContract<Hub>('Hub');
    const accounts = await hre.ethers.getSigners();
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, AssertionStorage, Hub };
  }

  beforeEach(async () => {
    ({ accounts, AssertionStorage, Hub } = await loadFixture(deployAssertionStorageFixture));
  });

  it('The contract is named "AssertionStorage"', async function () {
    expect(await AssertionStorage.name()).to.equal('AssertionStorage');
  });

  it('The contract is version "1.0.0"', async function () {
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

  it('Set non owner to be new contract owner and create an assertion, expect to pass', async () => {
    await Hub.setContractAddress('HubOwner', accounts[1].address);
    const AssertionStorageWithNonOwnerAsSigner = AssertionStorage.connect(accounts[1]);

    await AssertionStorageWithNonOwnerAsSigner.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getAssertionResponse = await AssertionStorage.getAssertion(assertionId);

    expect(getAssertionResponse.size).to.equal(size);
    expect(getAssertionResponse.triplesNumber).to.equal(triplesNumber);
    expect(getAssertionResponse.chunksNumber).to.equal(chunksNumber);
  });

  it('Get assertion for non-existing assertionId, expect to get 0', async () => {
    const getAssertionResponse = await AssertionStorage.getAssertion(nonExistingAssertionId);

    getAssertionResponse.forEach((e) => {
      expect(e.toString()).to.equal('0');
    });
  });

  it('Get assertion timestamp, size, triples/chunks number for non-existing assertionId, expect to get 0', async () => {
    const getTimestampResult = await AssertionStorage.getAssertionTimestamp(nonExistingAssertionId);
    const getSizeResult = await AssertionStorage.getAssertionSize(nonExistingAssertionId);
    const getTriplesNumber = await AssertionStorage.getAssertionTriplesNumber(nonExistingAssertionId);
    const getChunksNumber = await AssertionStorage.getAssertionChunksNumber(nonExistingAssertionId);

    expect(getTimestampResult.toString()).to.equal('0');
    expect(getSizeResult.toString()).to.equal('0');
    expect(getTriplesNumber.toString()).to.equal('0');
    expect(getChunksNumber.toString()).to.equal('0');
  });

  it('Get the assertion timestamp for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getTimestampResult = await AssertionStorage.getAssertionTimestamp(assertionId);

    expect(getTimestampResult.toString()).to.not.equal('0');
  });

  it('Get the assertion size for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getSizeResult = await AssertionStorage.getAssertionSize(assertionId);

    expect(getSizeResult.toString()).to.equal(size.toString());
    expect(getSizeResult.toString()).to.not.equal('0');
  });

  it('Get the assertion triple number for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getTriplesNumber = await AssertionStorage.getAssertionTriplesNumber(assertionId);

    expect(getTriplesNumber.toString()).to.equal(triplesNumber.toString());
    expect(getTriplesNumber.toString()).to.not.equal('0');
  });

  it('Get the assertion chunks number for valid assertion id, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);
    const getChunksNumber = await AssertionStorage.getAssertionChunksNumber(assertionId);

    expect(getChunksNumber.toString()).to.equal(chunksNumber.toString());
    expect(getChunksNumber.toString()).to.not.equal('0');
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
