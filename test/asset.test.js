const {assert} = require('chai');

var AssertionRegistry = artifacts.require('AssertionRegistry'); // eslint-disable-line no-undef
var AssetRegistry = artifacts.require('AssetRegistry'); // eslint-disable-line no-undef
var UAIRegistry = artifacts.require('UAIRegistry'); // eslint-disable-line no-undef
var ERC20Token = artifacts.require('ERC20Token'); // eslint-disable-line no-undef

const {
    formatAssertion,
    calculateRoot
} = require('assertion-tools');



// Helper variables
var privateKeys = [];

// Contracts used in test
var assertionRegistry;
var assetRegistry;
var uaiRegistry;
var erc20Token;

// eslint-disable-next-line no-undef
contract('DKG v6 Asset/Assertion/UAI registries', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        assertionRegistry = await AssertionRegistry.deployed();
        assetRegistry = await AssetRegistry.deployed();
        uaiRegistry = await UAIRegistry.deployed();
        erc20Token = await ERC20Token.deployed();

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
    it('Create an asset; transfer ownership; update the asset; getters', async () => {
        var assertion = await formatAssertion({
            "@context": "https://json-ld.org/contexts/person.jsonld",
            "@id": "http://dbpedia.org/resource/John_Lennon",
            "name": "John Lennon",
            "born": "1940-10-09",
            "spouse": "http://dbpedia.org/resource/Cynthia_Lennon"
        });
        var assertionId = calculateRoot(assertion);

        var receipt = await assetRegistry.createAsset(
            assertionId, 1024, 1, 5, 250
        );

        var UAI = receipt.logs[0].args.UAI.toString();
        assert(UAI === '0');

        var balanceOf = await erc20Token.balanceOf(assetRegistry.address);
        assert(balanceOf.toString() === '250');

        var owner = await uaiRegistry.ownerOf(UAI);
        assert(owner === accounts[0]);

        await uaiRegistry.transfer(owner, accounts[1], UAI);

        var owner = await uaiRegistry.ownerOf(UAI);
        assert(owner === accounts[1]);

        var assertion = await formatAssertion({
            "@context": "https://json-ld.org/contexts/person.jsonld",
            "@id": "http://dbpedia.org/resource/John_Lennon",
            "name": "John Lennon",
            "born": "1940-10-09",
            "died": "1980-12-08",
            "spouse": "http://dbpedia.org/resource/Cynthia_Lennon"
        });
        var oldAssertionId = assertionId;
        var assertionId = calculateRoot(assertion);

        await assetRegistry.updateAsset(
            UAI, assertionId, 1024, 1, 500, { from: owner }
        );

        var balanceOf = await erc20Token.balanceOf(assetRegistry.address);
        assert(balanceOf.toString() === '750');

        var latestStateHash = await assetRegistry.getCommitHash(UAI, 0);
        assert(latestStateHash === assertionId);
        var oldStateCommit = await assetRegistry.getCommitHash(UAI, 1);
        assert(oldStateCommit === oldAssertionId);

        var issuer2 = await assertionRegistry.getIssuer(oldStateCommit);
        assert(issuer2 === accounts[0]);
        var issuer1 = await assertionRegistry.getIssuer(latestStateHash);
        assert(issuer1 === accounts[1]);
    });
});