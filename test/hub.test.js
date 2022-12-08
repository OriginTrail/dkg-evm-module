const { expect } = require('chai');

const {
    constants,    // Common constants, like the zero address and largest integers
    expectEvent,  // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
  } = require('@openzeppelin/test-helpers');

const Hub = artifacts.require('Hub');
const ERC20Token = artifacts.require('ERC20Token');

// Contracts used in test
let hub;
let erc20Token;

contract('DKG v6 Hub', async (accounts) => {

    before(async () => {
        hub = await Hub.deployed();
        erc20Token = await ERC20Token.deployed();

        const promises = [];
        const amountToDeposit = 3000;
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

    it('the contract is named "Hub"', async () => {
        // Expect that the contract's name is "Hub"
        expect(await hub.name()).to.equal('Hub');
    });
    
    it('the contract is version "1.0.0"', async () => {
        // Expect that the contract's version is "1.0.0"
        expect(await hub.version()).to.equal('1.0.0');
    });

    it('sets correct contract address and name; emits NewContract event', async () => {
        const receipt = await hub.setContractAddress('TestContract1', accounts[1], { from: accounts[0] });

        expect(await hub.getContractAddress('TestContract1')).to.equal(accounts[1]);

        expectEvent(receipt, 'NewContract', {
            contractName: 'TestContract1',
            newContractAddress: accounts[1],
        });
    });

    it('set contract address and name (non-owner wallet); expect revert: only hub owner can set contracts', async () => {
        await expectRevert(
            hub.setContractAddress('TestContract1', accounts[1], { from: accounts[1] }),
            "Ownable: caller is not the owner",
        );
    });

    it('set contract with empty name; expect revert: name cannot be empty', async () => {
        await expectRevert(
            hub.setContractAddress('', accounts[1], { from: accounts[0] }),
            "NamedContractSet: Name cannot be empty",
        );
    });

    it('set contract with empty address; expect revert: address cannot be 0x0', async () => {
        await expectRevert(
            hub.setContractAddress('TestContract1', constants.ZERO_ADDRESS, { from: accounts[0] }),
            "NamedContractSet: Address cannot be 0x0",
        );
    });

    it('updates contract address; emits ContractChanged event', async () => {
        const receipt = await hub.setContractAddress('TestContract1', accounts[2], { from: accounts[0] });

        expect(await hub.getContractAddress('TestContract1')).to.equal(accounts[2]);

        expectEvent(receipt, 'ContractChanged', {
            contractName: 'TestContract1',
            newContractAddress: accounts[2],
        });
    });

    it('sets contract address; name should be in the Hub', async () => {
        await hub.setContractAddress('TestContract2', accounts[1], { from: accounts[0] });

        expect(await hub.isContract('TestContract2')).to.be.true;
    });

    it('sets contract address; address should be in the Hub', async () => {
        await hub.setContractAddress('TestContract3', accounts[3], { from: accounts[0] });

        expect(await hub.methods['isContract(address)'](accounts[3])).to.be.true;
    });

    it('get all contracts; all addresses and names should be in the Hub', async () => {
        const contracts = await hub.getAllContracts();

        contracts.forEach(async (contract) => {
            expect(await hub.getContractAddress(contract.name)).to.equal(contract.addr);
        });
    });

    it('sets correct asset contract address and name; emits NewAssetContract event', async () => {
        const receipt = await hub.setAssetStorageAddress('TestAssetContract1', accounts[1], { from: accounts[0] });

        expect(await hub.getAssetStorageAddress('TestAssetContract1')).to.equal(accounts[1]);

        expectEvent(receipt, 'NewAssetStorage', {
            contractName: 'TestAssetContract1',
            newContractAddress: accounts[1],
        });
    });

    it('set asset contract address and name (non-owner wallet); expect revert: only hub owner can set contracts', async () => {
        await expectRevert(
            hub.setAssetStorageAddress('TestAssetContract1', accounts[1], { from: accounts[1] }),
            "Ownable: caller is not the owner",
        );
    });

    it('set asset contract with empty name; expect revert: name cannot be empty', async () => {
        await expectRevert(
            hub.setAssetStorageAddress('', accounts[1], { from: accounts[0] }),
            "NamedContractSet: Name cannot be empty",
        );
    });

    it('set asset contract with empty address; expect revert: address cannot be 0x0', async () => {
        await expectRevert(
            hub.setAssetStorageAddress('TestAssetContract1', constants.ZERO_ADDRESS, { from: accounts[0] }),
            "NamedContractSet: Address cannot be 0x0",
        );
    });

    it('updates asset contract address; emits AssetContractChanged event', async () => {
        const receipt = await hub.setAssetStorageAddress('TestAssetContract1', accounts[2], { from: accounts[0] });

        expect(await hub.getAssetStorageAddress('TestAssetContract1')).to.equal(accounts[2]);

        expectEvent(receipt, 'AssetStorageChanged', {
            contractName: 'TestAssetContract1',
            newContractAddress: accounts[2],
        });
    });

    it('sets asset contract address; name should be in the Hub', async () => {
        await hub.setAssetStorageAddress('TestAssetContract2', accounts[1], { from: accounts[0] });

        expect(await hub.isAssetStorage('TestAssetContract2')).to.be.true;
    });

    it('sets asset contract address; address should be in the Hub', async () => {
        await hub.setAssetStorageAddress('TestAssetContract3', accounts[3], { from: accounts[0] });

        expect(await hub.methods['isAssetStorage(address)'](accounts[3])).to.be.true;
    });

    it('get all asset contracts; all addresses and names should be in the Hub', async () => {
        const contracts = await hub.getAllAssetStorages();

        contracts.forEach(async (contract) => {
            expect(await hub.getAssetStorageAddress(contract.name)).to.equal(contract.addr);
        });
    });

});
