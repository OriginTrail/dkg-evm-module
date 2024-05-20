import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Hub, HubController } from '../../../typechain';
import { ZERO_ADDRESS } from '../../helpers/constants';

type HubFixture = {
  accounts: SignerWithAddress[];
  Hub: Hub;
  HubController: HubController;
};

describe('@v1 @unit Hub contract', function () {
  let accounts: SignerWithAddress[];
  let Hub: Hub;
  let HubController: HubController;

  async function deployHubFixture(): Promise<HubFixture> {
    await hre.deployments.fixture(['Hub']);
    Hub = await hre.ethers.getContract<Hub>('Hub');
    HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();

    return { accounts, Hub, HubController };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Hub, HubController } = await loadFixture(deployHubFixture));
  });

  it('The contract is named "Hub"', async () => {
    expect(await Hub.name()).to.equal('Hub');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await Hub.version()).to.equal('1.0.0');
  });

  it('Set correct contract address and name; emits NewContract event', async () => {
    await expect(HubController.setContractAddress('TestContract', accounts[1].address))
      .to.emit(Hub, 'NewContract')
      .withArgs('TestContract', accounts[1].address);

    expect(await Hub.getContractAddress('TestContract')).to.equal(accounts[1].address);
  });

  it('Set contract address and name (non-owner wallet); expect revert: only hub owner can set contracts', async () => {
    const HubWithNonOwnerSigner = await Hub.connect(accounts[1]);

    await expect(HubWithNonOwnerSigner.setContractAddress('TestContract', accounts[1].address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Set contract with empty name; expect revert: name cannot be empty', async () => {
    await expect(HubController.setContractAddress('', accounts[1].address)).to.be.revertedWith(
      'NamedContractSet: Name cannot be empty',
    );
  });

  it('Set contract with empty address; expect revert: address cannot be 0x0', async () => {
    await expect(HubController.setContractAddress('TestContract', ZERO_ADDRESS)).to.be.revertedWith(
      'NamedContractSet: Address cannot be 0x0',
    );
  });

  it('Update contract address; emits ContractChanged event', async () => {
    await HubController.setContractAddress('TestContract', accounts[1].address);

    expect(await Hub.getContractAddress('TestContract')).to.equal(accounts[1].address);

    await expect(HubController.setContractAddress('TestContract', accounts[2].address))
      .to.emit(Hub, 'ContractChanged')
      .withArgs('TestContract', accounts[2].address);

    expect(await Hub.getContractAddress('TestContract')).to.equal(accounts[2].address);
  });

  it('Set contract address; name should be in the Hub', async () => {
    await HubController.setContractAddress('TestContract', accounts[1].address);

    expect(await Hub['isContract(string)']('TestContract')).to.equal(true);
  });

  it('Set contract address; address should be in the Hub', async () => {
    await HubController.setContractAddress('TestContract', accounts[1].address);

    expect(await Hub['isContract(address)'](accounts[1].address)).to.equal(true);
  });

  it('Get all contracts; all addresses and names should be in the Hub', async () => {
    for (let i = 0; i < 6; i++) {
      await HubController.setContractAddress(`TestContract${i}`, accounts[i].address);
    }

    const contracts = await Hub.getAllContracts();

    contracts.forEach(async (contract) => {
      expect(await Hub.getContractAddress(contract.name)).to.equal(contract.addr);
    });
  });

  it('Set correct asset contract address and name; emits NewAssetContract event', async () => {
    await expect(HubController.setAssetStorageAddress('TestAssetContract', accounts[1].address))
      .to.emit(Hub, 'NewAssetStorage')
      .withArgs('TestAssetContract', accounts[1].address);

    expect(await Hub.getAssetStorageAddress('TestAssetContract')).to.equal(accounts[1].address);
  });

  it('Set asset contract address/name (non-owner); expect revert: only hub owner can set contracts', async () => {
    const HubWithNonOwnerSigner = await Hub.connect(accounts[1]);

    await expect(
      HubWithNonOwnerSigner.setAssetStorageAddress('TestAssetContract', accounts[1].address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('Set asset contract with empty name; expect revert: name cannot be empty', async () => {
    await expect(HubController.setAssetStorageAddress('', accounts[1].address)).to.be.revertedWith(
      'NamedContractSet: Name cannot be empty',
    );
  });

  it('Set asset contract with empty address; expect revert: address cannot be 0x0', async () => {
    await expect(HubController.setAssetStorageAddress('TestAssetContract', ZERO_ADDRESS)).to.be.revertedWith(
      'NamedContractSet: Address cannot be 0x0',
    );
  });

  it('Update asset contract address; emits AssetContractChanged event', async () => {
    await HubController.setAssetStorageAddress('TestAssetContract', accounts[1].address);

    expect(await Hub.getAssetStorageAddress('TestAssetContract')).to.equal(accounts[1].address);

    await expect(HubController.setAssetStorageAddress('TestAssetContract', accounts[2].address))
      .to.emit(Hub, 'AssetStorageChanged')
      .withArgs('TestAssetContract', accounts[2].address);

    expect(await Hub.getAssetStorageAddress('TestAssetContract')).to.equal(accounts[2].address);
  });

  it('Set asset contract address; name should be in the Hub', async () => {
    await HubController.setAssetStorageAddress('TestAssetContract', accounts[1].address);

    expect(await Hub['isAssetStorage(string)']('TestAssetContract')).to.equal(true);
  });

  it('Set asset contract address; address should be in the Hub', async () => {
    await HubController.setAssetStorageAddress('TestAssetContract', accounts[1].address);

    expect(await Hub['isAssetStorage(address)'](accounts[1].address)).to.equal(true);
  });

  it('Get all asset contracts; all addresses and names should be in the Hub', async () => {
    for (let i = 0; i < 6; i++) {
      await HubController.setAssetStorageAddress(`TestAssetContract${i}`, accounts[i].address);
    }

    const contracts = await Hub.getAllAssetStorages();

    contracts.forEach(async (contract) => {
      expect(await Hub.getAssetStorageAddress(contract.name)).to.equal(contract.addr);
    });
  });

  it('Set contract address, set the same address with different name; Expect to have 2 contracts with the same address (bug)', async () => {
    await expect(HubController.setContractAddress('TestContract1', accounts[1].address)).to.emit(Hub, 'NewContract');
    await expect(HubController.setContractAddress('TestContract2', accounts[1].address)).to.emit(Hub, 'NewContract');

    expect(await Hub.getContractAddress('TestContract1')).to.equal(accounts[1].address);
    expect(await Hub.getContractAddress('TestContract2')).to.equal(accounts[1].address);
  });
});
