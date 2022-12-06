const Hub = artifacts.require("Hub");
const { expect } = require("chai");

contract("Hub", () => {
    let hub;
    let owner;
    let nonOwner;

    before(async () => {
        hub = await Hub.new();
        owner = await hub.owner();
        nonOwner = (await web3.eth.getAccounts())[1];
    });

    it("should set the contract name and version", async () => {
        const name = await hub.name();
        expect(name).to.equal("Hub");

        const version = await hub.version();
        expect(version).to.equal("1.0.0");
    });

    it("should only allow the owner to set contract addresses", async () => {
        // Try to set a contract address from a non-owner account

        try {
            await hub.setContractAddress("Test", nonOwner, {from: nonOwner});
            expect.fail("Non-owner was able to set contract address");
        } catch (err) {
            expect(err.message).to.include("Ownable: caller is not the owner");
        }

        // Set a contract address from the owner account
        const tx = await hub.setContractAddress("Test", nonOwner, {from: owner});
        expect(tx.logs[0].args.contractName).to.equal("Test");
        expect(tx.logs[0].args.newContractAddress).to.equal(nonOwner);
    });

    it("should allow setting and updating contract addresses", async () => {
        // Set a contract address
        const tx1 = await hub.setContractAddress("Test", owner, {from: owner});
        expect(tx1.logs[0].args.contractName).to.equal("Test");
        expect(tx1.logs[0].args.newContractAddress).to.equal(owner);

        // Update the contract address
        const tx2 = await hub.setContractAddress("Test", nonOwner, {from: owner});
        expect(tx2.logs[0].args.contractName).to.equal("Test");
        expect(tx2.logs[0].args.newContractAddress).to.equal(nonOwner);
    });

    it("should allow getting contract addresses by name", async () => {
        // Set a contract address
        await hub.setContractAddress("Test", nonOwner, {from: owner});

        // Get the contract address by name
        const address1 = await hub.getContractAddress("Test");
        expect(address1).to.equal(nonOwner);
    });

    it("should allow getting all contract addresses", async () => {
        // Set multiple contract addresses
        await hub.setContractAddress("Test1", owner, {from: owner});
        await hub.setContractAddress("Test2", nonOwner, {from: owner});

        // Get all contract addresses
        const contracts = await hub.getAllContracts();
        expect(contracts[contracts.length - 2].name).to.equal("Test1");
        expect(contracts[contracts.length - 2].addr).to.equal(owner);
        expect(contracts[contracts.length - 1].name).to.equal("Test2");
        expect(contracts[contracts.length - 1].addr).to.equal(nonOwner);
    });

    it("should allow checking if a contract exists by name and address", async () => {
        // Set a contract address
        await hub.setContractAddress("Test", owner, {from: owner});

        // Check if the contract exists by name
        const exists1 = await hub.methods['isContract(string)']("Test");
        expect(exists1).to.be.true;

        // Check if the contract exists by address
        const exists2 = await hub.methods['isContract(address)'](owner);
        expect(exists2).to.be.true;

        // Check if a non-existent contract exists
        const exists3 = await hub.methods['isContract(string)']("NonExistent");
        expect(exists3).to.be.false;
    });

    it("should allow setting and updating asset contract addresses", async () => {
        // Set an asset contract address
        const tx1 = await hub.setAssetContractAddress("Test", owner, {from: owner});
        expect(tx1.logs[0].args.assetContractName).to.equal("Test");
        expect(tx1.logs[0].args.assetContractAddress).to.equal(owner);

        // Update the asset contract address
        const tx2 = await hub.setAssetContractAddress("Test", nonOwner, {from: owner});
        expect(tx2.logs[0].args.assetContractName).to.equal("Test");
        expect(tx2.logs[0].args.assetContractAddress).to.equal(nonOwner);
    });

    it("should allow getting asset contract addresses by name and address", async () => {
        // Set an asset contract address
        await hub.setAssetContractAddress("Test", nonOwner, {from: owner});

        // Get the asset contract address by name
        const address1 = await hub.getAssetContractAddress("Test");
        expect(address1).to.equal(nonOwner);

        // Get the asset contract address by address
        const address2 = await hub.getAssetContractAddress(nonOwner);
        expect(address2).to.equal(nonOwner);
    });

    it("should allow getting all asset contract addresses", async () => {
        // Set multiple asset contract addresses
        await hub.setAssetContractAddress("Test1", owner, {from: owner});
        await hub.setAssetContractAddress("Test2", nonOwner, {from: owner});

        // Get all asset contract addresses
        const contracts = await hub.getAllAssetContracts();
        expect(contracts[0].name).to.equal("Test1");
        expect(contracts[0].addr).to.equal(owner);
        expect(contracts[1].name).to.equal("Test2");
        expect(contracts[1].addr).to.equal(nonOwner);
    });

    it("should allow checking if an asset contract exists by name and address", async () => {
        // Set an asset contract address
        await hub.setAssetContractAddress("Test", owner, {from: owner});

        // Check if the asset contract exists by name
        const exists1 = await hub.isAssetContract("Test");
        expect(exists1).to.be.true;

        // Check if the asset contract exists by address
        const exists2 = await hub.isAssetContract(owner);
        expect(exists2).to.be.true;

        // Check if a non-existent asset contract exists
        const exists3 = await hub.isAssetContract("NonExistent");
        expect(exists3).to.be.false;
    });
    it("should allow checking if a contract exists by name and address", async () => {
        // Set a contract address
        await hub.setContractAddress("Test", owner, {from: owner});

        // Check if the contract exists by name
        const exists1 = await hub.isContract("Test");
        expect(exists1).to.be.true;

        // Check if the contract exists by address
        const exists2 = await hub.isContract(owner);
        expect(exists2).to.be.true;

        // Check if a non-existent contract exists
        const exists3 = await hub.isContract("NonExistent");
        expect(exists3).to.be.false;
    });

    it("should allow setting and updating asset contract addresses", async () => {
        // Set an asset contract address
        const tx1 = await hub.setAssetContractAddress("Test", owner, {from: owner});
        expect(tx1.logs[0].args.assetContractName).to.equal("Test");
        expect(tx1.logs[0].args.assetContractAddress).to.equal(owner);

        // Update the asset contract address
        const tx2 = await hub.setAssetContractAddress("Test", nonOwner, {from: owner});
        expect(tx2.logs[0].args.assetContractName).to.equal("Test");
        expect(tx2.logs[0].args.assetContractAddress).to.equal(nonOwner);
    });

    it("should allow getting asset contract addresses by name and address", async () => {
        // Set an asset contract address
        await hub.setAssetContractAddress("Test", nonOwner, {from: owner});

        // Get the asset contract address by name
        const address1 = await hub.getAssetContractAddress("Test");
        expect(address1).to.equal(nonOwner);

        // Get the asset contract address by address
        const address2 = await hub.getAssetContractAddress(nonOwner);
        expect(address2).to.equal(nonOwner);
    });

    it("should allow getting all asset contract addresses", async () => {
// Set multiple asset contract addresses
        await hub.setAssetContractAddress("Test1", owner, {from: owner});
        await hub.setAssetContractAddress("Test2", nonOwner, {from: owner});
// Get all asset contract addresses
        const contracts = await hub.getAllAssetContracts();
        expect(contracts[0].name).to.equal("Test1");
        expect(contracts[0].addr).to.equal(owner);
        expect(contracts[1].name).to.equal("Test2");
        expect(contracts[1].addr).to.equal(nonOwner);
    });

    it("should allow checking if an asset contract exists by name and address", async () => {
// Set an asset contract address
        await hub.setAssetContractAddress("Test", owner, {from: owner});
        // Check if the asset contract exists by name
        const exists1 = await hub.isAssetContract("Test");
        expect(exists1).to.be.true;

// Check if the asset contract exists by address
        const exists2 = await hub.isAssetContract(owner);
        expect(exists2).to.be.true;

// Check if a non-existent asset contract exists
        const exists3 = await hub.isAssetContract("NonExistent");
        expect(exists3).to.be.false;
    });
});
