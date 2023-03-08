import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { ParametersStorage, Hub } from '../typechain';

type ParametersStorageFixture = {
  accounts: SignerWithAddress[];
  ParametersStorage: ParametersStorage;
};

describe('ParametersStorage contract', function () {
  let accounts: SignerWithAddress[];
  let ParametersStorage: ParametersStorage;
  let minimumStake, r2, r1, r0, commitWindowDurationPerc, minProofWindowOffsetPerc, maxProofWindowOffsetPerc;
  let proofWindowDurationPerc,
    replacementWindowDurationPerc,
    stakeWithdrawalDelay,
    rewardWithdrawalDelay,
    slashingFreezeDuration,
    epochLength;

  async function deployParametersStorageFixture(): Promise<ParametersStorageFixture> {
    await hre.deployments.fixture(['ParametersStorage']);
    const ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    const accounts = await hre.ethers.getSigners();
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ParametersStorage };
  }

  beforeEach(async () => {
    ({ accounts, ParametersStorage } = await loadFixture(deployParametersStorageFixture));
  });

  it('validate minimum stake for owner, expect to pass', async () => {
    const minStakeInContract = '50000000000000000000000';
    const newMinSakeValue = '40000000000000000000000';
    minimumStake = await ParametersStorage.minimumStake();

    expect(minimumStake.toString()).be.eql(minStakeInContract);

    // set a new value for min stake and validate is correct
    await ParametersStorage.setMinimumStake(newMinSakeValue);
    minimumStake = await ParametersStorage.minimumStake();

    expect(minimumStake.toString()).be.eql(newMinSakeValue);
  });

  it('validate minimum stake for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    minimumStake = await ParametersStorage.minimumStake();

    await expect(ParametersStorageWithNonOwnerAsSigner.setMinimumStake(minimumStake.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate r2 for owner, expect to pass', async () => {
    const r2valueInContract = '20';
    const newR2value = '30';
    r2 = await ParametersStorage.r2();

    expect(r2.toString()).be.eql(r2valueInContract);

    // set a new value for r2 and validate is correct
    await ParametersStorage.setR2(newR2value);
    r2 = await ParametersStorage.r2();

    expect(r2.toString()).be.eql(newR2value);
  });

  it('validate r2 for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    r2 = await ParametersStorage.r2();

    await expect(ParametersStorageWithNonOwnerAsSigner.setR2(r2.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate r1 for owner, expect to pass', async () => {
    const r1valueInContract = '8';
    const newR1value = '10';
    r1 = await ParametersStorage.r1();

    expect(r1.toString()).be.eql(r1valueInContract);

    // set a new value for r1 and validate is correct
    await ParametersStorage.setR1(newR1value);
    r1 = await ParametersStorage.r1();

    expect(r1.toString()).be.eql(newR1value);
  });

  it('set r1 < 2r0-1, expect to revert', async () => {
    const r0 = await ParametersStorage.r0();

    await expect(ParametersStorage.setR1(2 * r0 - 2)).to.be.revertedWith('R1 should be >= 2*R0-1');
  });

  it('validate r1 for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    r1 = await ParametersStorage.r1();

    await expect(ParametersStorageWithNonOwnerAsSigner.setR1(r1.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate r0 for owner, expect to pass', async () => {
    const r0valueInContract = '3';
    const newR0value = '4';
    r0 = await ParametersStorage.r0();

    expect(r0.toString()).be.eql(r0valueInContract);

    // set a new value for r0 and validate is correct
    await ParametersStorage.setR0(newR0value);
    r0 = await ParametersStorage.r0();

    expect(r0.toString()).be.eql(newR0value);
  });

  it('set r0 > (r1+1)/2, expect to revert', async () => {
    const r1 = await ParametersStorage.r1();

    await expect(ParametersStorage.setR0(Math.floor((r1 + 1) / 2) + 1)).to.be.revertedWith('R0 should be <= (R1+1)/2');
  });

  it('validate r0 for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    r0 = await ParametersStorage.r0();

    await expect(ParametersStorageWithNonOwnerAsSigner.setR0(r0.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate commit window duration percentage for owner, expect to pass', async () => {
    const valueInContract = '25';
    const newValue = '20';
    commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();

    expect(commitWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for commit window duration and validate is correct
    await ParametersStorage.setCommitWindowDurationPerc(newValue);
    commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();

    expect(commitWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate commit window duration percentage for non owner. expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setCommitWindowDurationPerc(commitWindowDurationPerc),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate min proof window offset perc for owner, expect to pass', async () => {
    const valueInContract = '50';
    const newValue = '70';
    minProofWindowOffsetPerc = await ParametersStorage.minProofWindowOffsetPerc();

    expect(minProofWindowOffsetPerc.toString()).be.eql(valueInContract);

    // set new value for min proof window offset perc and validate is correct
    await ParametersStorage.setMinProofWindowOffsetPerc(newValue);

    minProofWindowOffsetPerc = await ParametersStorage.minProofWindowOffsetPerc();
    expect(minProofWindowOffsetPerc.toString()).be.eql(newValue);
  });

  it('validate min proof window offset percentage for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    minProofWindowOffsetPerc = await ParametersStorage.minProofWindowOffsetPerc();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setMinProofWindowOffsetPerc(minProofWindowOffsetPerc.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate max proof window offset perc for owner, expect to pass', async () => {
    const valueInContract = '75';
    const newValue = '65';
    maxProofWindowOffsetPerc = await ParametersStorage.maxProofWindowOffsetPerc();

    expect(maxProofWindowOffsetPerc.toString()).be.eql(valueInContract);

    // set new value for max proof window offset perc and validate is correct
    await ParametersStorage.setMaxProofWindowOffsetPerc(newValue);
    maxProofWindowOffsetPerc = await ParametersStorage.maxProofWindowOffsetPerc();
    expect(maxProofWindowOffsetPerc.toString()).be.eql(newValue);
  });

  it('validate max proof window offset percentage for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    maxProofWindowOffsetPerc = await ParametersStorage.maxProofWindowOffsetPerc();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setMaxProofWindowOffsetPerc(maxProofWindowOffsetPerc.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate proof window duration perc for owner, expect to pass', async () => {
    const valueInContract = '25';
    const newValue = '35';
    proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();

    expect(proofWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for proof window duration perc and validate is correct
    await ParametersStorage.setProofWindowDurationPerc(newValue);
    proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();

    expect(proofWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate proof window duration perc for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setProofWindowDurationPerc(proofWindowDurationPerc.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate replacement window duration perc for owner, expect to pass', async () => {
    const valueInContract = '0';
    const newValue = '1';
    replacementWindowDurationPerc = await ParametersStorage.replacementWindowDurationPerc();

    expect(replacementWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for replacement window duration perc and validate is correct
    await ParametersStorage.setReplacementWindowDurationPerc(newValue);
    replacementWindowDurationPerc = await ParametersStorage.replacementWindowDurationPerc();

    expect(replacementWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate replacement window duration perc for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    replacementWindowDurationPerc = await ParametersStorage.replacementWindowDurationPerc();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setReplacementWindowDurationPerc(replacementWindowDurationPerc.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate epoch length for owner, expect to pass', async () => {
    const valueInContract = 1;
    const newValue = '2';
    epochLength = await ParametersStorage.epochLength();
    const expectedValue = `${epochLength}/3600`;

    expect(eval(expectedValue)).to.be.eql(valueInContract);

    // set new value for epoch length and validate is correct
    await ParametersStorage.setEpochLength(newValue);

    epochLength = await ParametersStorage.epochLength();

    expect(epochLength.toString()).be.eql(newValue);
  });

  it('validate epoch length for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    epochLength = await ParametersStorage.epochLength();

    await expect(ParametersStorageWithNonOwnerAsSigner.setEpochLength(epochLength.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate stake withdrawal delay for owner, expect to pass', async () => {
    const valueInContract = 5;
    const newValue = '7';
    stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();
    const expectedValue = `${stakeWithdrawalDelay}/60`;

    expect(eval(expectedValue)).to.be.eql(valueInContract);

    // set new value for stake withdrawal delay and validate is correct
    await ParametersStorage.setStakeWithdrawalDelay(newValue);
    stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();

    expect(stakeWithdrawalDelay.toString()).be.eql(newValue);
  });

  it('validate stake withdrawal delay for non owner', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setStakeWithdrawalDelay(stakeWithdrawalDelay.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate reward withdrawal delay for owner, expect to pass', async () => {
    const valueInContract = 5;
    const newValue = '7';
    rewardWithdrawalDelay = await ParametersStorage.rewardWithdrawalDelay();
    const expectedValue = `${rewardWithdrawalDelay}/60`;

    expect(eval(expectedValue)).to.be.eql(valueInContract);

    // set new value for reward withdrawal delay and validate is correct
    await ParametersStorage.setRewardWithdrawalDelay(newValue);
    rewardWithdrawalDelay = await ParametersStorage.rewardWithdrawalDelay();

    expect(rewardWithdrawalDelay.toString()).be.eql(newValue);
  });

  it('validate reward withdrawal delay for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    rewardWithdrawalDelay = await ParametersStorage.rewardWithdrawalDelay();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setRewardWithdrawalDelay(rewardWithdrawalDelay.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate slashing freeze duration for owner, expect to pass', async () => {
    const valueInContract = 730;
    const newValue = '750';
    slashingFreezeDuration = await ParametersStorage.slashingFreezeDuration();
    const expectedValue = `${slashingFreezeDuration}/(3600 * 24)`;

    expect(eval(expectedValue)).to.be.eql(valueInContract);

    // set new value for slashing freeze duration and validate is correct
    await ParametersStorage.setSlashingFreezeDuration(newValue);
    slashingFreezeDuration = await ParametersStorage.slashingFreezeDuration();

    expect(slashingFreezeDuration.toString()).be.eql(newValue);
  });

  it('validate slashing freeze duration for non owner, expect to fail', async () => {
    const ParametersStorageWithNonOwnerAsSigner = ParametersStorage.connect(accounts[1]);
    slashingFreezeDuration = await ParametersStorage.slashingFreezeDuration();

    await expect(
      ParametersStorageWithNonOwnerAsSigner.setSlashingFreezeDuration(slashingFreezeDuration.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });
});
