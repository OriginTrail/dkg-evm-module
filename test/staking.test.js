const {assert} = require('chai');
const BN = require('bn.js');
const { ethers } = require('ethers');

const ERC20Token = artifacts.require('ERC20Token');
const Hub = artifacts.require('Hub');
const Profile = artifacts.require('Profile');
const Staking = artifacts.require('Staking');
const StakingStorage = artifacts.require('StakingStorage');
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
const ERROR_PREFIX = 'Returned error: VM Exception while processing transaction: ';
const REWARD = 1234;

// Contracts used in test
let erc20Token, hub, profile, profileStorage, staking,
    stakingStorage, identityStorage,  parametersStorage;

contract('DKG v6 Staking', async (accounts) => {
    // eslint-disable-next-line no-undef
    before(async () => {
        erc20Token = await ERC20Token.deployed();
        hub = await Hub.deployed();
        profile = await Profile.deployed();
        stakingStorage = await StakingStorage.deployed();
        staking = await Staking.deployed();
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

    it('Create 1 node; expect that stake is created and correctly set', async () => {
        const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
        
        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[0].id), {from: accounts[1]});

        const identityId = await identityStorage.getIdentityId(accounts[1]);

        await erc20Token.increaseAllowance(staking.address, stake, {from: accounts[0]});
        await staking.addStake2(identityId, stake, { from: accounts[0] });

        assert(await stakingStorage.totalStakes(identityId) == stake, 'Total amount of stake is not set');
    });

    it('User stakes to node, delegation is disabled; expect to fail', async () => {
        const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();
        const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);

        try {
            await staking.addStake2(nodeIdentityId, stake2, {from: accounts[2]});
            throw null;
        } catch (error) {
            assert(error, 'Expected error but did not get one');
            assert(error.message.startsWith(ERROR_PREFIX + 'revert Identity does not exist or user delegation disabled!'), 'Invalid error message received');
        }
    });

    it('User stakes to node; expect that total stake is increased', async () => {
        const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
        const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();

        const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);

        await staking.addStake2(nodeIdentityId, stake2 ,{from: accounts[2]});

        assert(stakingStorage.totalStakes(nodeIdentityId) == new BN(stake).add(new BN(stake2)).toString(), 'Total amount of stake is not increased');
    });

    it('User withdraws stake; expect that total stake is decreased', async () => {
        const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
        const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();

        const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);

        await staking.withdrawStake(nodeIdentityId, stake2 ,{from: accounts[2]});

        assert(stakingStorage.totalStakes(nodeIdentityId) == stake, 'Total amount of stake is not decreased');
    });

    it('Add reward; expect that total stake is increased', async () => {
        const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
        const reward = (new BN(REWARD).mul(ETH_DECIMALS)).toString();

        const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);

        await staking.addReward(nodeIdentityId, reward ,{from: accounts[0]});

        assert(stakingStorage.totalStakes(nodeIdentityId) == new BN(stake).add(new BN(reward)).toString(), 'Total amount of stake is not increased after adding reward');
    });
});
