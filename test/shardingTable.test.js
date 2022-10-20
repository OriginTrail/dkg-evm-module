const {assert} = require('chai');

var AssetRegistry = artifacts.require('AssetRegistry'); // eslint-disable-line no-undef
var ERC20Token = artifacts.require('ERC20Token'); // eslint-disable-line no-undef
var ShardingTable = artifacts.require('ShardingTable'); // eslint-disable-line no-undef


// Helper variables
var privateKeys = [];

// Contracts used in test
var assetRegistry;
var ERC20Token;
var shardingTable;

// eslint-disable-next-line no-undef
contract('DKG v6 Sharding Table', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        assetRegistry = await AssetRegistry.deployed();
        erc20Token = await ERC20Token.deployed();
        shardingTable = await ShardingTable.deployed();

        privateKeys = [
            '0x02b39cac1532bef9dba3e36ec32d3de1e9a88f1dda597d3ac6e2130aed9adc4e',
            '0xb1c53fd90d0172ff60f14f61f7a09555a9b18aa3c371991d77209cfe524e71e6',
            '0x8ab3477bf3a1e0af66ab468fafd6cf982df99a59fee405d99861e7faf4db1f7b',
            '0xc80796c049af64d07c76ab4cfb00655895368c60e50499e56cdc3c38d09aa88e',
            '0x239d785cea7e22f23d1fa0f22a7cb46c04d81498ce4f2de07a9d2a7ceee45004',
            '0x021336479aa1553e42bfcd3b928dee791db84a227906cb7cec5982d382ecf106',
            '0x217479bee25ed6d28302caec069c7297d0c3aefdda81cf91ed754c4d660862ae',
            '0xa050f7b3a0479a55e9ddd074d218fbfea302f061e9f21a117a2ec1f0b986a363',
            '0x0dbaee2066aacd16d43a9e23649f232913bca244369463320610ffe6ffb0d69d',
        ];

        const promises = [];
        const amountToDeposit = 3000;
        const tokenAmount = 1000000;

        for (let i = 0; i < accounts.length; i += 1) {
            promises.push(erc20Token.mint(
                accounts[i],
                tokenAmount,
                {from: accounts[0]},
            ));

            promises.push(erc20Token.approve(
                assetRegistry.address,
                tokenAmount - amountToDeposit,
                {from: accounts[i]},
            ));
        }
        await Promise.all(promises);
    });

    // eslint-disable-next-line no-undef
    it('Push new peers; Update peer params; Remove peers; Getters', async () => {
        var peer1 = {
            "id": "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB",
            "stake": 50000,
            "ask": 1,
        };

        var peer2 = {
            "id": "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA",
            "stake": 75000,
            "ask": 4,
        }

        var peer3 = {
            "id": "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",
            "stake": 66000,
            "ask": 2,
        }

        var head, tail, peerCount, table;

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head.toString(), "");
        assert.equal(tail.toString(), "");
        assert.equal(peerCount.toNumber(), 0);

        await shardingTable.pushBack(peer1.id, peer1.stake, peer1.ask);

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head, "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(tail, "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(peerCount, 1);

        var peer1Params = await shardingTable.getPeer("QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(peer1Params[0], "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(peer1Params[1], 50000);
        assert.equal(peer1Params[2], 1);

        await shardingTable.updateParams("QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB", 55000, 2);
        var peer1Params = await shardingTable.getPeer("QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(peer1Params[0], "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(peer1Params[1], 55000);
        assert.equal(peer1Params[2], 2);

        await shardingTable.pushFront(peer2.id, peer2.stake, peer2.ask);

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head, "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA");
        assert.equal(tail, "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");
        assert.equal(peerCount, 2);

        await shardingTable.pushBack(peer3.id, peer3.stake, peer3.ask);

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head, "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA");
        assert.equal(tail, "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC");
        assert.equal(peerCount, 3);

        table = await shardingTable.getShardingTable();
        assert.equal();
        assert.deepEqual(
            table,
            [
                [
                    "",  // prevPeer
                    "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB",  // nextPeer
                    "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA",  // id
                    "75000",  // stake
                    "4"  // ask
                ],
                [
                    "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA",  // prevPeer
                    "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",  // nextPeer
                    "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB",  // id
                    "55000",  // stake
                    "2"  // ask
                ],
                [
                    "QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB",  // prevPeer
                    "",  // nextPeer
                    "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",  // id
                    "66000",  // stake
                    "2"  // ask
                ]
            ]
        );

        await shardingTable.removePeer("QmHNJmNvsJo8jmEjrGGzNCZNoQhnjqT6m87xGcSGHSmpB");

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head, "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA");
        assert.equal(tail, "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC");
        assert.equal(peerCount, 2);

        table = await shardingTable.getShardingTable();
        assert.deepEqual(
            table,
            [
                [
                    "",  // prevPeer
                    "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",  // nextPeer
                    "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA",  // id
                    "75000",  // stake
                    "4"  // ask
                ],
                [
                    "ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA",  // prevPeer
                    "",  // nextPeer
                    "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",  // id
                    "66000",  // stake
                    "2"  // ask
                ]
            ]
        );

        await shardingTable.removePeer("ZmHNfmNvsJo8jPEjrGJzNCZNoQknjqT6m87xGcSGHSmpA");

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head, "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC");
        assert.equal(tail, "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC");
        assert.equal(peerCount, 1);

        table = await shardingTable.getShardingTable();
        assert.deepEqual(
            table,
            [
                [
                    "",  // prevPeer
                    "",  // nextPeer
                    "FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC",  // id
                    "66000",  // stake
                    "2"  // ask
                ]
            ]
        );

        await shardingTable.removePeer("FmHNJm4vsJo8pmEjrGGVNCZloQhJjqT6m87xGcSGHSmpC");

        head = await shardingTable.head();
        tail = await shardingTable.tail();
        peerCount = await shardingTable.peerCount();
        assert.equal(head, "");
        assert.equal(tail, "");
        assert.equal(peerCount, 0);
    });
});