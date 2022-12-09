const { expect } = require("chai");
const {
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');
const { ethers } = require("ethers");

const Hub = artifacts.require("Hub");
const ERC20Token = artifacts.require('ERC20Token');
const IdentityStorage = artifacts.require('IdentityStorage');
const Identity = artifacts.require('Identity');
const Profile = artifacts.require("Profile");
const WhitelistStorage = artifacts.require("WhitelistStorage");

let hub;
let erc20Token;
let profile;
let whitelistStorage;

let account0Key;
let nodeIdString;
let nodeId;

contract("Profile", (accounts) => {

    before(async () => {
        hub = await Hub.deployed();
        erc20Token = await ERC20Token.deployed();
        profile = await Profile.deployed();
        whitelistStorage = await WhitelistStorage.deployed();

        account0Key = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [accounts[0]]));
        account1Key = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [accounts[1]]));
        nodeIdString = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj";
        nodeId = web3.utils.asciiToHex(nodeIdString);
        nodeId1String = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtg";
        nodeId1 = web3.utils.asciiToHex(nodeId1String);

        const promises = [];
        const tokenAmount = 1000000;

        for (let i = 0; i < accounts.length; i += 1) {
            promises.push(erc20Token.mint(
                accounts[i],
                tokenAmount,
                {from: accounts[0]},
            ));
        }
        await Promise.all(promises);
    });

    it("should allow creating a profile", async () => {
        const receipt = await profile.createProfile(accounts[0], nodeId, "Token", "TKN", {from: accounts[0]});

        await expectEvent.inLogs(receipt.logs, 'ProfileCreated', {
            identityId: '1',
            nodeId: nodeId,
        });

        await expectEvent.inTransaction(receipt.tx, Identity, 'IdentityCreated', {
            identityId: '1',
            operationalKey: account0Key,
            adminKey: account0Key,
        });

        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: '1',
            key: account0Key,
            purpose: '1',
            keyType: '1',
        });

        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: '1',
            key: account0Key,
            purpose: '2',
            keyType: '1'
        });
    });

    it("should not allow creating profile (whitelist enabled) for node not in the whitelist", async () => {
        await whitelistStorage.enableWhitelist();

        await expectRevert(
            profile.createProfile(accounts[0], nodeId, "Token", "TKN", {from: accounts[0]}),
            "Address isn't whitelisted",
        );
    });

    it("should allow creating profile (whitelist enabled) for node in the whitelist", async () => {
        await whitelistStorage.enableWhitelist();

        await whitelistStorage.whitelistAddress(accounts[1]);

        const receipt = await profile.createProfile(accounts[1], nodeId1, "Token1", "TKN1", {from: accounts[1]});

        await expectEvent.inLogs(receipt.logs, 'ProfileCreated', {
            identityId: '2',
            nodeId: nodeId1,
        });

        await expectEvent.inTransaction(receipt.tx, Identity, 'IdentityCreated', {
            identityId: '2',
            operationalKey: account1Key,
            adminKey: account1Key,
        });

        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: '2',
            key: account1Key,
            purpose: '1',
            keyType: '1',
        });

        await expectEvent.inTransaction(receipt.tx, IdentityStorage, 'KeyAdded', {
            identityId: '2',
            key: account1Key,
            purpose: '2',
            keyType: '1'
        });

        await expectRevert(
            profile.createProfile(accounts[2], nodeId, "Token2", "TKN2", {from: accounts[2]}),
            "Address isn't whitelisted",
        );
    });
