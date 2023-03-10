import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { expect } from 'chai';
import hre from 'hardhat';

import { CommitManagerV1 } from '../typechain';

type CommitManagerV1Fixture = {
  accounts: SignerWithAddress[];
  CommitManagerV1: CommitManagerV1;
};

describe('CommitManagerV1 contract', function () {
  let accounts: SignerWithAddress[];
  let CommitManagerV1: CommitManagerV1;

  async function deployCommitManagerV1Fixture(): Promise<CommitManagerV1Fixture> {
    await hre.deployments.fixture(['CommitManagerV1']);
    CommitManagerV1 = await hre.ethers.getContract<CommitManagerV1>('CommitManagerV1');
    accounts = await hre.ethers.getSigners();

    return { accounts, CommitManagerV1 };
  }

  beforeEach(async () => {
    ({ accounts, CommitManagerV1 } = await loadFixture(deployCommitManagerV1Fixture));
  });
});
