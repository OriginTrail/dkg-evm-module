import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { HubController, ParanetsRegistry } from '../../../typechain';
import {} from '../../helpers/constants';

type deployParanetsRegistryFixture = {
  accounts: SignerWithAddress[];
  ParanetsRegistry: ParanetsRegistry;
};

describe('@v2 @unit ParanetsRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let ParanetsRegistry: ParanetsRegistry;

  async function deployParanetsRegistryFixture(): Promise<deployParanetsRegistryFixture> {
    await hre.deployments.fixture(['ParanetsRegistry'], { keepExistingDeployments: false });
    ParanetsRegistry = await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ParanetsRegistry };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ParanetsRegistry } = await loadFixture(deployParanetsRegistryFixture));
  });

  it('The contract is named "ParanetsRegistry"', async () => {
    expect(await ParanetsRegistry.name()).to.equal('ParanetsRegistry');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await ParanetsRegistry.version()).to.equal('2.0.0');
  });

  it('should register a paranet and return the correct paranet ID', async () => {
    const paranetId = await await createParanet(accounts, ParanetsRegistry);

    const expectedParanetId = hre.ethers.utils.solidityKeccak256(['address', 'uint256'], [accounts[1], 123]);

    expect(paranetId).to.be.equal(expectedParanetId);
  });

  it('should show a created paranet exists', async () => {
    const paranetId = await await createParanet(accounts, ParanetsRegistry);

    const exists = await ParanetsRegistry.paranetExists(paranetId);

    expect(exists).to.be.true;
  });

  it('should delete a paranet successfully', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    let exists = await ParanetsRegistry.paranetExists(paranetId);

    expect(exists).to.be.true;

    await ParanetsRegistry.deleteParanet(paranetId);

    exists = await ParanetsRegistry.paranetExists(paranetId);

    expect(exists).to.be.false;
  });

  it('should get all fields successfully', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    const paranetMetadata = await ParanetsRegistry.getParanetMetadata(paranetId);

    expect(paranetMetadata.paranetKAStorageContract).to.be.equal(accounts[1]);
    expect(paranetMetadata.paranetKATokenId).to.be.equal(123);
    //How to get message sender?
    expect(paranetMetadata.operator).to.be.equal();
    expect(paranetMetadata.minersAccessPolicy).to.be.equal(OPEN);
    expect(paranetMetadata.knowledgeAssetsInclusionPolicy).to.be.equal(OPEN);
    expect(paranetMetadata.name).to.be.equal('Test Paranet');
    expect(paranetMetadata.description).to.be.equal('Description of Test Paranet');
    expect(paranetMetadata.cumulativeKnowledgeValue).to.be.equal(0);

    const operatorAddress = await ParanetsRegistry.getOperatorAddress(paranetId);

    //How to get message sender?
    expect(operatorAddress).to.be.equal();

    const minersAccessPolicy = await ParanetsRegistry.getMinersAccessPolicy(paranetId);

    expect(minersAccessPolicy).to.be.equal(OPEN);

    const knowledgeAssetsInclusionPolicy = await ParanetsRegistry.getKnowledgeAssetsInclusionPolicy(paranetId);

    expect(knowledgeAssetsInclusionPolicy).to.be.equal(OPEN);

    const name = await ParanetsRegistry.getName(paranetId);

    expect(name).to.be.equal('Test Paranet');

    const description = await ParanetsRegistry.getDescription(paranetId);

    expect(description).to.be.equal('Description of Test Paranet');

    const incentivesPool = await ParanetsRegistry.getIncentivesPool(paranetId);

    expect(incentivesPool).to.be.equal(accounts[2]);

    const [paranetKAStorageContract, paranetKATokenId] = await ParanetsRegistry.getParanetKnowledgeAssetLocator(
      paranetId,
    );

    expect(paranetKAStorageContract).to.be.equal(accounts[1]);
    expect(paranetKATokenId).to.be.equal(123);
  });

  it('should set all fields successfully', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    await ParanetsRegistry.setOperatorAddress(paranetId, accounts[5]);
    const operatorAddress = await ParanetsRegistry.getOperatorAddress(paranetId);

    expect(operatorAddress).to.be.equal(accounts[5]);

    await ParanetsRegistry.setName(paranetId, 'New Test Paranet');
    const name = await ParanetsRegistry.getName(paranetId);

    expect(name).to.be.equal('New Test Paranet');

    await ParanetsRegistry.setDescription(paranetId, 'New Description of Test Paranet');
    const description = await ParanetsRegistry.getDescription();

    expect(description).to.be.equal('New Description of Test Paranet');
  });

  //     function setMinersAccessPolicy(
  //     bytes32 paranetId,
  //     ParanetStructs.AccessPolicy minersAccessPolicy
  // ) external onlyContracts {

  //    function setKnowledgeAssetsInclusionPolicy(
  //     bytes32 paranetId,
  //     ParanetStructs.AccessPolicy knowledgeAssetsInclusionPolicy
  // ) external onlyContracts {

  it('should manipulate cumulative knowlededge value correctly', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    let cumulativeKnowledgeValue = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId);

    expect(cumulativeKnowledgeValue).to.be.equal(0);

    await ParanetsRegistry.setCumulativeKnowledgeValue(paranetId, 100);
    cumulativeKnowledgeValue = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId);

    expect(cumulativeKnowledgeValue).to.be.equal(100);

    await ParanetsRegistry.addCumulativeKnowledgeValue(paranetId, 30);
    cumulativeKnowledgeValue = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId);

    expect(cumulativeKnowledgeValue).to.be.equal(130);

    await ParanetsRegistry.subCumulativeKnowledgeValue(paranetId, 15);
    cumulativeKnowledgeValue = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId);

    expect(cumulativeKnowledgeValue).to.be.equal(115);
  });

  it('should manipulate service arrays correctly', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    let serviceCount = await ParanetsRegistry.getServicesCount(paranetId);

    expect(serviceCount).to.be.equal(0);

    ParanetsRegistry.addService(paranetId, 1);
    ParanetsRegistry.addService(paranetId, 2);
    ParanetsRegistry.addService(paranetId, 3);
    serviceCount = await ParanetsRegistry.getServicesCount(paranetId);

    expect(serviceCount).to.be.equal(3);

    let services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(3);
    expect(services[0]).to.be.equal(1);
    expect(services[1]).to.be.equal(2);
    expect(services[2]).to.be.equal(3);

    const service1Implemented = await ParanetsRegistry.isServiceImplemented(paranetId, 1);

    expect(service1Implemented).to.be.equal(true);

    const service99NotImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, 99);

    expect(service99NotImplemented).to.be.equal(false);

    await ParanetsRegistry.removeService(paranetId, 1);
    serviceCount = await ParanetsRegistry.getServicesCount(paranetId);

    expect(serviceCount).to.be.equal(2);

    const service1NotImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, 1);

    expect(service1NotImplemented).to.be.equal(false);

    services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(2);
    expect(services[0]).to.be.equal(2);
    expect(services[1]).to.be.equal(3);
  });

  it('should manipulate Knowledge Miners arrays correctly', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    let minerCount = await ParanetsRegistry.getKnowledgeMinersCount(paranetId);

    expect(minerCount).to.be.equal(0);

    ParanetsRegistry.addKnowledgeMiner(paranetId, accounts[10]);
    ParanetsRegistry.addKnowledgeMiner(paranetId, accounts[11]);
    ParanetsRegistry.addKnowledgeMiner(paranetId, accounts[12]);
    minerCount = ParanetsRegistry.getKnowledgeMinersCount(paranetId);

    expect(minerCount).to.be.equal(3);

    const knowledgeMiner11Registered = await ParanetsRegistry.isKnowledgeMinerRegistered(paranetId, accounts[11]);

    expect(knowledgeMiner11Registered).to.be.equal(true);

    const knowledgeMiner110NotRegistered = await ParanetsRegistry.isKnowledgeMinerRegistered(paranetId, accounts[110]);

    expect(knowledgeMiner110NotRegistered).to.be.equal(false);

    let knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);

    expect(knowledgeMiners.length).to.be.equal(3);
    expect(knowledgeMiners[0]).to.be.equal(accounts[10]);
    expect(knowledgeMiners[1]).to.be.equal(accounts[11]);
    expect(knowledgeMiners[2]).to.be.equal(accounts[12]);

    await ParanetsRegistry.removeKnowledgeMiner(paranetId, accounts[11]);
    minerCount = await ParanetsRegistry.getKnowledgeMinersCount(paranetId);

    expect(minerCount).to.be.equal(2);

    const knowledgeMiner11NotRegistered = await ParanetsRegistry.isKnowledgeMinerRegistered(paranetId, accounts[11]);
    expect(knowledgeMiner11NotRegistered).to.be.equal(false);

    knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);

    expect(knowledgeMiners.length).to.be.equal(2);
    expect(knowledgeMiners[0]).to.be.equal(accounts[10]);
    expect(knowledgeMiners[1]).to.be.equal(accounts[12]);
  });

  it('should manipulate Knowledge Miners arrays correctly', async () => {
    const paranetId = await createParanet(accounts, ParanetsRegistry);

    let knowledgeAssetsCount = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId);

    expect(knowledgeAssetsCount).to.be.equal(0);

    for (let i = 1; i < 18; i += 1) {
      await ParanetsRegistry.addKnowledgeAsset(paranetId, i);
    }

    knowledgeAssetsCount = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId);

    expect(knowledgeAssetsCount).to.be.equal(17);

    const knowledgeAssets = await ParanetsRegistry.getKnowledgeAssets(paranetId);

    expect(knowledgeAssets.length).to.be.equal(17);
    expect(knowledgeAssets[5]).to.be.equal(6);

    let knowledgeAssetsPaginated = await ParanetsRegistry.getKnowledgeAssetsWithPagination(paranetId, 10, 5);

    expect(knowledgeAssetsPaginated.length).to.be.equal(5);
    expect(knowledgeAssetsPaginated[0]).to.be.equal(11);
    expect(knowledgeAssetsPaginated[1]).to.be.equal(12);
    expect(knowledgeAssetsPaginated[2]).to.be.equal(13);
    expect(knowledgeAssetsPaginated[3]).to.be.equal(14);
    expect(knowledgeAssetsPaginated[4]).to.be.equal(15);

    knowledgeAssetsPaginated = await ParanetsRegistry.getKnowledgeAssetsWithPagination(paranetId, 15, 5);

    expect(knowledgeAssetsPaginated.length).to.be.equal(2);
    expect(knowledgeAssetsPaginated[0]).to.be.equal(16);
    expect(knowledgeAssetsPaginated[1]).to.be.equal(17);

    knowledgeAssetsPaginated = await ParanetsRegistry.getKnowledgeAssetsWithPagination(paranetId, 150, 5);

    expect(knowledgeAssetsPaginated.length).to.be.equal(0);

    let knowledgeAssetsFromAssetId = await ParanetsRegistry.getKnowledgeAssetsStartingFromKnowledgeAssetId(
      paranetId,
      5,
      5,
    );

    expect(knowledgeAssetsFromAssetId.length).to.be.equal(5);
    expect(knowledgeAssetsFromAssetId[0]).to.be.equal(5);
    expect(knowledgeAssetsFromAssetId[1]).to.be.equal(6);
    expect(knowledgeAssetsFromAssetId[2]).to.be.equal(7);
    expect(knowledgeAssetsFromAssetId[3]).to.be.equal(8);
    expect(knowledgeAssetsFromAssetId[4]).to.be.equal(9);

    knowledgeAssetsFromAssetId = await ParanetsRegistry.getKnowledgeAssetsStartingFromKnowledgeAssetId(
      paranetId,
      15,
      5,
    );

    expect(knowledgeAssetsFromAssetId.length).to.be.equal(3);
    expect(knowledgeAssetsFromAssetId[0]).to.be.equal(15);
    expect(knowledgeAssetsFromAssetId[1]).to.be.equal(16);
    expect(knowledgeAssetsFromAssetId[1]).to.be.equal(17);

    knowledgeAssetsFromAssetId = await ParanetsRegistry.getKnowledgeAssetsStartingFromKnowledgeAssetId(
      paranetId,
      150,
      5,
    );

    expect(knowledgeAssetsFromAssetId.length).to.be.equal(0);

    const isAsset5Registrated = await ParanetsRegistry.isKnowledgeAssetRegistered(paranetId, 5);

    expect(isAsset5Registrated).to.be.equal(true);

    const isAsset50Registrated = await ParanetsRegistry.isKnowledgeAssetRegistered(paranetId, 50);

    expect(isAsset50Registrated).to.be.equal(false);

    await ParanetsRegistry.removeKnowledgeAsset(paranetId, 10);

    const isAsset10Registrated = await ParanetsRegistry.isKnowledgeAssetRegistered(paranetId, 10);

    expect(isAsset10Registrated).to.be.equal(false);

    knowledgeAssetsCount = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId);

    expect(knowledgeAssetsCount).to.be.equal(16);
  });
});
async function createParanet(accounts: SignerWithAddress[], ParanetsRegistry: ParanetsRegistry) {
  const knowledgeAssetStorageContract = accounts[1];
  const tokenId = 123;
  const minersAccessPolicy = OPEN;
  const knowledgeAssetsInclusionPolicy = OPEN;
  const paranetName = 'Test Paranet';
  const paranetDescription = 'Description of Test Paranet';
  const incentivesPool = accounts[2];

  const paranetId = await ParanetsRegistry.registerParanet(
    knowledgeAssetStorageContract,
    tokenId,
    minersAccessPolicy,
    knowledgeAssetsInclusionPolicy,
    paranetName,
    paranetDescription,
    incentivesPool,
  );
  return paranetId;
}
