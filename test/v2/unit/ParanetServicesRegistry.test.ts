import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

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

  it('The contract is version "2.1.0"', async () => {
    expect(await ParanetServicesRegistry.version()).to.equal('2.1.0');
  });

  it('should return a paranet exist', async () => {
    await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [accounts[1].address, 1]),
    );

    const paranetServiceExistsResult = await ParanetServicesRegistry.paranetServiceExists(paranetServiceId);

    expect(paranetServiceExistsResult).to.equal(true);
  });

  it("should return a paranet doesn't exit", async () => {
    const paranetServiceId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [accounts[1].address, 1]),
    );
    const paranetServiceExistsResult = await ParanetServicesRegistry.paranetServiceExists(paranetServiceId);

    expect(paranetServiceExistsResult).to.equal(false);
  });

  it('should delete a paranet service', async () => {
    await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [accounts[1].address, 1]),
    );

    await ParanetServicesRegistry.deleteParanetService(paranetServiceId);

    const paranetServiceExistsResult = await ParanetServicesRegistry.paranetServiceExists(paranetServiceId);

    expect(paranetServiceExistsResult).to.equal(false);
  });

  it('should return a paranet service object', async () => {
    await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [accounts[1].address, 1]),
    );

    const paranetServiceObject = await ParanetServicesRegistry.getParanetServiceMetadata(paranetServiceId);

    expect(paranetServiceObject.paranetServiceKAStorageContract).to.equal(accounts[1].address);
    expect(paranetServiceObject.paranetServiceKATokenId).to.equal(1);
    expect(paranetServiceObject.paranetServiceAddresses).to.deep.equal([accounts[2].address]);
    expect(paranetServiceObject.name).to.equal('Test Service');
    expect(paranetServiceObject.description).to.equal('This is a test service');
  });

  it('should get all fields successfully', async () => {
    await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [accounts[1].address, 1]),
    );

    const paranetServiceAddresses = await ParanetServicesRegistry.getParanetServiceAddresses(paranetServiceId);

    expect(paranetServiceAddresses).to.deep.equal([accounts[2].address]);

    const name = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(name).to.equal('Test Service');

    const description = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(description).to.equal('This is a test service');
  });

  it('should set all fields successfully', async () => {
    await createParanetService(accounts, ParanetServicesRegistry);

    const paranetServiceId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [accounts[1].address, 1]),
    );

    await ParanetServicesRegistry.setParanetServiceAddresses(paranetServiceId, [accounts[11].address]);
    const newParanetServiceAddresses = await ParanetServicesRegistry.getParanetServiceAddresses(paranetServiceId);

    expect(newParanetServiceAddresses).to.deep.equal([accounts[11].address]);

    await ParanetServicesRegistry.setName(paranetServiceId, 'New Test Service');
    const newName = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(newName).to.equal('New Test Service');

    await ParanetServicesRegistry.setDescription(paranetServiceId, 'This is a new test service');
    const newDescription = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(newDescription).to.equal('This is a new test service');
  });

  async function createParanetService(accounts: SignerWithAddress[], ParanetServicesRegistry: ParanetServicesRegistry) {
    const admin = accounts[1];
    const serviceAddresses = [accounts[2].address];
    const paranetServiceKAStorageContract = admin;
    const paranetServiceKATokenId = 1;
    const paranetServiceName = 'Test Service';
    const paranetServiceDescription = 'This is a test service';

    await ParanetServicesRegistry.registerParanetService(
      paranetServiceKAStorageContract.address,
      paranetServiceKATokenId,
      paranetServiceName,
      paranetServiceDescription,
      serviceAddresses,
    );
  }
});
