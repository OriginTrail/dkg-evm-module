const {assert} = require('chai');

const ERC20Token = artifacts.require('ERC20Token');
const Hub = artifacts.require('Hub');
const Profile = artifacts.require('Profile');
const ShardingTable = artifacts.require('ShardingTable');

// Helper variables
let peer1 = {
    "id": "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB",
    "ask": 1,
    "stake": 50000,
};

let peer2 = {
    "id": "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA",
    "ask": 4,
    "stake": 75000,
}

let peer3 = {
    "id": "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",
    "ask": 2,
    "stake": 66000,
}

// Contracts used in test
let erc20Token;
let hub;
let profile;
let shardingTable;

contract('DKG v6 ShardingTable', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        erc20Token = await ERC20Token.deployed();
        hub = await Hub.deployed();
        profile = await Profile.deployed();
        shardingTable = await ShardingTable.deployed();

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

    });

    it('Add 3 nodes + Get Sharding Table; starting from 2; expect 2 nodes returned', async () => {

    });

    it('Add 3 nodes + Get Full Sharding Talbe; expect 3 nodes returned', async () => {

    });

    it('Push back; only Profile contract can push back; expect to fail', async () => {

    });

    it('Push back; send non-existent identityId; expect to fail', async () => {

    });

    it('Push back; expect node added to the end of the sharding table', async () => {

    });

    it('Push back; only Profile contract can push front; expect to fail', async () => {

    });

    it('Push front; send non-existent identityId; expect to fail', async () => {

    });

    it('Push front; expect node added to the beginning of the sharding table', async () => {

    });

    it('Remove node; only Profile contract can remove node; expect to fail', async () => {

    });

    it('Remove node; send non-existent identityId; expect to fail', async () => {

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

    });

    it('Remove node by id; send non-existent nodeId; expect to fail', async () => {

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