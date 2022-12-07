const { expect } = require('chai');
const truffleAssert = require('truffle-assertions');
const Hub = artifacts.require('Hub');
const ParametersStorage = artifacts.require('ParametersStorage');

contract('ParametersStorage', async (accounts) => {
    let parameterStorage, hub;
    let minimumStake, r2, r1, r0, setCommitWindowDuration, minProofWindowOffsetPerc, maxProofWindowOffsetPerc;
    let proofWindowDurationPerc, replacementWindowDurationPerc, epochLength, stakeWithdrawalDelay, rewardWithdrawalDelay, slashingFreezeDuration;
    const owner = accounts[0];
    const nonOwner = accounts[1];

    before(async () => {
        hub = await Hub.deployed();
        parameterStorage = await ParametersStorage.deployed();
        minimumStake = await parameterStorage.minimumStake();
        r2 = await parameterStorage.R2();
        r1 = await parameterStorage.R1();
        r0 = await parameterStorage.R0();
        setCommitWindowDuration = await parameterStorage.commitWindowDuration();
        minProofWindowOffsetPerc = await parameterStorage.minProofWindowOffsetPerc();
        maxProofWindowOffsetPerc = await parameterStorage.maxProofWindowOffsetPerc();
        proofWindowDurationPerc = await parameterStorage.proofWindowDurationPerc();
        replacementWindowDurationPerc = await parameterStorage.replacementWindowDurationPerc();
        epochLength = await parameterStorage.epochLength();
        stakeWithdrawalDelay = await parameterStorage.stakeWithdrawalDelay();
        rewardWithdrawalDelay = await parameterStorage.rewardWithdrawalDelay();
        slashingFreezeDuration = await parameterStorage.slashingFreezeDuration();
    });

    async function assertResponse(parameterName, variable){
        const result = await parameterName(variable, { from: owner });

        await truffleAssert.passes(result, 'Successfully passed');
        expect(result.receipt.from).to.be.eql(owner.toLowerCase());
    }

    it('should set parameters only for owner, expect to pass', async () => {
        // validate minimum stake for owner
        await assertResponse(parameterStorage.setMinimumStake, minimumStake.toString());
        expect(minimumStake.toString()).be.eql('50000000000000000000000');

        // validate R2 for owner
        await assertResponse(parameterStorage.setR2, r2.toString());
        expect(r2.toString()).be.eql('20');

        // validate R1 for owner
        await assertResponse(parameterStorage.setR1, r1.toString());
        expect(r1.toString()).be.eql('8');

       // validate R0 for owner
        await assertResponse(parameterStorage.setR0, r0.toString());
        expect(r0.toString()).be.eql('3');

        //validate commit window duration for owner
        await assertResponse(parameterStorage.setCommitWindowDuration, setCommitWindowDuration.toString());
        expect(Math.floor(setCommitWindowDuration.toString() / 60)).be.eql(15);

        //validate min proof window offset perc for owner
        await assertResponse(parameterStorage.setMinProofWindowOffsetPerc, minProofWindowOffsetPerc.toString());
        expect(minProofWindowOffsetPerc.toString()).be.eql('50');

        // validate max proof window offset perc for owner
        await assertResponse(parameterStorage.setMaxProofWindowOffsetPerc, maxProofWindowOffsetPerc.toString());
        expect(maxProofWindowOffsetPerc.toString()).be.eql('75');

        // validate proof window duration perc for owner
        await assertResponse(parameterStorage.setProofWindowDurationPerc, proofWindowDurationPerc.toString());
        expect(proofWindowDurationPerc.toString()).be.eql('25');

        // validate replacement window duration perc for owner
        await assertResponse(parameterStorage.setReplacementWindowDurationPerc, replacementWindowDurationPerc.toString());
        expect(replacementWindowDurationPerc.toString()).be.eql('0');

        // validate epoch length for owner
        await assertResponse(parameterStorage.setEpochLength, epochLength.toString());
        expect(Math.floor(epochLength.toString() / 3600)).be.eql(1);

        // validate stake withdrawal delay for owner
        await assertResponse(parameterStorage.setStakeWithdrawalDelay, stakeWithdrawalDelay.toString());
        expect(Math.floor(stakeWithdrawalDelay.toString() / 60)).be.eql(5);

        // validate reward withdrawal delay for owner
        await assertResponse(parameterStorage.setRewardWithdrawalDelay, rewardWithdrawalDelay.toString());
        expect(Math.floor(rewardWithdrawalDelay.toString() / 60)).be.eql(5);

        // validate slashing freeze duration for owner
        await assertResponse(parameterStorage.setSlashingFreezeDuration, slashingFreezeDuration.toString());
        expect(Math.floor(slashingFreezeDuration.toString() / (3600*24))).be.eql(730);
    })

    it('not able to set parameters for non owner, expect to fail', async () => {
        // validate minimum stake for non owner
        await truffleAssert.reverts(parameterStorage.setMinimumStake(minimumStake.toString(), { from: nonOwner }));

        // validate R2 for non owner
        await truffleAssert.reverts(parameterStorage.setR2(r2.toString(), { from: nonOwner }));

        // validate R1 for non owner
        await truffleAssert.reverts(parameterStorage.setR1(r1.toString(), { from: nonOwner }));

        // validate R0 for non owner
        await truffleAssert.reverts(parameterStorage.setR0(r0.toString(), { from: nonOwner }));

        // validate commit window duration for non owner
        await truffleAssert.reverts(parameterStorage.setCommitWindowDuration(setCommitWindowDuration.toString(), { from: nonOwner }));

        // validate min proof window offset percentage for non owner
        await truffleAssert.reverts(parameterStorage.setMinProofWindowOffsetPerc(minProofWindowOffsetPerc.toString(), { from: nonOwner }));

        // validate max proof window offset percentage for non owner
        await truffleAssert.reverts(parameterStorage.setMaxProofWindowOffsetPerc(maxProofWindowOffsetPerc.toString(), { from: nonOwner }));

        // validate proof window duration perc for non owner
        await truffleAssert.reverts(parameterStorage.setProofWindowDurationPerc(proofWindowDurationPerc.toString(), { from: nonOwner }));

        // validate peplacement window duration perc for non owner
        await truffleAssert.reverts(parameterStorage.setReplacementWindowDurationPerc(replacementWindowDurationPerc.toString(), { from: nonOwner }));

        // validate epoch length for non owner
        await truffleAssert.reverts(parameterStorage.setEpochLength(epochLength.toString(), { from: nonOwner }));

        // validate stake withdrawal delay for non owner
        await truffleAssert.reverts(parameterStorage.setStakeWithdrawalDelay(stakeWithdrawalDelay.toString(), { from: nonOwner }));

        // validate reward withdrawal delay for non owner
        await truffleAssert.reverts(parameterStorage.setRewardWithdrawalDelay(rewardWithdrawalDelay.toString(), { from: nonOwner }));

        // validate slashing freeze duration for non owner
        await truffleAssert.reverts(parameterStorage.setSlashingFreezeDuration(slashingFreezeDuration.toString(), { from: nonOwner }));
    })
})
