const {assert} = require('chai');


const ERC20Token = artifacts.require('ERC20Token');
const Identity = artifacts.require('Identity');
const IdentityStorage = artifacts.require('IdentityStorage');
const Profile = artifacts.require('Profile');
const ProfileStorage = artifacts.require('ProfileStorage');


// Contracts used in test
let erc20Token, identity, identityStorage, profile, profileStorage;
let operational, admin, identityId, adminKey, operationalKey, keyType;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ERROR_PREFIX = 'Returned error: VM Exception while processing transaction: ';

const ADMIN_KEY = 1;
const OPERATIONAL_KEY = 2;

contract('DKG v6 Identity', async (accounts) => {

    before(async () => {
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

        operational = accounts[1];
        admin = accounts[2];
    });

    it('Create an identity; only contracts from hub can create identity; expect to fail', async () => {

        try {
            await identity.createIdentity(
                operational, admin, {from: accounts[1]}
            );
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Function can only be called by contracts!'), 'Invalid error message received: ' + error.message);
        }
    });

    it('Create an identity without operational wallet; operational wallet cannot be empty; expect to fail', async () => {

        try {
            await identity.createIdentity(
                ZERO_ADDRESS, admin, {from: accounts[0]}
            );
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Operational wallet address can\'t be empty'), 'Invalid error message received: ' + error.message);
        }
    });

    it('Create an identity without admin wallet; admin wallet cannot be empty; expect to fail', async () => {

        try {
            await identity.createIdentity(
                operational, ZERO_ADDRESS, {from: accounts[0]}
            );
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Admin wallet address can\'t be empty'), 'Invalid error message received: ' + error.message);
        }
    });

    it('Create an identity with same admin and operational wallet; they wallet cannot be same; expect to fail', async () => {

        try {
            await identity.createIdentity(
                accounts[4], accounts[4], {from: accounts[0]}
            );
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Same address for ADMIN/OPERATIONAL purposes'), 'Invalid error message received: ' + error.message);
        }
    });


    it('Create an identity; expect identity created', async () => {
        const txReceipt = await identity.createIdentity(operational, admin, {from: accounts[0] });
        identityId = txReceipt.logs[0].args.identityId.toString();
        adminKey = txReceipt.logs[0].args.key;
        operationalKey = txReceipt.logs[1].args.key;
        keyType = txReceipt.logs[0].args.keyType;
        assert(identityId == '1', 'Failed to create identity');
    });

    it('Get identity id; expect identity created', async () => {
        const fetchedIdentityId = await identity.getIdentityId(operational);
        assert(identityId == fetchedIdentityId.toString(), 'Failed to get identity');
    });

    it('Get non-existent identity id; expect to receive 0', async () => {
        const invalidIdentityId = await identity.getIdentityId(accounts[3]);
        assert(invalidIdentityId.toString() == '0', 'Failed to get identity');
    });

    it('Get keys by purpose (admin)', async () => {
        const keys = await identity.getKeysByPurpose(identityId, ADMIN_KEY);
        assert(keys[0] == adminKey, 'Failed to get identity');
    });

    it('Get keys by purpose (operational)', async () => {
        const keys = await identity.getKeysByPurpose(identityId, OPERATIONAL_KEY);
        assert(keys[0] == operationalKey, 'Failed to get identity');
    });

    it('Get keys by purpose, un-existent identity id; expect to fail', async () => {
        const keys = await identity.getKeysByPurpose(3, OPERATIONAL_KEY);
        console.log(keys);
        assert(keys.length === 0, 'Failed to get empty keys array for un-existent identity id');
    });

    it('Check key has purpose for admin key', async () => {
        const isAdmin = await identity.keyHasPurpose(identityId, adminKey, ADMIN_KEY);
        assert(isAdmin, 'Failed to check purpose');
    });

    it('Check key has purpose for operational key', async () => {
        const isOperational = await identity.keyHasPurpose(identityId, operationalKey, OPERATIONAL_KEY);
        assert(isOperational, 'Failed to check purpose');
    });



});

