const { ethers } = require('ethers');
const {assert} = require('chai');
const truffleAssert = require('truffle-assertions');
const Hub = artifacts.require('Hub');
const ERC20Token = artifacts.require('ERC20Token');
const Identity = artifacts.require('Identity');
const IdentityStorage = artifacts.require('IdentityStorage');
const Profile = artifacts.require('Profile');
const ProfileStorage = artifacts.require('ProfileStorage');

// Contracts used in test
let erc20Token, identity, identityStorage, profile, profileStorage, hub;
let operational,
  secondOperational,
  admin,
  secondAdmin,
  identityId,
  adminKey,
  operationalKey,
  keyType;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ERROR_PREFIX =
  "Returned error: VM Exception while processing transaction: ";

const ADMIN_KEY = 1;
const OPERATIONAL_KEY = 2;
const ECDSA = 1;

contract('DKG v6 Identity', async (accounts) => {

    before(async () => {
        hub = await Hub.deployed();
        erc20Token = await ERC20Token.deployed();
        identity = await Identity.deployed();
        identityStorage = await IdentityStorage.deployed();
        profileStorage = await ProfileStorage.deployed();
        profile = await Profile.deployed();

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

        await hub.setContractAddress('TestAccount', accounts[0],{from: accounts[0]});
        operational = accounts[1];
        admin = accounts[2];
    });

    it('Create an identity; only contracts from hub can create identity; expect to fail', async () => {
        await truffleAssert.reverts(identity.createIdentity(operational, admin, {from: accounts[1]}));
    });

    it('Create an identity as a contract ; expect to pass', async () => {
        let result = await identity.createIdentity(operational, admin, {from: accounts[0]});
        truffleAssert.eventEmitted(result, 'IdentityCreated');

    });

    it('Create an identity without operational wallet; operational wallet cannot be empty; expect to fail', async () => {
        await truffleAssert.reverts(identity.createIdentity(ZERO_ADDRESS, admin, {from: accounts[0]}));
    });

    it('Create an identity without admin wallet; admin wallet cannot be empty; expect to fail', async () => {
        await truffleAssert.reverts(identity.createIdentity(operational, ZERO_ADDRESS, {from: accounts[0]}));
    });

    it('Create an identity with same admin and operational wallet; expect to work', async () => {
        let result = await identity.createIdentity(accounts[9], accounts[9], {from: accounts[0]});
        // console.log(result);
        truffleAssert.eventEmitted(result, 'IdentityCreated');
    });

    it('Get identity id; expect identity created', async () => {
        const fetchedIdentityId = await identityStorage.getIdentityId(operational);

        assert(1 == fetchedIdentityId.toString(), 'Failed to get identity');
    });

    it('Get non-existent identity id; expect to receive 0', async () => {
        const invalidIdentityId = await identityStorage.getIdentityId(accounts[3]);
        assert(invalidIdentityId.toString() == '0', 'Failed to get identity');
    });

    it('Get keys by purpose, un-existent identity id; expect to fail', async () => {
        const keys = await identityStorage.getKeysByPurpose(356, OPERATIONAL_KEY);
        assert(keys.length === 0, 'Failed to get empty keys array for un-existent identity id');
    });

    it('Create an identity, add another admin key, then remove old; expect to work', async () => {
        let opKey = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [accounts[3]])),
            adminKey = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [accounts[4]])),
            newAdminKey = ethers.utils.keccak256(ethers.utils.solidityPack(["address"], [accounts[5]]));

        let result = await identity.createIdentity(accounts[3], accounts[4], {from: accounts[0]});
        truffleAssert.eventEmitted(result, 'IdentityCreated');

        const identityId = await identityStorage.getIdentityId(accounts[3]);

        assert.equal(await identityStorage.keyHasPurpose(identityId, adminKey, ADMIN_KEY), true);
        assert.equal(await identityStorage.keyHasPurpose(identityId, opKey, OPERATIONAL_KEY), true);

        let resultAddKey = await identity.addKey(identityId, newAdminKey, ADMIN_KEY, ECDSA, {from: accounts[4]});

        // truffleAssert.eventEmitted(resultAddKey, 'KeyAdded');
        assert.equal(await identityStorage.keyHasPurpose(identityId, newAdminKey, ADMIN_KEY), ADMIN_KEY);

        let resultRemoveKey = await identity.removeKey(identityId, adminKey, {from: accounts[5]});
        // truffleAssert.eventEmitted(resultRemoveKey, 'KeyRemoved');

        assert.equal(await identityStorage.keyHasPurpose(identityId, adminKey, ADMIN_KEY), false);
    });

    // it('Create an identity; expect identity created', async () => {
    //     const txReceipt = await identity.createIdentity(operational, admin, {from: accounts[0] });
    //     identityId = txReceipt.logs[0].args.identityId.toString();
    //     adminKey = txReceipt.logs[0].args.key;
    //     operationalKey = txReceipt.logs[1].args.key;
    //     keyType = txReceipt.logs[0].args.keyType;
    //     console.log(identityId);
    //     assert(identityId == '2', 'Failed to create identity');
    // });


    //
    // it('Get keys by purpose (admin)', async () => {
    //     const keys = await identity.getKeysByPurpose(identityId, ADMIN_KEY);
    //     assert(keys[0] == adminKey, 'Failed to get identity');
    // });
    //
    // it('Get keys by purpose (operational)', async () => {
    //     const keys = await identity.getKeysByPurpose(identityId, OPERATIONAL_KEY);
    //     assert(keys[0] == operationalKey, 'Failed to get identity');
    // });
    //

    //
    // it('Check key has purpose for admin key', async () => {
    //     const isAdmin = await identity.keyHasPurpose(1, adminKey, ADMIN_KEY);
    //     assert(isAdmin, 'Failed to check purpose');
    // });
    //
    // it('Check key has purpose for operational key', async () => {
    //     const isOperational = await identity.keyHasPurpose(identityId, operationalKey, OPERATIONAL_KEY);
    //     assert(isOperational, 'Failed to check purpose');
    // });
    //
    // it('Add an admin key to existing identity; send with operational wallet; expect to fail', async () => {
    //     secondAdmin = accounts[3];
    //     try {
    //         await identity.addKey(
    //             identityId,
    //             secondAdmin,
    //             ADMIN_KEY,
    //             ECDSA,
    //             {from: accounts[1]}
    //         );
    //     } catch(error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(ERROR_PREFIX + 'revert Admin function'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Add an admin key to existing identity; expect key added', async () => {
    //     secondAdmin = accounts[3];
    //     await identity.addKey(
    //         identityId,
    //         secondAdmin,
    //         ADMIN_KEY,
    //         ECDSA,
    //         { from: accounts[2] }
    //     );
    //     const adminKeys = await identity.getKeysByPurpose(identityId, ADMIN_KEY);
    //     assert(adminKeys.length == 2, 'Failed to add admin key to identity');
    // });
    //
    // it('Add an existing admin key to identity; expect to fail', async () => {
    //     secondAdmin = accounts[3];
    //     try {
    //         await identity.addKey(
    //             identityId,
    //             secondAdmin,
    //             ADMIN_KEY,
    //             ECDSA,
    //             {from: accounts[2]}
    //         );
    //     } catch(error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(ERROR_PREFIX + 'revert Key is already attached to the identity'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Remove a key from existing identity; send with operational wallet; expect to fail', async () => {
    //     secondAdmin = accounts[3];
    //     try {
    //         await identity.removeKey(
    //             identityId,
    //             secondAdmin,
    //             {from: accounts[1]}
    //         );
    //     } catch(error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(ERROR_PREFIX + 'revert Admin function'), 'Invalid error message received: ' + error.message);
    //     }
    // });
});
