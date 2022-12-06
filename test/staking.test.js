const {assert} = require('chai');
const BN = require('bn.js');
const { ethers } = require('ethers');

const truffleAssert = require('truffle-assertions');

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

    it('non-Contract should not be able to setTotalStake; expect to fail', async () => {
        await truffleAssert.reverts(stakingStorage.setTotalStake(123, 456, {from: accounts[9]}));
    });

    it('Contract should be able to setTotalStake; expect to pass', async () => {

        await stakingStorage.setTotalStake(123, 456, {from: accounts[0]});
        let stake = await stakingStorage.totalStakes(123);
        assert(456 == stake.toString(), 'Wrong value');
    });

    it('non-Contract should not be able to setOperatorFee; expect to fail', async () => {
        await truffleAssert.reverts(stakingStorage.setOperatorFee(123, 456, {from: accounts[9]}));
    });

    it('Contract should be able to setOperatorFee; expect to pass', async () => {
        await stakingStorage.setOperatorFee(123, 456, {from: accounts[0]});
        let opFee = await stakingStorage.operatorFees(123);
        assert(456 == opFee.toString(), 'Wrong value');
    });

    it('non-Contract should not be able to createWithdrawalRequest; expect to fail', async () => {
        await truffleAssert.reverts(stakingStorage.createWithdrawalRequest(123, accounts[1], 214, 2022, {from: accounts[9]}));
    });

    it('Contract should be able to createWithdrawalRequest; expect to pass', async () => {
        await stakingStorage.createWithdrawalRequest(123, accounts[1], 214, 2022, {from: accounts[0]})
        let itExists = await stakingStorage.withdrawalRequestExists(123, accounts[1]);
        assert(itExists, 'Withdrawal request does not exist');
        let amount = await stakingStorage.getWithdrawalRequestAmount(123, accounts[1]);
        assert(214 == amount.toString(), 'Wrong value for amount');
        let timestamp = await stakingStorage.getWithdrawalRequestTimestamp(123, accounts[1]);
        assert(2022 == timestamp.toString(), 'Wrong value for timestamp');
    });

    it('non-Contract should not be able to deleteWithdrawalRequest; expect to fail', async () => {
        await truffleAssert.reverts(stakingStorage.deleteWithdrawalRequest(123, accounts[1], {from: accounts[9]}));
    });

    it('Contract should be able to deleteWithdrawalRequest; expect to pass', async () => {
        await stakingStorage.deleteWithdrawalRequest(123, accounts[1]);
        itExists = await stakingStorage.withdrawalRequestExists(123, accounts[1]);
        assert(!itExists, 'Withdrawal request was not deleted');
        amount = await stakingStorage.getWithdrawalRequestAmount(123, accounts[1]);
        assert(0 == amount.toString(), 'Wrong value for amount, expected 0 after delete');
        timestamp = await stakingStorage.getWithdrawalRequestTimestamp(123, accounts[1]);
        assert(0 == timestamp.toString(), 'Wrong value for timestamp, expected 0 after delete');
    });

    it('Contract should be able to fetch constants; expect to pass', async () => {
        let name = await stakingStorage.name();
        assert('StakingStorage' == name.toString(), 'Name mismatch');

        let version = await stakingStorage.version();
        assert('1.0.0' == version.toString(), 'Version mismatch');
    });

    it('non staking contract should not be able to transferStake; expect to fail', async () => {
        await truffleAssert.reverts(stakingStorage.transferStake(accounts[1], 55, {from: accounts[0]}));
    });

    it('staking contract should not be able to transferStake; expect to fail', async () => {
        const owner = accounts[0];
        const receiver = accounts[1];
        const amountForTransfer = 100;
        await erc20Token.setupRole(owner, {from: owner});
        await erc20Token.mint(stakingStorage.address, amountForTransfer);
        const balanceBeforeTransfer = await erc20Token.balanceOf(receiver);
        console.log(balanceBeforeTransfer.toString());
        await hub.setContractAddress('Staking', owner);
        await stakingStorage.transferStake(receiver, amountForTransfer, {from: owner});
        const balanceAfterTransfer = await erc20Token.balanceOf(receiver);
        console.log(balanceAfterTransfer.toString());
        // assert(balanceAfterTransfer.toString() == (Number(balanceBeforeTransfer) + 100).toString(), 'Tokens are not transffered');

    });

    it('Create profile, identity and add stake; expect that stake is created and correctly set', async () => {
        await hub.setContractAddress('Owner', accounts[0]);
        const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
        await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[0].id), {from: accounts[1]});
        const identityId = await identityStorage.getIdentityId(accounts[1]);
        await erc20Token.increaseAllowance(staking.address, stake, {from: accounts[0]});
        await staking.methods['addStake(uint72,uint96)'](identityId, stake, { from: accounts[0] });
        assert(await stakingStorage.totalStakes(identityId) == stake, 'Total amount of stake is not set');
    });
    // it('staking contract should not be able to transferStake; expect to fail', async () => {
    //     // Mint tokens to staking contract
    //     await erc20Token.mint(staking.address, 100, {from: accounts[0]});
    //     console.log((await erc20Token.balanceOf(staking.address)).toString());
    //     await erc20Token.increaseAllowance(accounts[1], 100, {from: accounts[0]});
    //
    //     await stakingStorage.transferStake(accounts[1], 1, {from: staking.address});
    //
    // });

    // it('Create 1 node; expect that stake is created and correctly set', async () => {
    //     const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
    //
    //     await profile.createProfile(accounts[0], ethers.utils.formatBytes32String(peers[0].id), {from: accounts[1]});
    //
    //     const identityId = await identityStorage.getIdentityId(accounts[1]);
    //
    //     await erc20Token.increaseAllowance(staking.address, stake, {from: accounts[0]});
    //     await staking.addStake2(identityId, stake, { from: accounts[0] });
    //
    //     assert(await stakingStorage.totalStakes(identityId) == stake, 'Total amount of stake is not set');
    // });
    //
    // it('User stakes to node, delegation is disabled; expect to fail', async () => {
    //     const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();
    //     const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);
    //
    //     try {
    //         await staking.addStake2(nodeIdentityId, stake2, {from: accounts[2]});
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(ERROR_PREFIX + 'revert Identity does not exist or user delegation disabled!'), 'Invalid error message received');
    //     }
    // });
    //
    // it('User stakes to node; expect that total stake is increased', async () => {
    //     const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
    //     const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();
    //
    //     const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);
    //
    //     await staking.addStake2(nodeIdentityId, stake2 ,{from: accounts[2]});
    //
    //     assert(stakingStorage.totalStakes(nodeIdentityId) == new BN(stake).add(new BN(stake2)).toString(), 'Total amount of stake is not increased');
    // });
    //
    // it('User withdraws stake; expect that total stake is decreased', async () => {
    //     const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
    //     const stake2 = (new BN(peers[1].stake).mul(ETH_DECIMALS)).toString();
    //
    //     const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);
    //
    //     await staking.withdrawStake(nodeIdentityId, stake2 ,{from: accounts[2]});
    //
    //     assert(stakingStorage.totalStakes(nodeIdentityId) == stake, 'Total amount of stake is not decreased');
    // });
    //
    // it('Add reward; expect that total stake is increased', async () => {
    //     const stake = (new BN(peers[0].stake).mul(ETH_DECIMALS)).toString();
    //     const reward = (new BN(REWARD).mul(ETH_DECIMALS)).toString();
    //
    //     const nodeIdentityId = await identityStorage.getIdentityId(accounts[1]);
    //
    //     await staking.addReward(nodeIdentityId, reward ,{from: accounts[0]});
    //
    //     assert(stakingStorage.totalStakes(nodeIdentityId) == new BN(stake).add(new BN(reward)).toString(), 'Total amount of stake is not increased after adding reward');
    // });
});
