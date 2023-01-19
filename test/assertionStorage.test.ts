import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { AssertionStorage, Hub } from '../typechain';

type AssertionStorageFixture = {
  accounts: SignerWithAddress[];
  AssertionStorage: AssertionStorage;
};

describe('AssertionStorage contract', function () {
  const assertionId = '0x74657374696e6720617373657274696f6e2069640209100f5047b080c0440ae1';
  const size = 20;
  const triplesNumber = 10;
  const chunksNumber = 3;
  let accounts: SignerWithAddress[];
  let AssertionStorage: AssertionStorage;

  async function deployAssertionStorageFixture(): Promise<AssertionStorageFixture> {
    await hre.deployments.fixture(['AssertionStorage']);
    const AssertionStorage = await hre.ethers.getContract<AssertionStorage>('AssertionStorage');
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    const accounts = await hre.ethers.getSigners();
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, AssertionStorage };
  }

  beforeEach(async () => {
    ({ accounts, AssertionStorage } = await loadFixture(deployAssertionStorageFixture));
  });

  it('Create an assertion with non owner, expect to fail', async () => {
    const AssertionStorageWithNonOwnerAsSigner = AssertionStorage.connect(accounts[1]);

    await expect(
      AssertionStorageWithNonOwnerAsSigner.createAssertion(assertionId, size, triplesNumber, chunksNumber),
    ).to.be.revertedWith('Fn can only be called by the hub');
  });

  it('Create an assertion with owner, expect to pass', async () => {
    await AssertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber);

    const getAssertionResponse = await AssertionStorage.getAssertion(assertionId);
    expect(getAssertionResponse.size).to.be.equal(size);
    expect(getAssertionResponse.triplesNumber).to.be.equal(triplesNumber);
    expect(getAssertionResponse.chunksNumber).to.be.equal(chunksNumber);
  });
});