//
//     it("should allow getting the profile", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//         // Get the profile
//         const profileData = await profile.getProfile(identityId);
//         expect(profileData.nodeId).to.equal("TestNodeId");
//         expect(profileData.adminWallet).to.equal(owner);
//     });
//
//     it("should allow checking if a node ID is registered", async () => {
// // Create a profile
//         await profile.createProfile(owner, "TestNodeId", {from: owner});
//
// // Check if the node ID is registered
//         const registered = await profile.nodeIdRegistered("TestNodeId");
//         expect(registered).to.be.true;
//     });
//
//     it("should allow getting the profile by node ID", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
// // Get the profile by node ID
// // Get the profile by node ID
//         const profileData = await profile.getProfileByNodeId("TestNodeId");
//         expect(profileData.identityId).to.equal(identityId);
//         expect(profileData.nodeId).to.equal("TestNodeId");
//         expect(profileData.adminWallet).to.equal(owner);
//     });
//
//     it("should allow setting and getting the available node addresses", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//
// // Set the available node addresses
//         const addresses = [owner, nonOwner];
//         await profile.setAvailableNodeAddresses(identityId, addresses, {from: owner});
//
// // Get the available node addresses
//         const nodeAddresses = await profile.getAvailableNodeAddresses(identityId);
//         expect(nodeAddresses[0]).to.equal(owner);
//         expect(nodeAddresses[1]).to.equal(nonOwner);
//     });
//
//     it("should allow adding and removing an address from the available node addresses", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//         // Add an address to the available node addresses
//         await profile.addAvailableNodeAddress(identityId, nonOwner, {from: owner});
//         const nodeAddresses = await profile.getAvailableNodeAddresses(identityId);
//         expect(nodeAddresses[0]).to.equal(nonOwner);
//
// // Remove an address from the available node addresses
//         await profile.removeAvailableNodeAddress(identityId, nonOwner, {from: owner});
//         const remainingAddresses = await profile.getAvailableNodeAddresses(identityId);
//         expect(remainingAddresses.length).to.equal(0);
//     });
//
//     it("should allow setting and getting the profile metadata", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//         // Set the profile metadata
//         const metadata = "Test metadata";
//         await profile.setProfileMetadata(identityId, metadata, {from: owner});
//         // Get the profile metadata
//         const profileMetadata = await profile.getProfileMetadata(identityId);
//         expect(profileMetadata).to.equal(metadata);
//     });
//
//     it("should allow setting and getting the profile metadata hash", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//         // Set the profile metadata hash
//         const metadata = "Test metadata";
//         const metadataHash = await web3.utils.sha3(metadata);
//         await profile.setProfileMetadataHash(identityId, metadataHash, {from: owner});
//
// // Get the profile metadata hash
//         const profileMetadataHash = await profile.getProfileMetadataHash(identityId);
//         expect(profileMetadataHash).to.equal(metadataHash);
//     });
//
//     it("should allow setting and getting the profile metadata URI", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//
// // Set the profile metadata URI
//         const metadataUri = "Test metadata URI";
//         await profile.setProfileMetadataUri(identityId, metadataUri, {from: owner});
//
// // Get the profile metadata URI
//         const profileMetadataUri = await profile.getProfileMetadataUri(identityId);
//         expect(profileMetadataUri).to.equal(metadataUri);
//     });
//
//     it("shouldallow setting and getting the profile image URI", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//
// // Set the profile image URI
//         const imageUri = "Test image URI";
//         await profile.setProfileImageUri(identityId, imageUri, {from: owner});
//
// // Get the profile image URI
//         const profileImageUri = await profile.getProfileImageUri(identityId);
//         expect(profileImageUri).to.equal(imageUri);
//     });
//
//     it("should allow setting and getting the profile background image URI", async () => {
// // Create a profile
//         const identityId = (await profile.createProfile(owner, "TestNodeId", {from: owner})).logs[0].args.identityId;
//
// // Set the profile background image URI
//         const backgroundImageUri = "Test background image URI";
//         await profile.setProfileBackgroundImageUri(identityId, backgroundImageUri, {from: owner});
//
// // Get the profile background image URI
//         const profileBackgroundImageUri = await profile.getProfileBackgroundImageUri(identityId);
//         expect(profileBackgroundImageUri).to.equal(backgroundImageUri);
//     });

});
