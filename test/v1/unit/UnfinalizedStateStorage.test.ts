import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, UnfinalizedStateStorage } from '../../../typechain';
import { ZERO_ADDRESS, ZERO_BYTES32 } from '../../helpers/constants';

type UnfinalizedStateStorageFixture = {
  accounts: SignerWithAddress[];
  UnfinalizedStateStorage: UnfinalizedStateStorage;
};

describe('@v1 @unit UnfinalizedStateStorage contract', function () {
  let accounts: SignerWithAddress[];
  let UnfinalizedStateStorage: UnfinalizedStateStorage;
  const assertionId = '0x8cc2117b68bcbb1535205d517cb42ef45f25838add571fce4cfb7de7bd617943';

  async function deployUnfinalizedStateStorageFixture(): Promise<UnfinalizedStateStorageFixture> {
    await hre.deployments.fixture(['UnfinalizedStateStorage']);
    UnfinalizedStateStorage = await hre.ethers.getContract<UnfinalizedStateStorage>('UnfinalizedStateStorage');
    accounts = await hre.ethers.getSigners();
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, UnfinalizedStateStorage };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, UnfinalizedStateStorage } = await loadFixture(deployUnfinalizedStateStorageFixture));
  });

  it('The contract is named "UnfinalizedStateStorage"', async () => {
    expect(await UnfinalizedStateStorage.name()).to.equal('UnfinalizedStateStorage');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await UnfinalizedStateStorage.version()).to.equal('1.0.0');
  });

  it('Set and get new unfinalized state, expect to get state', async () => {
    await UnfinalizedStateStorage.setUnfinalizedState(0, assertionId);

    expect(await UnfinalizedStateStorage.getUnfinalizedState(0)).to.equal(assertionId);
  });

  it('Set and delete unfinalized state, expect state to be deleted', async () => {
    await UnfinalizedStateStorage.setUnfinalizedState(0, assertionId);
    await UnfinalizedStateStorage.deleteUnfinalizedState(0);

    expect(await UnfinalizedStateStorage.getUnfinalizedState(0)).to.equal(ZERO_BYTES32);
  });

  it('Set and get new issuer, expect to get issuer', async () => {
    await UnfinalizedStateStorage.setIssuer(0, accounts[0].address);

    expect(await UnfinalizedStateStorage.getIssuer(0)).to.equal(accounts[0].address);
  });

  it('Set and delete issuer, expect issuer to be deleted', async () => {
    await UnfinalizedStateStorage.setIssuer(0, accounts[0].address);
    await UnfinalizedStateStorage.deleteIssuer(0);

    expect(await UnfinalizedStateStorage.getIssuer(0)).to.equal(ZERO_ADDRESS);
  });

  it('Set new unfinalized state and check if there is a pending state, expect true', async () => {
    await UnfinalizedStateStorage.setUnfinalizedState(0, assertionId);

    expect(await UnfinalizedStateStorage.hasPendingUpdate(0)).to.equal(true);
  });

  it('Check if there is a pending state, expect false', async () => {
    expect(await UnfinalizedStateStorage.hasPendingUpdate(0)).to.equal(false);
  });
});
