const ProfileStorage = artifacts.require("ProfileStorage");
const Hub = artifacts.require("Hub");
const { expect } = require("chai");

contract("ProfileStorage", accounts => {
    let profileStorage;
    let hub;
    const owner = accounts[0];
    const nodeIdString = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj";
    const nodeId = web3.utils.asciiToHex(nodeIdString);

    const newIdString = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj";
    const newNodeId = web3.utils.asciiToHex(newIdString);

    beforeEach(async () => {
        // Deploy a new instance of ProfileStorage before each test
        hub = await Hub.deployed();
        profileStorage = await ProfileStorage.new(hub.address);
    });

    it("should allow creating and getting a profile", async () => {
        // Create a profile
        const identityId = 1;
        const sharesContractAddress = accounts[1];

        await hub.setContractAddress('Owner', owner, {from: owner});

        await profileStorage.createProfile(identityId, nodeId, sharesContractAddress, {from: owner});

        // Get the profile
        const result = await profileStorage.getProfile(identityId);
        expect(result[0]).to.equal(nodeId);
        expect(result[1][0].toNumber()).to.deep.equal(0);
        expect(result[1][1].toNumber()).to.deep.equal(0);
        expect(result[2]).to.equal(sharesContractAddress);

    });

    it("should allow deleting a profile", async () => {
        // Create a profile
        const identityId = 1;
        const sharesContractAddress = accounts[0];

        await hub.setContractAddress('Owner', owner, {from: owner});

        await profileStorage.createProfile(identityId, nodeId, sharesContractAddress);

        // Delete the profile
        await profileStorage.deleteProfile(identityId);

        // Check that the profile was deleted
        const result = await profileStorage.getProfile(identityId);
        expect(result[0]).to.be.null;
        expect(result[1][0].toNumber()).to.deep.equal(0);
        expect(result[1][1].toNumber()).to.deep.equal(0);
        expect(result[2]).to.equal('0x0000000000000000000000000000000000000000');
    });

    it("should allow setting and getting the profile node ID", async () => {
        // Create a profile
        const identityId = 1;
        const sharesContractAddress = accounts[0];

        await hub.setContractAddress('Owner', owner, {from: owner});

        await profileStorage.createProfile(identityId, nodeId, sharesContractAddress);

        // Set the profile node ID
        await profileStorage.setNodeId(identityId, newNodeId);

        // Get the profile node ID
        const resultNodeId = await profileStorage.getNodeId(identityId);
        expect(resultNodeId).to.equal(newNodeId);
    });

    it("should allow setting and getting the profile ask, operator fee, accumulatedOperatorFeeWithdrawalAmount, operatorFeeWithdrawalTimestamp", async () => {
        // Create a profile
        const identityId = 1;
        const sharesContractAddress = accounts[0];
        await hub.setContractAddress('Owner', owner, {from: owner});

        await profileStorage.createProfile(identityId, nodeId, sharesContractAddress);

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
        const resultOperatorFeeWithdrawalTimestamp = await profileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(identityId);
        expect(resultOperatorFeeWithdrawalTimestamp.toNumber()).to.equal(newOperatorFeeWithdrawalTimestamp);

        // Set the profile operator fee withdrawal timestamp
        const newOperatorFeeWithdrawalAmount = 5;
        await profileStorage.setAccumulatedOperatorFeeWithdrawalAmount(identityId, newOperatorFeeWithdrawalAmount);

// Get the profile operator fee withdrawal timestamp
        const resultOperatorFeeWithdrawalAmount= await profileStorage.getAccumulatedOperatorFeeWithdrawalAmount(identityId);
        expect(resultOperatorFeeWithdrawalAmount.toNumber()).to.equal(newOperatorFeeWithdrawalAmount);
    });

    if("should allow checking if profile exists and node registered", async () => {
        // Create a profile
        const identityId = 1;
        const sharesContractAddress = accounts[0];
        await hub.setContractAddress('Owner', owner, {from: owner});

        await profileStorage.createProfile(identityId, nodeId, sharesContractAddress);

        const result = profileStorage.profileExists(identityId);
        expect(result).to.be.true;
        const wrongIdentityId = 2;
        const newResult = profileStorage.profileExists(wrongIdentityId);
        expect(newResult).to.be.false;

        const registeredResult = await profileStorage.nodeIdRegistered(nodeId);

        expect(registeredResult).to.be.true;

        const wrongRegisteredResult = await profileStorage.nodeIdRegistered(newNodeId);

        expect(wrongRegisteredResult).to.be.false;
    });
})
