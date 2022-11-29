const {assert} = require('chai');
const BN = require('bn.js');
const { ethers } = require('ethers');

const ERC20Token = artifacts.require('ERC20Token');
const Hub = artifacts.require('Hub');
const Profile = artifacts.require('Profile');
const ShardingTable = artifacts.require('ShardingTable');
const ShardingTableStorage = artifacts.require('ShardingTableStorage');
const IdentityStorage = artifacts.require('IdentityStorage');
const ProfileStorage = artifacts.require('ProfileStorage');
const ParametersStorage = artifacts.require('ParametersStorage');

// Helper variables
const peers = [
    {
        "id": "1",
        "ask": 1,
        "stake": 50000,
    },
    {
        "id": "2",
        "ask": 2,
        "stake": 75000,
    },
    {
        "id": "3",
        "ask": 3,
        "stake": 66000,
    },
    {
        "id": "4",
        "ask": 4,
        "stake": 99000,
    },
    {
        "id": "5",
        "ask": 5,
        "stake": 51000,
    },
    {
        "id": "6",
        "ask": 6,
        "stake": 61000,
    },
    {
        "id": "7",
        "ask": 7,
        "stake": 71000,
    },
    {
        "id": "8",
        "ask": 8,
        "stake": 81000,
    },
    {
        "id": "9",
        "ask": 9,
        "stake": 91000,
    }
]

