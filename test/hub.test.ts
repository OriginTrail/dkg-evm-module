import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Hub } from '../typechain';
import { ZERO_ADDRESS } from './helpers/constants';

type HubFixture = {
  accounts: SignerWithAddress[];
  Hub: Hub;
};

describe('Hub contract', function () {
  async function deployHubFixture(): Promise<HubFixture> {
    await hre.deployments.fixture(['Hub']);
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    const accounts = await hre.ethers.getSigners();

    return { accounts, Hub };
  }

  it('the contract is named "Hub"', async function () {
    const { Hub } = await loadFixture(deployHubFixture);
    expect(await Hub.name()).to.equal('Hub');
  });

  it('the contract is version "1.0.0"', async function () {
    const { Hub } = await loadFixture(deployHubFixture);
    expect(await Hub.version()).to.equal('1.0.0');
  });

  it('sets correct contract address and name; emits NewContract event', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    expect(await Hub.setContractAddress('TestContract', accounts[1].address))
      .to.emit(Hub, 'NewContract')
      .withArgs('TestContract', accounts[1].address);

    expect(await Hub.getContractAddress('TestContract')).to.equal(accounts[1].address);
  });

  it('set contract address and name (non-owner wallet); expect revert: only hub owner can set contracts', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    const HubWithNonOwnerSigner = await Hub.connect(accounts[1]);

    expect(HubWithNonOwnerSigner.setContractAddress('TestContract', accounts[1].address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('set contract with empty name; expect revert: name cannot be empty', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    expect(Hub.setContractAddress('', accounts[1].address)).to.be.revertedWith(
      'NamedContractSet: Name cannot be empty',
    );
  });

  it('set contract with empty address; expect revert: address cannot be 0x0', async () => {
    const { Hub } = await loadFixture(deployHubFixture);

    await expect(Hub.setContractAddress('TestContract', ZERO_ADDRESS)).to.be.revertedWith(
      'NamedContractSet: Address cannot be 0x0',
    );
  });

  it('updates contract address; emits ContractChanged event', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    await Hub.setContractAddress('TestContract', accounts[1].address);

    expect(await Hub.getContractAddress('TestContract')).to.equal(accounts[1].address);

    expect(await Hub.setContractAddress('TestContract', accounts[2].address))
      .to.emit(Hub, 'ContractChanged')
      .withArgs('TestContract', accounts[2]);

    expect(await Hub.getContractAddress('TestContract')).to.equal(accounts[2].address);
  });

  it('sets contract address; name should be in the Hub', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    await Hub.setContractAddress('TestContract', accounts[1].address);

    expect(await Hub['isContract(string)']('TestContract')).to.equal(true);
  });

  it('sets contract address; address should be in the Hub', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    await Hub.setContractAddress('TestContract', accounts[1].address);

    expect(await Hub['isContract(address)'](accounts[1].address)).to.equal(true);
  });

  it('get all contracts; all addresses and names should be in the Hub', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    for (let i = 0; i < 6; i++) {
      await Hub.setContractAddress(`TestContract${i}`, accounts[i].address);
    }

    const contracts = await Hub.getAllContracts();

    contracts.forEach(async (contract) => {
      expect(await Hub.getContractAddress(contract.name)).to.equal(contract.addr);
    });
  });

  it('sets correct asset contract address and name; emits NewAssetContract event', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    expect(await Hub.setAssetStorageAddress('TestAssetContract', accounts[1].address))
      .to.emit(Hub, 'NewAssetStorage')
      .withArgs('TestAssetContract', accounts[1].address);

    expect(await Hub.getAssetStorageAddress('TestAssetContract')).to.equal(accounts[1].address);
  });

  it('set asset contract address/name (non-owner); expect revert: only hub owner can set contracts', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    const HubWithNonOwnerSigner = await Hub.connect(accounts[1]);

    expect(HubWithNonOwnerSigner.setAssetStorageAddress('TestAssetContract', accounts[1].address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('set asset contract with empty name; expect revert: name cannot be empty', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    expect(Hub.setAssetStorageAddress('', accounts[1].address)).to.be.revertedWith(
      'NamedContractSet: Name cannot be empty',
    );
  });

  it('set asset contract with empty address; expect revert: address cannot be 0x0', async () => {
    const { Hub } = await loadFixture(deployHubFixture);

    expect(Hub.setAssetStorageAddress('TestAssetContract', ZERO_ADDRESS)).to.be.revertedWith(
      'NamedContractSet: Address cannot be 0x0',
    );
  });

  it('updates asset contract address; emits AssetContractChanged event', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    await Hub.setAssetStorageAddress('TestAssetContract', accounts[1].address);

    expect(await Hub.getAssetStorageAddress('TestAssetContract')).to.equal(accounts[1].address);

    expect(await Hub.setAssetStorageAddress('TestAssetContract', accounts[2].address))
      .to.emit(Hub, 'AssetStorageChanged')
      .withArgs('TestAssetContract', accounts[2].address);

    expect(await Hub.getAssetStorageAddress('TestAssetContract')).to.equal(accounts[2].address);
  });

  it('sets asset contract address; name should be in the Hub', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    await Hub.setAssetStorageAddress('TestAssetContract', accounts[1].address);

    expect(await Hub['isAssetStorage(string)']('TestAssetContract')).to.equal(true);
  });

  it('sets asset contract address; address should be in the Hub', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    await Hub.setAssetStorageAddress('TestAssetContract', accounts[1].address);

    expect(await Hub['isAssetStorage(address)'](accounts[1].address)).to.equal(true);
  });

  it('get all asset contracts; all addresses and names should be in the Hub', async () => {
    const { accounts, Hub } = await loadFixture(deployHubFixture);

    for (let i = 0; i < 6; i++) {
      await Hub.setAssetStorageAddress(`TestAssetContract${i}`, accounts[i].address);
    }

    const contracts = await Hub.getAllAssetStorages();

    contracts.forEach(async (contract) => {
      expect(await Hub.getAssetStorageAddress(contract.name)).to.equal(contract.addr);
    });
  });
});
