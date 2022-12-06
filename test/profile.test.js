const Profile = artifacts.require("Profile");
const Hub = artifacts.require("Hub");
const Identity = artifacts.require("Identity");
const ERC20Token = artifacts.require('ERC20Token');
const Staking = artifacts.require("Staking");
const IdentityStorage = artifacts.require("IdentityStorage");
const ProfileStorage = artifacts.require("ProfileStorage");
const WhitelistStorage = artifacts.require("WhitelistStorage");
const HashingProxy = artifacts.require("HashingProxy");
const { expect } = require("chai");

contract("Profile", () => {
//     let hub;
//     let profile;
//     let token;
//     let profileStorage;
//     let owner;
//     let nonOwner;
//     let identityStorage;
//
//     const nodeIdString = "QmWyf2dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj";
//     const nodeId = web3.utils.asciiToHex(nodeIdString);
//
//     beforeEach(async () => {
//         // Deploy the contracts
//         token = await ERC20Token.deployed();
//         hub = await Hub.new();
//         owner = await hub.owner();
//         nonOwner = (await web3.eth.getAccounts())[1];
//         identityStorage = await IdentityStorage.new(hub.address);
//         // Initialize the contracts
//         await hub.setContractAddress("Identity", Identity.address, {from: owner});
//         await hub.setContractAddress("Staking", Staking.address, {from: owner});
//         await hub.setContractAddress("IdentityStorage", identityStorage.address, {from: owner});
//         await hub.setContractAddress("HashingProxy", HashingProxy.address, {from: owner});
//         await hub.setContractAddress("Token", token.address, {from: owner});
//
//         profileStorage = await ProfileStorage.new(hub.address);
//         await hub.setContractAddress("ProfileStorage", ProfileStorage.address, {from: owner});
//         await hub.setContractAddress("WhitelistStorage", WhitelistStorage.address, {from: owner});
//
//         profile = await Profile.new(hub.address);
//         await hub.setContractAddress("Profile", profile.address, {from: owner});
//         // await profile.initialize({from: owner});
//     });
//
//     it("should allow creating a profile", async () => {
// // Create a profile
//         const tx1 = await profile.createProfile(owner, nodeId, {from: owner});
//         expect(tx1.logs[0].args.identityId.toNumber()).to.equal(1);
//         expect(web3.utils.hexToUtf8(tx1.logs[0].args.nodeId)).to.equal(nodeIdString);
//         // todo validate profile is created
//     });
//
//     it("should allow updating the ask price", async () => {
// // Create a profile
//
//         const identityId = (await profile.createProfile(owner, nodeId, {from: owner})).logs[0].args.identityId;
//         // Update the ask price
//         const tx = await profile.setAsk(identityId, 1000, {from: owner});
//         expect(tx.logs[0].args.identityId).to.equal(identityId);
//         expect(tx.logs[0].args.nodeId).to.equal(nodeId);
//         expect(tx.logs[0].args.ask).to.equal(1000);
//     });
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