const ETH_DECIMALS = new BN('1000000000000000000');
const INVALID_PEER_ID = '999';
const INVALID_IDENTITY_ID = 999;
const ERROR_PREFIX = 'Returned error: VM Exception while processing transaction: ';

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

    it('Add 3 nodes + Get Sharding Table; expect 3 nodes returned', async () => {
        const stake1 = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
        const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();
        const stake3 = (new BN(peers[2].stake).mul(ETH_DECIMALS)).toString();

        await erc20Token.increaseAllowance(profile.address, stake1, {from: accounts[1]});
        await erc20Token.increaseAllowance(profile.address, stake2, {from: accounts[2]});
        await erc20Token.increaseAllowance(profile.address, stake3, {from: accounts[3]});

        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[0].id), peers[0].ask, stake1, {from: accounts[1]});
        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[1].id), peers[1].ask, stake2, {from: accounts[2]});
        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[2].id), peers[2].ask, stake3, {from: accounts[3]});

        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 3, 'Failed to add 3 nodes to sharding table');
    });

    it('Get Sharding Table; send non-existent startingNodeId; expect to fail', async () => {
        try {
            await shardingTable.getShardingTable(INVALID_IDENTITY_ID,2);
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Non-existent node id!'), 'Invalid error message received');
        }
    });

    it('Get Sharding Table; starting from 2; expect 2 nodes returned', async () => {
        const nodes = await shardingTable.getShardingTable(ethers.utils.formatBytes32String(peers[0].id), 2);
        assert(nodes.length == 2, 'Failed to get 2 nodes from sharding table');
    });

    it('Get Full Sharding Table; expect 3 nodes returned', async () => {
        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 3, 'Failed to add 3 nodes to sharding table');
    });

    it('Push back; only contract can push back; expect to fail', async () => {
        try {
            await shardingTable.pushBack(peers[3].id, {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Push back; send non-existent identityId; expect to fail', async () => {
        try {
            await shardingTable.pushBack(INVALID_IDENTITY_ID, {from: accounts[0]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Identity does not exist!'), 'Invalid error message received');
        }
    });

    it('Push back; expect node added to the end of the sharding table', async () => {
        const nodeId = ethers.utils.formatBytes32String(peers[3].id);
        await profileStorage.createProfile(
            accounts[4],
            accounts[0],
            nodeId,
            peers[3].ask,
            peers[3].stake
        );
        const identityId = await identityStorage.getIdentityId(accounts[4]);
        await shardingTable.pushBack(identityId, {from: accounts[0]});
        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 4, 'Failed to push back node to sharding table');
        assert(nodes[3].id == nodeId, 'Failed to add node to end of sharding table');
    });

    it('Push front; only contract can push front; expect to fail', async () => {
        try {
            await shardingTable.pushFront(peers[4].id, {from: accounts[5]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Push front; send non-existent identityId; expect to fail', async () => {
        try {
            await shardingTable.pushFront(INVALID_IDENTITY_ID, {from: accounts[0]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Identity does not exist!'), 'Invalid error message received');
        }
    });

    it('Push front; expect node added to the beginning of the sharding table', async () => {
        const nodeId = ethers.utils.formatBytes32String(peers[4].id);
        await profileStorage.createProfile(
            accounts[5],
            accounts[0],
            nodeId,
            peers[4].ask,
            peers[4].stake
        );
        const identityId = await identityStorage.getIdentityId(accounts[5]);
        await shardingTable.pushFront(identityId, {from: accounts[0]});
        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 5, 'Failed to push front node to sharding table');
        assert(nodes[0].id == nodeId, 'Failed to add node to the start of sharding table');
    });

    it('Remove node; only contract can remove node; expect to fail', async () => {
        try {
            await shardingTable.removeNode(INVALID_IDENTITY_ID, {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Function can only be called by contracts!'), 'Invalid error message received');
        }
    });

    it('Remove node; send non-existent identityId; expect to fail', async () => {
        try {
            await shardingTable.removeNode(INVALID_IDENTITY_ID, {from: accounts[0]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Identity does not exist!'), 'Invalid error message received');
        }
    });

    it('Remove all nodes; expect empty Sharding Table (head/tail - empty)', async () => {
        let identityId;
        for(let i = 1; i <= 5; i++) {
            identityId = await identityStorage.getIdentityId(accounts[i]);
            await shardingTable.removeNode(identityId, {from: accounts[0]});
        }
        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 0, 'Failed to remove all nodes from sharding table');
    });

    it('Add 2 nodes + Remove first node; expect 1 node (head/tail) returned', async () => {
        const stake6 = (new BN(peers[5].stake).mul(ETH_DECIMALS)).toString();
        const stake7 = (new BN(peers[6].stake).mul(ETH_DECIMALS)).toString();

        await erc20Token.increaseAllowance(profile.address, stake6, {from: accounts[6]});
        await erc20Token.increaseAllowance(profile.address, stake7, {from: accounts[7]});

        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[5].id), peers[5].ask, stake6, {from: accounts[6]});
        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[6].id), peers[6].ask, stake7, {from: accounts[7]});

        let nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 2, 'Failed to add nodes to sharding table');

        const firstIdentityId = await identityStorage.getIdentityId(accounts[6]);
        await shardingTable.removeNode(firstIdentityId, {from: accounts[0]});

        nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 1, 'Failed to remove node from sharding table');
        assert(nodes[0].id == ethers.utils.formatBytes32String(peers[6].id), 'Failed to remove correct node from sharding table');
    });

    it('Remove second node; expect empty table returned', async () => {
        const secondIdentityId = await identityStorage.getIdentityId(accounts[7]);
        await shardingTable.removeNode(secondIdentityId, {from: accounts[0]});

        const nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 0, 'Failed to remove node from sharding table');
    });

    it('Add 2 nodes (3 in table) + Remove central node; expect 2 nodes (head+tail) returned', async () => {

    });

    it('Remove node by id; only Hub Owner can remove node by id; expect to fail', async () => {
        try {
            await shardingTable.removeNodeById(ethers.utils.formatBytes32String(peers[0].id), {from: accounts[1]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Function can only be called by hub owner!'), 'Invalid error message received');
        }
    });

    it('Remove node by id; send non-existent nodeId; expect to fail', async () => {
        try {
            await shardingTable.removeNodeById(ethers.utils.formatBytes32String(INVALID_PEER_ID), {from: accounts[0]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Non-existent node id!'), 'Invalid error message received');
        }
    });

    it('Add 1 node + Remove node by id; expect empty Sharding Table (head/tail - empty)', async () => {
        const stake8 = (new BN(peers[7].stake).mul(ETH_DECIMALS)).toString();

        await erc20Token.increaseAllowance(profile.address, stake8, {from: accounts[8]});

        const newNodeId = ethers.utils.formatBytes32String(peers[7].id);
        await profile.createProfile(accounts[0], newNodeId, peers[7].ask, stake8, {from: accounts[8]});

        let nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 1, 'Failed to add nodes to sharding table');

        await shardingTable.removeNodeById(newNodeId, {from: accounts[0]});

        nodes = await shardingTable.getShardingTable();
        assert(nodes.length == 0, 'Failed to remove node from sharding table');
    });

    it('Add 2 nodes + Remove first node by id; expect 1 node (head/tail) returned', async () => {

    });

    it('Add 2 nodes + Remove second node by id; expect 1 node (head/tail) returned', async () => {

    });

    it('Add 3 nodes + Remove central node by id; expect 2 nodes (head+tail) returned', async () => {

    });

});
