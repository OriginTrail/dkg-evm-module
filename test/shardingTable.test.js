const {assert} = require('chai');
const BN = require('bn.js');

const ERC20Token = artifacts.require('ERC20Token');
const Hub = artifacts.require('Hub');
const Profile = artifacts.require('Profile');
const ShardingTable = artifacts.require('ShardingTable');
const ShardingTableStorage = artifacts.require('ShardingTableStorage');
const IdentityStorage = artifacts.require('IdentityStorage');
const ProfileStorage = artifacts.require('ProfileStorage');
const ParametersStorage = artifacts.require('ParametersStorage');
const bytes32 = require('bytes32');

// Helper variables
let peer1 = {
    "id": "0x6c00000000000000000000000000000000000000000000000000000000000000",
    "ask": 1,
    "stake": 50000,
};

let peer2 = {
    "id": "0x6d00000000000000000000000000000000000000000000000000000000000000",
    "ask": 4,
    "stake": 75000,
}

let peer3 = {
    "id": "0x6e00000000000000000000000000000000000000000000000000000000000000",
    "ask": 2,
    "stake": 66000,
}
const ETH_DECIMALS = new BN('1000000000000000000');
const errorPrefix = 'Returned error: VM Exception while processing transaction: ';

// Contracts used in test
let erc20Token, hub, profile, profileStorage, shardingTable,
    shardingTableStorage, identityStorage,  parametersStorage;

contract('DKG v6 ShardingTable', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        erc20Token = await ERC20Token.deployed();
        hub = await Hub.deployed();
        profile = await Profile.deployed();
        shardingTableStorage = await ShardingTableStorage.deployed();
        shardingTable = await ShardingTable.deployed();
        identityStorage = await IdentityStorage.deployed();
        profileStorage = await ProfileStorage.deployed();
        parametersStorage = await ParametersStorage.deployed();

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

    it('Get Sharding Table; send non-existent startingNodeId; expect to fail', async () => {

    });

    it('Add 3 nodes + Get Sharding Table; expect 3 nodes returned', async () => {
        const stake1 = (new BN(peer1.stake).mul(ETH_DECIMALS)).toString();
        const stake2 = (new BN(peer2.stake).mul(ETH_DECIMALS)).toString();
        const stake3 = (new BN(peer3.stake).mul(ETH_DECIMALS)).toString();

        await erc20Token.increaseAllowance(profile.address, stake1, {from: accounts[1]});
        await erc20Token.increaseAllowance(profile.address, stake2, {from: accounts[2]});
        await erc20Token.increaseAllowance(profile.address, stake3, {from: accounts[3]});

        await profile.createProfile(accounts[0], peer1.id, peer1.ask, stake1, {from: accounts[1]});
        await profile.createProfile(accounts[1], peer2.id, peer2.ask, stake2, {from: accounts[2]});
        await profile.createProfile(accounts[2], peer3.id, peer3.ask, stake3, {from: accounts[3]});

        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 3, 'Failed to add 3 nodes to sharding table');
    });

    it('Add 3 nodes + Get Sharding Table; starting from 2; expect 2 nodes returned', async () => {

    });

    it('Add 3 nodes + Get Full Sharding Table; expect 3 nodes returned', async () => {
        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 3, 'Failed to add 3 nodes to sharding table');
    });

    it('Push back; only contract can push back; expect to fail', async () => {
        try {
            await shardingTable.pushBack('0x0000000000000000000000000000000000000000000000000000000000000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Push back; send non-existent identityId; expect to fail', async () => {
        try {
            await shardingTable.pushBack('0x0000000000000000000000000000000000000000000000000000000001000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Push back; expect node added to the end of the sharding table', async () => {

    });

    it('Push front; only contract can push front; expect to fail', async () => {
        try {
            await shardingTable.pushFront('0x0000000000000000000000000000000000000000000000000000000000000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Push front; send non-existent identityId; expect to fail', async () => {
        try {
            await shardingTable.pushFront('0x0000000000000000000000000000000000000000000000000000000001000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Push front; expect node added to the beginning of the sharding table', async () => {

    });

    it('Remove node; only contract can remove node; expect to fail', async () => {
        try {
            await shardingTable.pushFront('0x0000000000000000000000000000000000000000000000000000000001000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Remove node; send non-existent identityId; expect to fail', async () => {
        try {
            await shardingTable.pushFront('0x0000000000000000000000000000000000000000000000000000000001000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Add 1 node + Remove node; expect empty Sharding Table (head/tail - empty)', async () => {

    });

    it('Add 2 nodes + Remove first node; expect 1 node (head/tail) returned', async () => {

    });

    it('Add 2 nodes + Remove second node; expect 1 node (head/tail) returned', async () => {

    });

    it('Add 3 nodes + Remove central node; expect 2 nodes (head+tail) returned', async () => {

    });

    it('Remove node by id; only Hub Owner can remove node by id; expect to fail', async () => {
        try {
            await shardingTable.removeNodeById('0x0000000000000000000000000000000000000000000000000000000001000001', {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Function can only be called by hub owner!'), 'Invalid error message received');
        }
    });

    it('Remove node by id; send non-existent nodeId; expect to fail', async () => {
        try {
            await shardingTable.removeNodeById('0x0011000000000000000000000000000000000000000000000000010001100001');
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(errorPrefix + 'revert Non-existent node id!'), 'Invalid error message received');
        }
    });

    it('Add 1 node + Remove node by id; expect empty Sharding Table (head/tail - empty)', async () => {

    });

    it('Add 2 nodes + Remove first node by id; expect 1 node (head/tail) returned', async () => {

    });

    it('Add 2 nodes + Remove second node by id; expect 1 node (head/tail) returned', async () => {

    });

    it('Add 3 nodes + Remove central node by id; expect 2 nodes (head+tail) returned', async () => {

    });
});
