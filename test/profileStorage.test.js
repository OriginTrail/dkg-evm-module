const ProfileStorage = artifacts.require('ProfileStorage');
const Hub = artifacts.require('Hub');
const Shares = artifacts.require('Shares');
const { expect } = require('chai');

contract('ProfileStorage', accounts => {
  let profileStorage;
  let hub;
  const owner = accounts[0];
  const nodeIdString = 'QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj';
  const nodeId = web3.utils.asciiToHex(nodeIdString);

  const newNodeIdString = 'QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj';
  const newNodeId = web3.utils.asciiToHex(newNodeIdString);

  const wrongNodeIdString = 'QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gt0';
  const wrongNodeId = web3.utils.asciiToHex(wrongNodeIdString);

  beforeEach(async () => {
    // Deploy a new instance of ProfileStorage before each test
    hub = await Hub.deployed();
    profileStorage = await ProfileStorage.new(hub.address);
  });

  it('should allow creating and getting a profile', async () => {
    // Create a profile
    const identityId = 1;
    const shares = await Shares.new(hub.address, 'Token1', 'TKN1');

    await hub.setContractAddress('Owner', owner, { from: owner });

    await profileStorage.createProfile(identityId, nodeId, shares.address, { from: owner });

    // Get the profile
    const result = await profileStorage.getProfile(identityId);
    expect(result[0]).to.equal(nodeId);
    expect(result[1][0].toNumber()).to.deep.equal(0);
    expect(result[1][1].toNumber()).to.deep.equal(0);
    expect(result[2]).to.equal(shares.address);
  });

  it('should allow deleting a profile', async () => {
    // Create a profile
    const identityId = 1;
    const shares = await Shares.new(hub.address, 'Token2', 'TKN2');

    await hub.setContractAddress('Owner', owner, { from: owner });

    await profileStorage.createProfile(identityId, nodeId, shares.address);

    // Delete the profile
    await profileStorage.deleteProfile(identityId);

    // Check that the profile was deleted
    const result = await profileStorage.getProfile(identityId);
    expect(result[0]).to.equal(null);
    expect(result[1][0].toNumber()).to.deep.equal(0);
    expect(result[1][1].toNumber()).to.deep.equal(0);
    expect(result[2]).to.equal('0x0000000000000000000000000000000000000000');
  });

  it('should allow setting and getting the profile node ID', async () => {
    // Create a profile
    const identityId = 1;
    const shares = await Shares.new(hub.address, 'Token3', 'TKN3');

    await hub.setContractAddress('Owner', owner, { from: owner });

    await profileStorage.createProfile(identityId, nodeId, shares.address);

    // Set the profile node ID
    await profileStorage.setNodeId(identityId, newNodeId);

    // Get the profile node ID
    const resultNodeId = await profileStorage.getNodeId(identityId);
    expect(resultNodeId).to.equal(newNodeId);
  });

  it('should allow setting and getting parameters', async () => {
    // Create a profile
    const identityId = 1;
    const shares = await Shares.new(hub.address, 'Token4', 'TKN4');
    await hub.setContractAddress('Owner', owner, { from: owner });

    await profileStorage.createProfile(identityId, nodeId, shares.address);

    // Set the profile accumulated operator fee
    const newOperatorFeeAmount = 123;
    await profileStorage.setAccumulatedOperatorFee(identityId, newOperatorFeeAmount);

    // Get the profile accumulated operator fee
    const resultOperatorFeeAmount = await profileStorage.getAccumulatedOperatorFee(identityId);
    expect(resultOperatorFeeAmount.toNumber()).to.equal(newOperatorFeeAmount);

    const newAsk = 1;
    await profileStorage.setAsk(identityId, newAsk);

    // Get the profile accumulated operator fee
    const resultAsk = await profileStorage.getAsk(identityId);
    expect(resultAsk.toNumber()).to.equal(newAsk);

    // Set the profile operator fee withdrawal timestamp
    const newOperatorFeeWithdrawalTimestamp = 1234567890;
    await profileStorage.setAccumulatedOperatorFeeWithdrawalTimestamp(identityId, newOperatorFeeWithdrawalTimestamp);

    // Get the profile operator fee withdrawal timestamp
    const resultOperatorFeeWithdrawalTimestamp = await profileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(
      identityId,
    );
    expect(resultOperatorFeeWithdrawalTimestamp.toNumber()).to.equal(newOperatorFeeWithdrawalTimestamp);

    // Set the profile operator fee withdrawal timestamp
    const newOperatorFeeWithdrawalAmount = 5;
    await profileStorage.setAccumulatedOperatorFeeWithdrawalAmount(identityId, newOperatorFeeWithdrawalAmount);

    // Get the profile operator fee withdrawal timestamp
    const resultOperatorFeeWithdrawalAmount = await profileStorage.getAccumulatedOperatorFeeWithdrawalAmount(
      identityId,
    );
    expect(resultOperatorFeeWithdrawalAmount.toNumber()).to.equal(newOperatorFeeWithdrawalAmount);
  });

  it('should allow checking if profile exists and node registered', async () => {
    // Create a profile
    const identityId = 1;
    const shares = await Shares.new(hub.address, 'Token5', 'TKN5');
    await hub.setContractAddress('Owner', owner, { from: owner });

    await profileStorage.createProfile(identityId, nodeId, shares.address);

    const result = await profileStorage.profileExists(identityId);
    expect(result).to.equal(true);
    const wrongIdentityId = 2;
    const newResult = await profileStorage.profileExists(wrongIdentityId);
    expect(newResult).to.equal(false);

    const registeredResult = await profileStorage.nodeIdsList(nodeId);

    expect(registeredResult).to.equal(true);

    const wrongRegisteredResult = await profileStorage.nodeIdsList(wrongNodeId);

    expect(wrongRegisteredResult).to.equal(false);
  });
});
