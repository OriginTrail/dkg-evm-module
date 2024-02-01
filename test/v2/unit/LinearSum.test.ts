import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre from 'hardhat';

import { LinearSum } from '../../../typechain';

type LinearSumFixture = {
  accounts: SignerWithAddress[];
  LinearSum: LinearSum;
};

describe('@v2 @unit LinearSum', function () {
  let accounts: SignerWithAddress[];
  let LinearSum: LinearSum;

  async function deployLinearSumFixture(): Promise<LinearSumFixture> {
    await hre.deployments.fixture(['LinearSum']);
    LinearSum = await hre.ethers.getContract<LinearSum>('LinearSum');
    accounts = await hre.ethers.getSigners();

    return { accounts, LinearSum };
  }

  beforeEach(async function () {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, LinearSum } = await loadFixture(deployLinearSumFixture));
  });

  it('Should deploy successfully with correct initial parameters', async function () {
    expect(await LinearSum.name()).to.equal('LinearSum');
    expect(await LinearSum.getParameters()).to.eql([
      BigNumber.from('1000000000000000000'),
      BigNumber.from('1000000000000000000'),
      1,
      1,
    ]);
  });
});
