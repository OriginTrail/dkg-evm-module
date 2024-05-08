import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { HubController, ParanetServicesRegistry } from '../../../typechain';

type deployParanetServicesRegistryFixture = {
  accounts: SignerWithAddress[];
  ParanetServicesRegistry: ParanetServicesRegistry;
};

describe('@v2 @unit ParanetServicesRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let ParanetServicesRegistry: ParanetServicesRegistry;

  async function deployParanetServicesRegistryFixture(): Promise<deployParanetServicesRegistryFixture> {
    await hre.deployments.fixture(['ParanetServicesRegistry'], { keepExistingDeployments: false });
    ParanetServicesRegistry = await hre.ethers.getContract<ParanetServicesRegistry>('ParanetServicesRegistry');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ParanetServicesRegistry };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ParanetServicesRegistry } = await loadFixture(deployParanetServicesRegistryFixture));
  });

  it('The contract is named "ParanetServicesRegistry"', async () => {
    expect(await ParanetServicesRegistry.name()).to.equal('ParanetServicesRegistry');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await ParanetServicesRegistry.version()).to.equal('2.0.0');
  });

  it('should register a paranet service and return the correct paranet service ID', async () => {
    const paranetServiceId = await createParanetService(accounts, ParanetServicesRegistry);

    const expectedParanetServiceId = hre.ethers.utils.solidityKeccak256(['address', 'uint256'], [accounts[1], 1]);

    expect(paranetServiceId).to.equal(expectedParanetServiceId);
  });

  it('should return a paranet exist', async () => {
    const paranetServiceId = await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceExistsResult = await ParanetServicesRegistry.paranetExists(paranetServiceId);

    expect(paranetServiceExistsResult).to.equal(true);
  });

  it("should return a paranet doesn't exit", async () => {
    const paranetServiceExistsResult = await ParanetServicesRegistry.paranetExists(123);

    expect(paranetServiceExistsResult).to.equal(false);
  });

  it('should delete a paranet service', async () => {
    const paranetServiceId = await createParanetService(accounts, ParanetServicesRegistry);

    await ParanetServicesRegistry.deleteParanetService(paranetServiceId);

    const paranetServiceExistsResult = await ParanetServicesRegistry.paranetExists(paranetServiceId);

    expect(paranetServiceExistsResult).to.equal(false);
  });

  it('should return a paranet service object', async () => {
    const paranetServiceId = await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceObject = await ParanetServicesRegistry.getParanetServiceObject(paranetServiceId);

    expect(paranetServiceObject.paranetServiceKAStorageContract).to.equal(accounts[0]);
    expect(paranetServiceObject.paranetServiceKATokenId).to.equal(1);
    // expect(paranetServiceObject.operator).to.equal(false);
    expect(paranetServiceObject.worker).to.equal(accounts[1]);
    expect(paranetServiceObject.name).to.equal('Test Service');
    expect(paranetServiceObject.description).to.equal('This is a test service');
    expect(paranetServiceObject.metadata).to.equal(hre.ethers.utils.formatBytes32String('Metadata'));
  });

  it('should get all fields successfully', async () => {
    const paranetServiceId = await createParanetService(accounts, ParanetServicesRegistry);

    const workerAddress = await ParanetServicesRegistry.getWorkerAddress(paranetServiceId);

    expect(workerAddress).to.equal(accounts[1]);

    const name = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(name).to.equal('Test Service');

    const description = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(description).to.equal('This is a test service');

    const metadata = await ParanetServicesRegistry.getMetadata(paranetServiceId);

    expect(metadata).to.equal(hre.ethers.utils.formatBytes32String('Metadata'));
  });

  it('should set all fields successfully', async () => {
    const paranetServiceId = await createParanetService(accounts, ParanetServicesRegistry);

    await ParanetServicesRegistry.setOperatorAddress(paranetServiceId, accounts[10]);
    const newOperatorAddress = await ParanetServicesRegistry.getOperatorAddress(paranetServiceId);

    expect(newOperatorAddress).to.equal(accounts[10]);

    await ParanetServicesRegistry.setWorkerAddress(paranetServiceId, accounts[11]);
    const newWorkerAddress = await ParanetServicesRegistry.getWorkerAddress(paranetServiceId);

    expect(newWorkerAddress).to.equal(accounts[11]);

    await ParanetServicesRegistry.setName(paranetServiceId, 'New Test Service');
    const newName = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(newName).to.equal('New Test Service');

    await ParanetServicesRegistry.setDescription(paranetServiceId, 'This is a new test service');
    const newDescription = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(newDescription).to.equal('This is a new test service');

    await ParanetServicesRegistry.setMetadata(paranetServiceId, hre.ethers.utils.formatBytes32String('New Metadata'));
    const newMetadata = await ParanetServicesRegistry.getMetadata(paranetServiceId);

    expect(newMetadata).to.equal(hre.ethers.utils.formatBytes32String('New Metadata'));
  });

  async function createParanetService(accounts: SignerWithAddress[], ParanetServicesRegistry: ParanetServicesRegistry) {
    const [admin, worker] = accounts;
    const paranetServiceKAStorageContract = admin; // assuming admin address for simplicity
    const paranetServiceKATokenId = 1;
    const paranetServiceName = 'Test Service';
    const paranetServiceDescription = 'This is a test service';
    const metadata = hre.ethers.utils.formatBytes32String('Metadata');

    return await ParanetServicesRegistry.registerParanetService(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      paranetServiceName,
      paranetServiceDescription,
      worker,
      metadata,
    );
  }
});
