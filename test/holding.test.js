const {assert} = require('chai');

var AssertionRegistry = artifacts.require('AssertionRegistry'); // eslint-disable-line no-undef
var AssetRegistry = artifacts.require('AssetRegistry'); // eslint-disable-line no-undef
var UAIRegistry = artifacts.require('UAIRegistry'); // eslint-disable-line no-undef
var ERC20Token = artifacts.require('ERC20Token'); // eslint-disable-line no-undef
var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef
var Identity = artifacts.require('Identity'); // eslint-disable-line no-undef

const {sha256} = require('multiformats/hashes/sha2');
var {xor} = require('uint8arrays/xor');
var hexToBinary = require('hex-to-binary');
const {MerkleTree} = require('merkletreejs')
const keccak256 = require('keccak256')
const PeerId = require('peer-id')

const {
    BN,
    time,
} = require('@openzeppelin/test-helpers');

const {
    formatAssertion,
    calculateRoot
} = require('assertion-tools');



// Helper variables
var privateKeys = [];
var identities = [];
var nodeIds = [];

// Contracts used in test
var assertionRegistry;
var assetRegistry;
var uaiRegistry;
var erc20Token;
var profileStorage;
var profile;

// eslint-disable-next-line no-undef
contract('DKG v6 holding functions', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        assertionRegistry = await AssertionRegistry.deployed();
        assetRegistry = await AssetRegistry.deployed();
        uaiRegistry = await UAIRegistry.deployed();
        erc20Token = await ERC20Token.deployed();
        profileStorage = await ProfileStorage.deployed();
        profile = await Profile.deployed();

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
            // promises.push(erc20Token.approve(
            //     profile.address,
            //     amountToDeposit,
            //     {from: accounts[i]},
            // ));
            // promises.push(erc20Token.approve(
            //     profileStorage.address,
            //     amountToDeposit,
            //     {from: accounts[i]},
            // ));
        }
        await Promise.all(promises);

        // for (let i = 0; i < accounts.length - 1; i += 1) {
        //     // eslint-disable-next-line no-await-in-loop
        //     identities[i] = await Identity.new(accounts[i], accounts[9], {from: accounts[i]});
        // }
        // identities = (await Promise.all(identities)).map(x => x.address);
        //
        // const profiles = [];
        // for (let i = 0; i < accounts.length - 1; i += 1) {
        //     const nodeId = (await PeerId.create({bits: 1024, keyType: 'RSA'})).toBytes();
        //     nodeIds[i] = Buffer.from(await sha256.digest(nodeId).digest).toString('hex');
        //
        //     profiles[i] = profile.createProfile(
        //         accounts[9],
        //         `0x${nodeIds[i]}`,
        //         amountToDeposit,
        //         identities[i],
        //         {from: accounts[i]},
        //     );
        // }
        // await Promise.all(profiles);
    });
    //
    // // eslint-disable-next-line no-undef
    // it('Create/update an asset', async () => {
    //     var assertion = await formatAssertion({
    //         "@context": "https://json-ld.org/contexts/person.jsonld",
    //         "@id": "http://dbpedia.org/resource/John_Lennon",
    //         "name": "John Lennon",
    //         "born": "1940-10-09",
    //         "spouse": "http://dbpedia.org/resource/Cynthia_Lennon"
    //     });
    //     var assertionId = calculateRoot(assertion);
    //
    //     var receipt = await assetRegistry.createAsset(
    //         assertionId, 1024, 1, 5, 250
    //     );
    //
    //     var UAI = receipt.logs[0].args.UAI.toString();
    //     assert(UAI === '0');
    //
    //     var balanceOf = await erc20Token.balanceOf(assetRegistry.address);
    //     assert(balanceOf.toString() === '250');
    //
    //     var owner = await uaiRegistry.ownerOf(UAI);
    //     assert(owner === accounts[0]);
    //
    //     await uaiRegistry.transfer(owner, accounts[1], UAI);
    //
    //     var owner = await uaiRegistry.ownerOf(UAI);
    //     assert(owner === accounts[1]);
    //
    //     var assertion = await formatAssertion({
    //         "@context": "https://json-ld.org/contexts/person.jsonld",
    //         "@id": "http://dbpedia.org/resource/John_Lennon",
    //         "name": "John Lennon",
    //         "born": "1940-10-09",
    //         "died": "1980-12-08",
    //         "spouse": "http://dbpedia.org/resource/Cynthia_Lennon"
    //     });
    //     var assertionId = calculateRoot(assertion);
    //
    //     var receipt = await assetRegistry.updateAsset(
    //         UAI, assertionId, 1024, 1, { from: owner }
    //     );
    //
    //     var latestStateHash = await assetRegistry.getCommitHash(UAI, 0);
    //     assert(latestStateHash === assertionId);
    // });

    // // eslint-disable-next-line no-undef
    // it('Create an asset', async () => {
    //     let receipt = await assetRegistry.createAsset(
    //         '0x1234', 100, 1, 5, 250
    //     );
    //
    //     const UAI = receipt.logs[0].args.UAI.toString();
    //     assert('0' === UAI);
    //     let epochs = await uaiRegistry.getEpochs(UAI);
    //
    //     const currentEpoch = await uaiRegistry.getEpoch(UAI);
    //     assert('0' === currentEpoch.toString());
    //     const isActive = await uaiRegistry.isEpochActive(UAI, currentEpoch);
    //     assert(isActive === true);
    //
    //
    //     for (let i = 1; i < epochs.length - 1; i += 1) {
    //         let epochBlockNumber = epochs[i].toString();
    //         const currentEpoch = await uaiRegistry.getEpoch(UAI, epochBlockNumber);
    //         assert(i.toString() === currentEpoch.toString());
    //
    //         let isActive = await uaiRegistry.isEpochActive(UAI, currentEpoch);
    //         assert(!isActive);
    //
    //         await time.advanceBlockTo(epochBlockNumber);
    //         isActive = await uaiRegistry.isEpochActive(UAI, currentEpoch);
    //         assert(isActive);
    //     }
    // });

    // eslint-disable-next-line no-undef
    // it('Calculate Hamming distance', async () => {
    //     const peerId1 = `identifier1`;
    //     const peerId2 = `identifier2`;
    //
    //     const peerId1Hash = (await sha256.digest(Buffer.from(peerId1, 'utf8'))).digest;
    //     const peerId2Hash = (await sha256.digest(Buffer.from(peerId2, 'utf8'))).digest;
    //
    //     let xorHash = Buffer.from(xor(peerId1Hash, peerId2Hash)).toString('hex');
    //     let distance = Array.from(hexToBinary(xorHash)).reduce(function (a, b) {
    //         return parseInt(a) + parseInt(b)
    //     });
    //
    //     let result = await uaiRegistry.hammingDistance(
    //         Buffer.from(peerId1Hash),
    //         Buffer.from(peerId2Hash),
    //     );
    //
    //     assert(distance.toString() === result.toString(), 'Hamming distance is not correct');
    //
    //     xorHash = Buffer.from(xor(peerId1Hash, peerId1Hash)).toString('hex');
    //     distance = Array.from(hexToBinary(xorHash)).reduce(function (a, b) {
    //         return parseInt(a) + parseInt(b)
    //     });
    //
    //     result = await uaiRegistry.hammingDistance(
    //         Buffer.from(peerId1Hash),
    //         Buffer.from(peerId1Hash)
    //     );
    //
    //     assert(distance.toString() === result.toString(), 'Hamming distance is not correct');
    // });
    //
    //
    // // eslint-disable-next-line no-undef
    // it('Generate epochs', async () => {
    //     const numberOfEpochs = 5;
    //     const blockTime = 12;
    //     const holdingTimeInSeconds = 2400; //31536000
    //     const blockNumber = 500;
    //
    //     let result = await uaiRegistry.generateEpochs(
    //         blockNumber, numberOfEpochs, blockTime, holdingTimeInSeconds
    //     );
    //
    //     assert(result.length === numberOfEpochs + 1);
    //
    //     for (let i = 0; i < numberOfEpochs; i += 1) {
    //         const epoch = blockNumber + i * Math.floor((Math.floor(holdingTimeInSeconds / blockTime) / numberOfEpochs));
    //         assert(epoch.toString() === result[i].toString())
    //     }
    // });
    //
    //
    // // eslint-disable-next-line no-undef
    // it('Calculate challenge', async () => {
    //     const stateCommitHash = '0x12345';
    //
    //     let receipt = await uaiRegistry.createAsset(
    //         stateCommitHash, 100, 1000, 2400, '0x1234'
    //     );
    //     const UAI = receipt.logs[0].args.UAI.toString();
    //
    //     let calculatedChallenge = await uaiRegistry.calculateChallenge(UAI, 0, identities[0]);
    //     let challenge = await uaiRegistry.getChallenge(UAI, 0, identities[0]);
    //     assert(calculatedChallenge.toString() === challenge.toString());
    // });
    //
    // it('Get contribution rank', async () => {
    //     const stateCommitHash = '0x1111111';
    //
    //     let receipt = await uaiRegistry.createAsset(
    //         stateCommitHash, 100, 10, 2400, '0x1234'
    //     );
    //     const UAI = receipt.logs[0].args.UAI.toString();
    //
    //     let rank = await uaiRegistry.getContributionRank(UAI, 0, identities[0]);
    //     assert("0" === rank.toString());
    // });
    //
    // // eslint-disable-next-line no-undef
    // it('Answer a challenge and get reward', async () => {
    //     const assertion = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    //
    //     const leaves = assertion.map((element, index) => keccak256(web3.utils.encodePacked(
    //         keccak256(element),
    //         index
    //     )))
    //     const tree = new MerkleTree(leaves, keccak256, {sortPairs: true})
    //     const stateCommitHash = tree.getRoot().toString('hex')
    //     // console.log(tree.verify(proof, leaf, root))
    //
    //     var receipt = await uaiRegistry.createAsset(
    //         `0x${stateCommitHash}`, 500, assertion.length, 2400, '0x1234'
    //     );
    //     const UAI = receipt.logs[0].args.UAI.toString();
    //
    //     let epochs = await uaiRegistry.getEpochs(UAI);
    //     await time.advanceBlockTo(parseInt(epochs[1]) + 1);
    //
    //     let challenge = await uaiRegistry.getChallenge(UAI, epochs[1], identities[5], {from: accounts[5]});
    //     const leaf = keccak256(assertion[parseInt(challenge)]);
    //     const proof = tree.getProof(keccak256(web3.utils.encodePacked(
    //         leaf,
    //         parseInt(challenge)
    //     ))).map(x => x.data)
    //
    //     await uaiRegistry.answerChallenge(UAI, epochs[1], proof, leaf, 10, identities[5], {from: accounts[5]});
    //
    //     let contributors = await uaiRegistry.getContributors(UAI);
    //
    //     const UAIHash = (await sha256.digest(Buffer.from(web3.utils.encodePacked(UAI).slice(2), 'hex'))).digest;
    //     const nodeIdHash = Uint8Array.from(Buffer.from(nodeIds[5], 'hex'));
    //
    //     let xorHash = Buffer.from(xor(UAIHash, nodeIdHash)).toString('hex');
    //     let distance = Array.from(hexToBinary(xorHash)).reduce(function (a, b) {
    //         return parseInt(a) + parseInt(b)
    //     });
    //
    //     assert(contributors[0][1][0].toString() === `0x${nodeIds[5]}`);
    //     assert(contributors[1][1][0].toString() === distance.toString());
    //     assert(contributors[2][1][0].toString() === "10");
    //     assert(contributors[3][1].toString() === "1");
    //
    //     var amountBeforeRegistry = await erc20Token.balanceOf(uaiRegistry.address);
    //     var amountBeforeStorage = await erc20Token.balanceOf(profileStorage.address);
    //
    //     await time.advanceBlockTo(parseInt(epochs[1]) + 21);
    //
    //     await uaiRegistry.getReward(UAI, 1, identities[5], {from: accounts[5]});
    //
    //     var amountAfterRegistry = await erc20Token.balanceOf(uaiRegistry.address);
    //     var amountAfterStorage = await erc20Token.balanceOf(profileStorage.address);
    //     assert(Math.abs(parseInt(amountBeforeRegistry, 10) - parseInt(amountAfterRegistry, 10)) === 10);
    //     assert(Math.abs(parseInt(amountBeforeStorage, 10) - parseInt(amountAfterStorage, 10)) === 10);
    //
    //
    //     contributors = await uaiRegistry.getContributors(UAI);
    //     assert(contributors[2][1][0].toString() === "0");
    // });
});