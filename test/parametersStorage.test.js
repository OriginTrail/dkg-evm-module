const { expect } = require('chai');
const truffleAssert = require('truffle-assertions');
const ParametersStorage = artifacts.require('ParametersStorage');

contract('ParametersStorage', async (accounts) => {
  let parameterStorage;
  let minimumStake, r2, r1, r0, commitWindowDuration, minProofWindowOffsetPerc, maxProofWindowOffsetPerc;
  let proofWindowDurationPerc, replacementWindowDurationPerc, epochLength, stakeWithdrawalDelay,
    rewardWithdrawalDelay, slashingFreezeDuration;
  const owner = accounts[0];
  const nonOwner = accounts[1];

  before(async () => {
    parameterStorage = await ParametersStorage.deployed();
  });

  it('validate minimum stake for owner, expect to pass', async () => {
    const minStakeInContract = '50000000000000000000000';
    const newMinSakeValue = '40000000000000000000000';
    minimumStake = await parameterStorage.minimumStake();

    expect(minimumStake.toString()).be.eql(minStakeInContract);

    // set a new value for min stake and validate is correct
    const resultMinStake = await parameterStorage.setMinimumStake(newMinSakeValue, { from: owner });
    await truffleAssert.passes(resultMinStake, 'Successfully passed');
    minimumStake = await parameterStorage.minimumStake();

    expect(minimumStake.toString()).be.eql(newMinSakeValue);
  });

  it('validate minimum stake for non owner, expect to fail', async () => {
    minimumStake = await parameterStorage.minimumStake();
    await truffleAssert.reverts(parameterStorage.setMinimumStake(minimumStake.toString(), { from: nonOwner }));
  });

  it('validate r2 for owner, expect to pass', async () => {
    const r2valueInContract = '20';
    const newR2value = '30';
    r2 = await parameterStorage.r2();

    expect(r2.toString()).be.eql(r2valueInContract);

    // set a new value for r2 and validate is correct
    const resultR2 = await parameterStorage.setR2(newR2value, { from: owner });
    await truffleAssert.passes(resultR2, 'Successfully passed');
    r2 = await parameterStorage.r2();

    expect(r2.toString()).be.eql(newR2value);
  });

  it('validate r2 for non owner, expect to fail', async () => {
    r2 = await parameterStorage.r2();
    await truffleAssert.reverts(parameterStorage.setR2(r2.toString(), { from: nonOwner }));
  });

  it('validate r1 for owner, expect to pass', async () => {
    const r1valueInContract = '8';
    const newR1value = '10';
    r1 = await parameterStorage.r1();

    expect(r1.toString()).be.eql(r1valueInContract);

    // set a new value for r1 and validate is correct
    const resultR1 = await parameterStorage.setR1(newR1value, { from: owner });
    await truffleAssert.passes(resultR1, 'Successfully passed');
    r1 = await parameterStorage.r1();

    expect(r1.toString()).be.eql(newR1value);
  });

  it('validate r1 for non owner, expect to fail', async () => {
    r1 = await parameterStorage.r1();
    await truffleAssert.reverts(parameterStorage.setR1(r1.toString(), { from: nonOwner }));
  });

  it('validate r0 for owner, expect to pass', async () => {
    const r0valueInContract = '3';
    const newR0value = '6';
    r0 = await parameterStorage.r0();

    expect(r0.toString()).be.eql(r0valueInContract);

    // set a new value for r0 and validate is correct
    const resultR0 = await parameterStorage.setR0(newR0value, { from: owner });
    await truffleAssert.passes(resultR0, 'Successfully passed');
    r0 = await parameterStorage.r0();

    expect(r0.toString()).be.eql(newR0value);
  });

  it('validate r0 for non owner, expect to fail', async () => {
    r0 = await parameterStorage.r0();
    await truffleAssert.reverts(parameterStorage.setR0(r0.toString(), { from: nonOwner }));
  });

  it('validate commit window duration for owner, expect to pass', async () => {
    const valueInContract = 15;
    const newValue = '20';
    commitWindowDuration = await parameterStorage.commitWindowDuration();

    expect(commitWindowDuration.toString() / 60).be.eql(valueInContract);

    // set new value for commit window duration and validate is correct
    const response = await parameterStorage.setCommitWindowDuration(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    commitWindowDuration = await parameterStorage.commitWindowDuration();

    expect(commitWindowDuration.toString()).be.eql(newValue);
  });

  it('validate commit window duration for non owner. expect to fail', async () => {
    commitWindowDuration = await parameterStorage.commitWindowDuration();
    await truffleAssert.reverts(
      parameterStorage.setCommitWindowDuration(commitWindowDuration.toString(), { from: nonOwner }),
    );
  });

  it('validate min proof window offset perc for owner, expect to pass', async () => {
    const valueInContract = '50';
    const newValue = '70';
    minProofWindowOffsetPerc = await parameterStorage.minProofWindowOffsetPerc();

    expect(minProofWindowOffsetPerc.toString()).be.eql(valueInContract);

    // set new value for min proof window offset perc and validate is correct
    const response = await parameterStorage.setMinProofWindowOffsetPerc(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    minProofWindowOffsetPerc = await parameterStorage.minProofWindowOffsetPerc();
    expect(minProofWindowOffsetPerc.toString()).be.eql(newValue);
  });

  it('validate min proof window offset percentage for non owner, expect to fail', async () => {
    minProofWindowOffsetPerc = await parameterStorage.minProofWindowOffsetPerc();
    await truffleAssert.reverts(
      parameterStorage.setMinProofWindowOffsetPerc(minProofWindowOffsetPerc.toString(), { from: nonOwner }),
    );
  });

  it('validate max proof window offset perc for owner, expect to pass', async () => {
    const valueInContract = '75';
    const newValue = '65';
    maxProofWindowOffsetPerc = await parameterStorage.maxProofWindowOffsetPerc();

    expect(maxProofWindowOffsetPerc.toString()).be.eql(valueInContract);

    // set new value for max proof window offset perc and validate is correct
    const response = await parameterStorage.setMaxProofWindowOffsetPerc(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    maxProofWindowOffsetPerc = await parameterStorage.maxProofWindowOffsetPerc();
    expect(maxProofWindowOffsetPerc.toString()).be.eql(newValue);
  });

  it('validate max proof window offset percentage for non owner, expect to fail', async () => {
    maxProofWindowOffsetPerc = await parameterStorage.maxProofWindowOffsetPerc();
    await truffleAssert.reverts(
      parameterStorage.setMaxProofWindowOffsetPerc(maxProofWindowOffsetPerc.toString(), { from: nonOwner }),
    );
  });

  it('validate proof window duration perc for owner, expect to pass', async () => {
    const valueInContract = '25';
    const newValue = '35';
    proofWindowDurationPerc = await parameterStorage.proofWindowDurationPerc();

    expect(proofWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for proof window duration perc and validate is correct
    const response = await parameterStorage.setProofWindowDurationPerc(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    proofWindowDurationPerc = await parameterStorage.proofWindowDurationPerc();

    expect(proofWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate proof window duration perc for non owner, expect to fail', async () => {
    proofWindowDurationPerc = await parameterStorage.proofWindowDurationPerc();
    await truffleAssert.reverts(
      parameterStorage.setProofWindowDurationPerc(proofWindowDurationPerc.toString(), { from: nonOwner }),
    );
  });

  it('validate replacement window duration perc for owner, expect to pass', async () => {
    const valueInContract = '0';
    const newValue = '1';
    replacementWindowDurationPerc = await parameterStorage.replacementWindowDurationPerc();

    expect(replacementWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for replacement window duration perc and validate is correct
    const response = await parameterStorage.setReplacementWindowDurationPerc(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    replacementWindowDurationPerc = await parameterStorage.replacementWindowDurationPerc();

    expect(replacementWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate replacement window duration perc for non owner, expect to fail', async () => {
    replacementWindowDurationPerc = await parameterStorage.replacementWindowDurationPerc();
    await truffleAssert.reverts(
      parameterStorage.setReplacementWindowDurationPerc(replacementWindowDurationPerc.toString(), { from: nonOwner }),
    );
  });

  it('validate epoch length for owner, expect to pass', async () => {
    const valueInContract = 1;
    const newValue = '2';
    epochLength = await parameterStorage.epochLength();

    expect(epochLength.toString() / 3600).be.eql(valueInContract);

    // set new value for epoch length and validate is correct
    const response = await parameterStorage.setEpochLength(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    epochLength = await parameterStorage.epochLength();

    expect(epochLength.toString()).be.eql(newValue);
  });

  it('validate epoch length for non owner, expect to fail', async () => {
    await truffleAssert.reverts(parameterStorage.setEpochLength(epochLength.toString(), { from: nonOwner }));
  });

  it('validate stake withdrawal delay for owner, expect to pass', async () => {
    const valueInContract = 5;
    const newValue = '7';
    stakeWithdrawalDelay = await parameterStorage.stakeWithdrawalDelay();

    expect(stakeWithdrawalDelay.toString() / 60).be.eql(valueInContract);

    // set new value for stake withdrawal delay and validate is correct
    const response = await parameterStorage.setStakeWithdrawalDelay(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    stakeWithdrawalDelay = await parameterStorage.stakeWithdrawalDelay();

    expect(stakeWithdrawalDelay.toString()).be.eql(newValue);
  });

  it('validate stake withdrawal delay for non owner', async () => {
    stakeWithdrawalDelay = await parameterStorage.stakeWithdrawalDelay();
    await truffleAssert.reverts(
      parameterStorage.setStakeWithdrawalDelay(stakeWithdrawalDelay.toString(), { from: nonOwner }),
    );
  });

  it('validate reward withdrawal delay for owner, expect to pass', async () => {
    const valueInContract = 5;
    const newValue = '7';
    rewardWithdrawalDelay = await parameterStorage.rewardWithdrawalDelay();

    expect(rewardWithdrawalDelay.toString() / 60).be.eql(valueInContract);

    // set new value for reward withdrawal delay and validate is correct
    const response = await parameterStorage.setRewardWithdrawalDelay(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    rewardWithdrawalDelay = await parameterStorage.rewardWithdrawalDelay();

    expect(rewardWithdrawalDelay.toString()).be.eql(newValue);
  });

  it('validate reward withdrawal delay for non owner, expect to fail', async () => {
    rewardWithdrawalDelay = await parameterStorage.rewardWithdrawalDelay();
    await truffleAssert.reverts(
      parameterStorage.setRewardWithdrawalDelay(rewardWithdrawalDelay.toString(), { from: nonOwner }),
    );
  });

  it('validate slashing freeze duration for owner, expect to pass', async () => {
    const valueInContract = 730;
    const newValue = '750';
    slashingFreezeDuration = await parameterStorage.slashingFreezeDuration();

    expect(Math.floor(slashingFreezeDuration.toString() / (3600 * 24))).be.eql(valueInContract);

    // set new value for slashing freeze duration and validate is correct
    const response = await parameterStorage.setSlashingFreezeDuration(newValue, { from: owner });
    await truffleAssert.passes(response, 'Successfully passed');
    slashingFreezeDuration = await parameterStorage.slashingFreezeDuration();

    expect(slashingFreezeDuration.toString()).be.eql(newValue);
  });

  it('validate slashing freeze duration for non owner, expect to fail', async () => {
    slashingFreezeDuration = await parameterStorage.slashingFreezeDuration();
    await truffleAssert.reverts(
      parameterStorage.setSlashingFreezeDuration(slashingFreezeDuration.toString(), { from: nonOwner }),
    );
  });
});
