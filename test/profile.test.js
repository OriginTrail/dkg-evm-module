const { expect } = require("chai");
const {
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');
const truffleAssert = require('truffle-assertions');
const { ethers } = require("ethers");

const IdentityStorage = artifacts.require('IdentityStorage');
const Identity = artifacts.require('Identity');
const Profile = artifacts.require('Profile');
const WhitelistStorage = artifacts.require('WhitelistStorage');
const ProfileStorage = artifacts.require('ProfileStorage')

let profile, whitelistStorage, profileStorage;
let account0Key, account1Key, nodeId1String, nodeIdString, nodeId2String, nodeId, nodeId1, nodeId2;
let identityId, newIdentityId, newOperatorFeeAmount;

contract("Profile", (accounts) => {
    let owner = accounts[0];

    before('Deploy a new instance of Profile before tests', async () => {
        profile = await Profile.deployed();
        whitelistStorage = await WhitelistStorage.deployed();
        profileStorage = await ProfileStorage.deployed();

        account0Key = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [owner]));
        account1Key = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [accounts[1]]));
        nodeIdString = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj";
        nodeId1String = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtg";
        nodeId2String = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gth"
        nodeId = web3.utils.asciiToHex(nodeIdString);
        nodeId1 = web3.utils.asciiToHex(nodeId1String);
        nodeId2 = web3.utils.asciiToHex(nodeId2String);
    });

    it("Create a profile with whitelisted node, expect to pass", async () => {
        const receipt = await profile.createProfile(owner, nodeId, "Token", "TKN", { from: owner });
        identityId = receipt.logs[0].args.identityId;

        await expectEvent.inLogs(receipt.logs, 'ProfileCreated', {
            identityId: identityId.toString(),
            nodeId: nodeId,
        });
        await expectEvent.inTransaction(receipt.tx, Identity, 'IdentityCreated', {
            identityId: identityId.toString(),
            operationalKey: account0Key,
            adminKey: account0Key,
        });
        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: identityId.toString(),
            key: account0Key,
            purpose: '1',
            keyType: '1',
        });
        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: identityId.toString(),
            key: account0Key,
            purpose: '2',
            keyType: '1'
        });
    });

    it("Cannot create a profile with not whitelisted node, expect to fail", async () => {
        await whitelistStorage.enableWhitelist();
        const isWhitelisted = await whitelistStorage.whitelisted(owner);

        expect(isWhitelisted).to.be.false;

        await expectRevert(
            profile.createProfile(accounts[1], nodeId, "Token", "TKN", { from: accounts[1] }),
            "Address isn't whitelisted",
        );
    });

    it("Should allow creating a profile (whitelist enabled) for node in the whitelist", async () => {
        await whitelistStorage.enableWhitelist();

        await whitelistStorage.whitelistAddress(accounts[1]);

        const receipt = await profile.createProfile(accounts[1], nodeId1, "Token1", "TKN1", { from: accounts[1] });
        const identityId2 = receipt.logs[0].args.identityId;

        await expectEvent.inLogs(receipt.logs, 'ProfileCreated', {
            identityId: identityId2.toString(),
            nodeId: nodeId1,
        });

        await expectEvent.inTransaction(receipt.tx, Identity, 'IdentityCreated', {
            identityId: identityId2.toString(),
            operationalKey: account1Key,
            adminKey: account1Key,
        });

        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: identityId2.toString(),
            key: account1Key,
            purpose: '1',
            keyType: '1',
        });

        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: identityId2.toString(),
            key: account1Key,
            purpose: '2',
            keyType: '1'
        });

        await expectRevert(
            profile.createProfile(accounts[2], nodeId, "Token2", "TKN2", { from: accounts[2] }),
            "Address isn't whitelisted",
        );
    });

    it('Cannot create a profile with existing identity, expect to fail', async () => {
        await whitelistStorage.whitelistAddress(owner);

        await expectRevert(profile.createProfile(owner, nodeId, "Token", "TKN", { from: owner }), 'Identity already exists');
    });

    it('Cannot create a profile with registered nodeId, expect to fail', async () =>{
        const isRegistered = await profileStorage.nodeIdsList(nodeId);
        expect(isRegistered).to.be.true;

        await whitelistStorage.whitelistAddress(accounts[3]);
        await expectRevert(profile.createProfile(accounts[3], nodeId, "Token5", "TKN5", { from: accounts[3] }), 'Node ID is already registered');
    });

    it('Cannot create a profile without nodeId, expect to fail', async () => {
        await whitelistStorage.whitelistAddress(accounts[3]);
        await expectRevert(profile.createProfile(accounts[3], '0x',"Token5", "TKN5", { from: accounts[3] }), 'Node ID can\'t be empty');
    });

    it('Cannot create a profile without tokenName, expect to fail', async () => {
        await whitelistStorage.whitelistAddress(accounts[3]);
        await expectRevert(profile.createProfile(accounts[3], nodeId2,'', "TKN5", { from: accounts[3] }), 'Token name cannot be empty');
    });

    it('Cannot create a profile without tokenSymbol, expect to fail', async () => {
        await whitelistStorage.whitelistAddress(accounts[3]);
        await expectRevert(profile.createProfile(accounts[3], nodeId2, 'Token5', "", { from: accounts[3] }), 'Token symbol cannot be empty');
    });

    it('Cannot create a profile with taken tokenName, expect to fail', async () => {
        const isTaken = await profileStorage.sharesNames('Token');
        expect(isTaken).to.be.true;

        await whitelistStorage.whitelistAddress(accounts[3]);
        await expectRevert(profile.createProfile(accounts[3], nodeId2, 'Token', "TKN", { from: accounts[3] }), 'Token name is already taken');
    });

    it('Cannot create a profile with taken tokenSymbol, expect to fail', async () => {
        const isTaken = await profileStorage.sharesSymbols('TKN');
        expect(isTaken).to.be.true;

        await whitelistStorage.whitelistAddress(accounts[3]);
        await expectRevert(profile.createProfile(accounts[3], nodeId2, 'Token7', "TKN", { from: accounts[3] }), 'Token symbol is already taken');
    });

    it('Set ask for a profile, expect to pass', async () => {
        const newAsk = 1;
        const setAskResponse = await profile.setAsk(identityId, newAsk, { from: owner });

        await expectEvent.inLogs(setAskResponse.logs, 'AskUpdated', {
            identityId: identityId.toString(),
            nodeId: nodeId,
            ask: newAsk.toString()
        });
    });

    it('Set ask for a profile to be 0, expect to fail', async () => {
        await expectRevert(
            profile.setAsk(identityId.toString(), 0, { from: owner }),
            "Ask cannot be 0",
        );
    });

    it('Set ask for a profile with non identity owner, expect to fail', async () => {
        await expectRevert.unspecified(
            profile.setAsk(identityId.toString(), 1, { from: accounts[2] })
        );
    });

    it('Get and verify data for created profile, expect to pass', async () => {
        const getProfileSharesContractAddress = await profileStorage.getSharesContractAddress(identityId.toString());
        const profileData = await profileStorage.getProfile(identityId.toString());

        expect(profileData[0]).to.equal(nodeId);
        expect(profileData[1][0].toNumber()).to.deep.equal(1);
        expect(profileData[1][1].toNumber()).to.deep.equal(0);
        expect(profileData[2]).to.equal(getProfileSharesContractAddress);
    });

    it('Stake accumulated operator fee for existing profile, expect to pass', async () => {
        await whitelistStorage.whitelistAddress(accounts[4]);
        newIdentityId = (await profile.createProfile(owner, nodeId2, 'Token3', 'TKN3', { from: accounts[4] })).logs[0].args.identityId;
        const getOperatorFee = await profileStorage.getAccumulatedOperatorFee(newIdentityId.toString());
        newOperatorFeeAmount = 123;

        expect(getOperatorFee.toString()).to.be.eql('0');

        await expectRevert(profile.stakeAccumulatedOperatorFee(newIdentityId.toString(), { from: owner }), 'You have no operator fees');
        await truffleAssert.passes(profileStorage.setAccumulatedOperatorFee(newIdentityId.toString(), newOperatorFeeAmount));
        const resultStake = await profileStorage.getAccumulatedOperatorFee(newIdentityId.toString(), { from: owner });

        expect(resultStake.toString()).to.be.eql(newOperatorFeeAmount.toString());
    });

    it('Start and withdraw accumulated operator fee for existing profile, expect to pass', async () => {
        const getOperatorFeeWithdrawal = await profileStorage.getAccumulatedOperatorFeeWithdrawalAmount(newIdentityId.toString());

        expect(getOperatorFeeWithdrawal.toString()).to.be.eql('0');
        await expectRevert(profile.withdrawAccumulatedOperatorFee(newIdentityId.toString(), { from: owner }), 'Withdrawal hasn\'t been initiated');
        await truffleAssert.passes(profile.startAccumulatedOperatorFeeWithdrawal(newIdentityId.toString(), { from: owner }));

        const checkWithdrawalAmount = await profileStorage.getAccumulatedOperatorFeeWithdrawalAmount(newIdentityId.toString());
        const getWithdrawalTimestamp = await profileStorage.getAccumulatedOperatorFeeWithdrawalTimestamp(newIdentityId.toString());

        expect(checkWithdrawalAmount.toString()).to.be.eql(newOperatorFeeAmount.toString());
        expect(getWithdrawalTimestamp.toNumber()).to.not.be.null;
        await expectRevert(profile.withdrawAccumulatedOperatorFee(newIdentityId.toString(), { from: owner }), 'Withdrawal period hasn\'t ended');
    });
});
