import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { Interface } from 'ethers/lib/utils';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { ParametersStorage, HubController } from '../../../typechain';

type ParametersStorageFixture = {
  accounts: SignerWithAddress[];
  HubController: HubController;
  ParametersStorageInterface: Interface;
  ParametersStorage: ParametersStorage;
};

describe('@v1 @unit ParametersStorage contract', function () {
  let accounts: SignerWithAddress[];
  let HubController: HubController;
  let ParametersStorageInterface: Interface;
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
    HubController = await hre.ethers.getContract<HubController>('HubController');
    ParametersStorageInterface = new hre.ethers.utils.Interface(hre.helpers.getAbi('ParametersStorage'));
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, HubController, ParametersStorageInterface, ParametersStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, HubController, ParametersStorageInterface, ParametersStorage } = await loadFixture(
      deployParametersStorageFixture,
    ));
  });

  it('validate minimum stake for owner, expect to pass', async () => {
    const minStakeInContract = '50000000000000000000000';
    const newMinSakeValue = '40000000000000000000000';
    minimumStake = await ParametersStorage.minimumStake();

    expect(minimumStake.toString()).be.eql(minStakeInContract);

    // set a new value for min stake and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setMinimumStake', [newMinSakeValue]),
    );
    minimumStake = await ParametersStorage.minimumStake();

    expect(minimumStake.toString()).be.eql(newMinSakeValue);
  });

  it('validate minimum stake for non owner, expect to fail', async () => {
    minimumStake = await ParametersStorage.minimumStake();

    await expect(ParametersStorage.setMinimumStake(minimumStake.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate r2 for owner, expect to pass', async () => {
    const r2valueInContract = '20';
    const newR2value = '30';
    r2 = await ParametersStorage.r2();

    expect(r2.toString()).be.eql(r2valueInContract);

    // set a new value for r2 and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setR2', [newR2value]),
    );
    r2 = await ParametersStorage.r2();

    expect(r2.toString()).be.eql(newR2value);
  });

  it('validate r2 for non owner, expect to fail', async () => {
    r2 = await ParametersStorage.r2();

    await expect(ParametersStorage.setR2(r2)).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate r1 for owner, expect to pass', async () => {
    const r1valueInContract = '8';
    const newR1value = '10';
    r1 = await ParametersStorage.r1();

    expect(r1.toString()).be.eql(r1valueInContract);

    // set a new value for r1 and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setR1', [newR1value]),
    );
    r1 = await ParametersStorage.r1();

    expect(r1.toString()).be.eql(newR1value);
  });

  it('set r1 < 2r0-1, expect to revert', async () => {
    const r0 = await ParametersStorage.r0();

    await expect(
      HubController.forwardCall(
        ParametersStorage.address,
        ParametersStorageInterface.encodeFunctionData('setR1', [2 * r0 - 2]),
      ),
    ).to.be.revertedWith('R1 should be >= 2*R0-1');
  });

  it('validate r1 for non owner, expect to fail', async () => {
    r1 = await ParametersStorage.r1();

    await expect(ParametersStorage.setR1(r1.toString())).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate r0 for owner, expect to pass', async () => {
    const r0valueInContract = '3';
    const newR0value = '4';
    r0 = await ParametersStorage.r0();

    expect(r0.toString()).be.eql(r0valueInContract);

    // set a new value for r0 and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setR0', [newR0value]),
    );
    r0 = await ParametersStorage.r0();

    expect(r0.toString()).be.eql(newR0value);
  });

  it('set r0 > (r1+1)/2, expect to revert', async () => {
    const r1 = await ParametersStorage.r1();

    await expect(
      HubController.forwardCall(
        ParametersStorage.address,
        ParametersStorageInterface.encodeFunctionData('setR0', [Math.floor((r1 + 1) / 2) + 1]),
      ),
    ).to.be.revertedWith('R0 should be <= (R1+1)/2');
  });

  it('validate r0 for non owner, expect to fail', async () => {
    r0 = await ParametersStorage.r0();

    await expect(ParametersStorage.setR0(r0.toString())).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate commit window duration percentage for owner, expect to pass', async () => {
    const valueInContract = '25';
    const newValue = '20';
    commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();

    expect(commitWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for commit window duration and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setCommitWindowDurationPerc', [newValue]),
    );
    commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();

    expect(commitWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate commit window duration percentage for non owner. expect to fail', async () => {
    commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();

    await expect(ParametersStorage.setCommitWindowDurationPerc(commitWindowDurationPerc)).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate min proof window offset perc for owner, expect to pass', async () => {
    const valueInContract = '50';
    const newValue = '70';
    minProofWindowOffsetPerc = await ParametersStorage.minProofWindowOffsetPerc();

    expect(minProofWindowOffsetPerc.toString()).be.eql(valueInContract);

    // set new value for min proof window offset perc and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setMinProofWindowOffsetPerc', [newValue]),
    );

    minProofWindowOffsetPerc = await ParametersStorage.minProofWindowOffsetPerc();
    expect(minProofWindowOffsetPerc.toString()).be.eql(newValue);
  });

  it('validate min proof window offset percentage for non owner, expect to fail', async () => {
    minProofWindowOffsetPerc = await ParametersStorage.minProofWindowOffsetPerc();

    await expect(ParametersStorage.setMinProofWindowOffsetPerc(minProofWindowOffsetPerc.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate max proof window offset perc for owner, expect to pass', async () => {
    const valueInContract = '75';
    const newValue = '65';
    maxProofWindowOffsetPerc = await ParametersStorage.maxProofWindowOffsetPerc();

    expect(maxProofWindowOffsetPerc.toString()).be.eql(valueInContract);

    // set new value for max proof window offset perc and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setMaxProofWindowOffsetPerc', [newValue]),
    );
    maxProofWindowOffsetPerc = await ParametersStorage.maxProofWindowOffsetPerc();
    expect(maxProofWindowOffsetPerc.toString()).be.eql(newValue);
  });

  it('validate max proof window offset percentage for non owner, expect to fail', async () => {
    maxProofWindowOffsetPerc = await ParametersStorage.maxProofWindowOffsetPerc();

    await expect(ParametersStorage.setMaxProofWindowOffsetPerc(maxProofWindowOffsetPerc.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate proof window duration perc for owner, expect to pass', async () => {
    const valueInContract = '25';
    const newValue = '35';
    proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();

    expect(proofWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for proof window duration perc and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setProofWindowDurationPerc', [newValue]),
    );
    proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();

    expect(proofWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate proof window duration perc for non owner, expect to fail', async () => {
    proofWindowDurationPerc = await ParametersStorage.proofWindowDurationPerc();

    await expect(ParametersStorage.setProofWindowDurationPerc(proofWindowDurationPerc.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate replacement window duration perc for owner, expect to pass', async () => {
    const valueInContract = '0';
    const newValue = '1';
    replacementWindowDurationPerc = await ParametersStorage.replacementWindowDurationPerc();

    expect(replacementWindowDurationPerc.toString()).be.eql(valueInContract);

    // set new value for replacement window duration perc and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setReplacementWindowDurationPerc', [newValue]),
    );
    replacementWindowDurationPerc = await ParametersStorage.replacementWindowDurationPerc();

    expect(replacementWindowDurationPerc.toString()).be.eql(newValue);
  });

  it('validate replacement window duration perc for non owner, expect to fail', async () => {
    replacementWindowDurationPerc = await ParametersStorage.replacementWindowDurationPerc();

    await expect(
      ParametersStorage.setReplacementWindowDurationPerc(replacementWindowDurationPerc.toString()),
    ).to.be.revertedWith('Fn can only be used by hub owner');
  });

  it('validate epoch length for owner, expect to pass', async () => {
    const valueInContract = 90;
    const newValue = '2';
    epochLength = await ParametersStorage.epochLength();
    const expectedValue = `${epochLength}/86400`;

    expect(eval(expectedValue)).to.eql(valueInContract);

    // set new value for epoch length and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setEpochLength', [newValue]),
    );

    expect(await ParametersStorage.epochLength()).be.equal(newValue);
  });

  it('validate epoch length for non owner, expect to fail', async () => {
    epochLength = await ParametersStorage.epochLength();

    await expect(ParametersStorage.setEpochLength(epochLength.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate stake withdrawal delay for owner, expect to pass', async () => {
    const valueInContract = 1;
    const newValue = '7';
    stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();
    const expectedValue = `${stakeWithdrawalDelay}/60`;

    expect(eval(expectedValue)).to.eql(valueInContract);

    // set new value for stake withdrawal delay and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setStakeWithdrawalDelay', [newValue]),
    );
    stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();

    expect(stakeWithdrawalDelay.toString()).be.eql(newValue);
  });

  it('validate stake withdrawal delay for non owner', async () => {
    stakeWithdrawalDelay = await ParametersStorage.stakeWithdrawalDelay();

    await expect(ParametersStorage.setStakeWithdrawalDelay(stakeWithdrawalDelay.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate reward withdrawal delay for owner, expect to pass', async () => {
    const valueInContract = 1;
    const newValue = '7';
    rewardWithdrawalDelay = await ParametersStorage.rewardWithdrawalDelay();
    const expectedValue = `${rewardWithdrawalDelay}/60`;

    expect(eval(expectedValue)).to.eql(valueInContract);

    // set new value for reward withdrawal delay and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setRewardWithdrawalDelay', [newValue]),
    );
    rewardWithdrawalDelay = await ParametersStorage.rewardWithdrawalDelay();

    expect(rewardWithdrawalDelay.toString()).be.eql(newValue);
  });

  it('validate reward withdrawal delay for non owner, expect to fail', async () => {
    rewardWithdrawalDelay = await ParametersStorage.rewardWithdrawalDelay();

    await expect(ParametersStorage.setRewardWithdrawalDelay(rewardWithdrawalDelay.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });

  it('validate slashing freeze duration for owner, expect to pass', async () => {
    const valueInContract = 730;
    const newValue = '750';
    slashingFreezeDuration = await ParametersStorage.slashingFreezeDuration();
    const expectedValue = `${slashingFreezeDuration}/(3600 * 24)`;

    expect(eval(expectedValue)).to.eql(valueInContract);

    // set new value for slashing freeze duration and validate is correct
    await HubController.forwardCall(
      ParametersStorage.address,
      ParametersStorageInterface.encodeFunctionData('setSlashingFreezeDuration', [newValue]),
    );
    slashingFreezeDuration = await ParametersStorage.slashingFreezeDuration();

    expect(slashingFreezeDuration.toString()).be.eql(newValue);
  });

  it('validate slashing freeze duration for non owner, expect to fail', async () => {
    slashingFreezeDuration = await ParametersStorage.slashingFreezeDuration();

    await expect(ParametersStorage.setSlashingFreezeDuration(slashingFreezeDuration.toString())).to.be.revertedWith(
      'Fn can only be used by hub owner',
    );
  });
});
