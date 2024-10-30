import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, ParanetsRegistry, Token, Profile, Staking } from '../../../typechain';

type deployParanetsRegistryFixture = {
  accounts: SignerWithAddress[];
  ParanetsRegistry: ParanetsRegistry;
};

describe('@v2 @unit ParanetsRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let ParanetsRegistry: ParanetsRegistry;
  let Token: Token;
  let Profile: Profile;
  let Staking: Staking;

  async function deployParanetsRegistryFixture(): Promise<deployParanetsRegistryFixture> {
    await hre.deployments.fixture(['ParanetsRegistry', 'Profile'], { keepExistingDeployments: false });
    ParanetsRegistry = await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);
    Token = await hre.ethers.getContract<Token>('Token');
    Staking = await hre.ethers.getContract<Staking>('Staking');

    return { accounts, ParanetsRegistry };
  }

  async function createProfile(
    operational: SignerWithAddress,
    admin: SignerWithAddress,
  ): Promise<{ identityId: number; nodeId: string }> {
    const OperationalProfile = Profile.connect(operational);

    const nodeId = '0x' + randomBytes(32).toString('hex');

    const receipt = await (
      await OperationalProfile.createProfile(
        admin.address,
        [],
        nodeId,
        randomBytes(3).toString('hex'),
        randomBytes(2).toString('hex'),
        0,
      )
    ).wait();
    const identityId = Number(receipt.logs[0].topics[1]);

    await OperationalProfile.setAsk(identityId, hre.ethers.utils.parseEther('0.25'));

    const stakeAmount = hre.ethers.utils.parseEther('50000');
    await Token.connect(admin).increaseAllowance(Staking.address, stakeAmount);
    await Staking.connect(admin)['addStake(uint72,uint96)'](identityId, stakeAmount);

    return { identityId, nodeId };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ParanetsRegistry } = await loadFixture(deployParanetsRegistryFixture));
  });

  it('The contract is named "ParanetsRegistry"', async () => {
    expect(await ParanetsRegistry.name()).to.equal('ParanetsRegistry');
  });

  it('The contract is version "2.2.0"', async () => {
    expect(await ParanetsRegistry.version()).to.equal('2.2.0');
  });

  // it('should register a paranet and return the correct paranet ID', async () => {
  //   const paranetId = await await createParanet(accounts, ParanetsRegistry, 0, 0);

  //   const expectedParanetId = hre.ethers.utils.solidityKeccak256(['address', 'uint256'], [accounts[1].address, 123]);

  //   expect(paranetId).to.be.equal(expectedParanetId);
  // });

  it('should show a created paranet exists', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    const exists = await ParanetsRegistry.paranetExists(paranetId);
    expect(exists).to.be.true;
  });

  it('should delete a paranet successfully', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    let exists = await ParanetsRegistry.paranetExists(paranetId);

    expect(exists).to.be.true;

    await ParanetsRegistry.deleteParanet(paranetId);

    exists = await ParanetsRegistry.paranetExists(paranetId);

    expect(exists).to.be.false;
  });

  it('should get all fields successfully', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    const paranetMetadata = await ParanetsRegistry.getParanetMetadata(paranetId);

    expect(paranetMetadata.paranetKAStorageContract).to.be.equal(accounts[1].address);
    expect(paranetMetadata.paranetKATokenId).to.be.equal(123);
    //How to get message sender?
    expect(paranetMetadata.name).to.be.equal('Test Paranet');
    expect(paranetMetadata.description).to.be.equal('Description of Test Paranet');
    expect(paranetMetadata.cumulativeKnowledgeValue).to.be.equal(0);
    expect(paranetMetadata.nodesAccessPolicy).to.be.equal(0);
    expect(paranetMetadata.minersAccessPolicy).to.be.equal(0);

    const name = await ParanetsRegistry.getName(paranetId);

    expect(name).to.be.equal('Test Paranet');

    const description = await ParanetsRegistry.getDescription(paranetId);

    expect(description).to.be.equal('Description of Test Paranet');

    const [paranetKAStorageContract, paranetKATokenId] = await ParanetsRegistry.getParanetKnowledgeAssetLocator(
      paranetId,
    );

    expect(paranetKAStorageContract).to.be.equal(accounts[1].address);
    expect(paranetKATokenId).to.be.equal(123);

    const nodesAccessPolicy = await ParanetsRegistry.getNodesAccessPolicy(paranetId);
    expect(nodesAccessPolicy).to.be.equal(0);

    const minersAccessPolicy = await ParanetsRegistry.getMinersAccessPolicy(paranetId);
    expect(minersAccessPolicy).to.be.equal(0);
  });

  it('should set all fields successfully', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    await ParanetsRegistry.setName(paranetId, 'New Test Paranet');
    const name = await ParanetsRegistry.getName(paranetId);

    expect(name).to.be.equal('New Test Paranet');

    await ParanetsRegistry.setDescription(paranetId, 'New Description of Test Paranet');
    const description = await ParanetsRegistry.getDescription(paranetId);

    expect(description).to.be.equal('New Description of Test Paranet');

    await ParanetsRegistry.setNodesAccessPolicy(paranetId, 1);
    const nodesAccessPolicy = await ParanetsRegistry.getNodesAccessPolicy(paranetId);

    expect(nodesAccessPolicy).to.be.equal(1);

    await ParanetsRegistry.setMinersAccessPolicy(paranetId, 1);
    const minersAccessPolicy = await ParanetsRegistry.getMinersAccessPolicy(paranetId);

    expect(minersAccessPolicy).to.be.equal(1);
  });

  it('should manipulate cumulative knowlededge value correctly', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

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
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    let serviceCount = await ParanetsRegistry.getServicesCount(paranetId);

    expect(serviceCount).to.be.equal(0);

    const testService1Hash = getHashFromNumber(1);
    const testService2Hash = getHashFromNumber(2);
    const testService3Hash = getHashFromNumber(3);

    await ParanetsRegistry.addService(paranetId, testService1Hash);
    await ParanetsRegistry.addService(paranetId, testService2Hash);
    await ParanetsRegistry.addService(paranetId, testService3Hash);
    serviceCount = await ParanetsRegistry.getServicesCount(paranetId);

    expect(serviceCount).to.be.equal(3);

    let services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(3);
    expect(services[0]).to.be.equal(testService1Hash);
    expect(services[1]).to.be.equal(testService2Hash);
    expect(services[2]).to.be.equal(testService3Hash);

    const service1Implemented = await ParanetsRegistry.isServiceImplemented(paranetId, testService1Hash);

    expect(service1Implemented).to.be.equal(true);

    const testService99Hash = hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [99]));
    const service99NotImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, testService99Hash);

    expect(service99NotImplemented).to.be.equal(false);

    await ParanetsRegistry.removeService(paranetId, testService1Hash);
    serviceCount = await ParanetsRegistry.getServicesCount(paranetId);

    expect(serviceCount).to.be.equal(2);

    const service1NotImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, testService1Hash);

    expect(service1NotImplemented).to.be.equal(false);

    services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(2);
    expect(services[1]).to.be.equal(testService2Hash);
    expect(services[0]).to.be.equal(testService3Hash);
  });

  it('should manipulate Curated Nodes arrays correctly', async () => {
    await createParanet(accounts, ParanetsRegistry, 1, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    let nodeCount = await ParanetsRegistry.getCuratedNodesCount(paranetId);

    expect(nodeCount).to.be.equal(0);

    const { identityId: identityId1, nodeId: nodeId1 } = await createProfile(accounts[11], accounts[1]);
    const { identityId: identityId2, nodeId: nodeId2 } = await createProfile(accounts[12], accounts[1]);
    const { identityId: identityId3, nodeId: nodeId3 } = await createProfile(accounts[13], accounts[1]);

    const tx1 = await ParanetsRegistry.addCuratedNode(paranetId, identityId1, nodeId1);
    await tx1.wait();

    const tx2 = await ParanetsRegistry.addCuratedNode(paranetId, identityId2, nodeId2);
    await tx2.wait();

    const tx3 = await ParanetsRegistry.addCuratedNode(paranetId, identityId3, nodeId3);
    await tx3.wait();

    nodeCount = await ParanetsRegistry.getCuratedNodesCount(paranetId);

    expect(nodeCount).to.be.equal(3);

    const curatedNode2Registered = await ParanetsRegistry.isCuratedNode(paranetId, identityId2);

    expect(curatedNode2Registered).to.be.equal(true);

    const curatedNode110NotRegistered = await ParanetsRegistry.isCuratedNode(paranetId, 110);

    expect(curatedNode110NotRegistered).to.be.equal(false);

    await ParanetsRegistry.removeCuratedNode(paranetId, identityId2);
    nodeCount = await ParanetsRegistry.getCuratedNodesCount(paranetId);

    expect(nodeCount).to.be.equal(2);

    const curatedNode2NotRegistered = await ParanetsRegistry.isCuratedNode(paranetId, identityId2);

    expect(curatedNode2NotRegistered).to.be.equal(false);

    const curatedNodes = await ParanetsRegistry.getCuratedNodes(paranetId);

    expect(curatedNodes.length).to.be.equal(2);
    expect(curatedNodes[0].identityId).to.be.equal(identityId1);
    expect(curatedNodes[1].identityId).to.be.equal(identityId3);
  });

  it('should manipulate Knowledge Miners arrays correctly', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    let minerCount = await ParanetsRegistry.getKnowledgeMinersCount(paranetId);

    expect(minerCount).to.be.equal(0);

    const tx1 = await ParanetsRegistry.addKnowledgeMiner(paranetId, accounts[10].address);
    await tx1.wait();

    const tx2 = await ParanetsRegistry.addKnowledgeMiner(paranetId, accounts[11].address);
    await tx2.wait();

    const tx3 = await ParanetsRegistry.addKnowledgeMiner(paranetId, accounts[12].address);
    await tx3.wait();

    minerCount = await ParanetsRegistry.getKnowledgeMinersCount(paranetId);

    expect(minerCount).to.be.equal(3);

    const knowledgeMiner11Registered = await ParanetsRegistry.isKnowledgeMinerRegistered(
      paranetId,
      accounts[11].address,
    );

    expect(knowledgeMiner11Registered).to.be.equal(true);

    const knowledgeMiner110NotRegistered = await ParanetsRegistry.isKnowledgeMinerRegistered(
      paranetId,
      accounts[110].address,
    );

    expect(knowledgeMiner110NotRegistered).to.be.equal(false);

    let knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);

    expect(knowledgeMiners).to.be.deep.equal(accounts.slice(10, 13).map((x) => x.address));

    await ParanetsRegistry.removeKnowledgeMiner(paranetId, accounts[11].address);
    minerCount = await ParanetsRegistry.getKnowledgeMinersCount(paranetId);

    expect(minerCount).to.be.equal(2);

    const knowledgeMiner11NotRegistered = await ParanetsRegistry.isKnowledgeMinerRegistered(
      paranetId,
      accounts[11].address,
    );
    expect(knowledgeMiner11NotRegistered).to.be.equal(false);

    knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);

    expect(knowledgeMiners.length).to.be.equal(2);
    expect(knowledgeMiners[0]).to.be.equal(accounts[10].address);
    expect(knowledgeMiners[1]).to.be.equal(accounts[12].address);
  });

  it('should manipulate Knowledge Assets arrays correctly', async () => {
    await createParanet(accounts, ParanetsRegistry, 0, 0);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[1].address, 123], // Values to encode
      ),
    );

    let knowledgeAssetsCount = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId);

    expect(knowledgeAssetsCount).to.be.equal(0);

    for (let i = 1; i < 18; i += 1) {
      await ParanetsRegistry.addKnowledgeAsset(paranetId, getHashFromNumber(i));
    }

    knowledgeAssetsCount = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId);

    expect(knowledgeAssetsCount).to.be.equal(17);

    const knowledgeAssets = await ParanetsRegistry.getKnowledgeAssets(paranetId);

    expect(knowledgeAssets.length).to.be.equal(17);
    expect(knowledgeAssets[5]).to.be.equal(getHashFromNumber(6));

    let knowledgeAssetsPaginated = await ParanetsRegistry.getKnowledgeAssetsWithPagination(paranetId, 10, 5);

    expect(knowledgeAssetsPaginated.length).to.be.equal(5);
    expect(knowledgeAssetsPaginated[0]).to.be.equal(getHashFromNumber(11));
    expect(knowledgeAssetsPaginated[1]).to.be.equal(getHashFromNumber(12));
    expect(knowledgeAssetsPaginated[2]).to.be.equal(getHashFromNumber(13));
    expect(knowledgeAssetsPaginated[3]).to.be.equal(getHashFromNumber(14));
    expect(knowledgeAssetsPaginated[4]).to.be.equal(getHashFromNumber(15));

    knowledgeAssetsPaginated = await ParanetsRegistry.getKnowledgeAssetsWithPagination(paranetId, 15, 5);

    expect(knowledgeAssetsPaginated.length).to.be.equal(2);
    expect(knowledgeAssetsPaginated[0]).to.be.equal(getHashFromNumber(16));
    expect(knowledgeAssetsPaginated[1]).to.be.equal(getHashFromNumber(17));

    knowledgeAssetsPaginated = await ParanetsRegistry.getKnowledgeAssetsWithPagination(paranetId, 150, 5);

    expect(knowledgeAssetsPaginated.length).to.be.equal(0);

    let knowledgeAssetsFromAssetId = await ParanetsRegistry.getKnowledgeAssetsStartingFromKnowledgeAssetId(
      paranetId,
      getHashFromNumber(5),
      5,
    );

    expect(knowledgeAssetsFromAssetId.length).to.be.equal(5);
    expect(knowledgeAssetsFromAssetId[0]).to.be.equal(getHashFromNumber(5));
    expect(knowledgeAssetsFromAssetId[1]).to.be.equal(getHashFromNumber(6));
    expect(knowledgeAssetsFromAssetId[2]).to.be.equal(getHashFromNumber(7));
    expect(knowledgeAssetsFromAssetId[3]).to.be.equal(getHashFromNumber(8));
    expect(knowledgeAssetsFromAssetId[4]).to.be.equal(getHashFromNumber(9));

    knowledgeAssetsFromAssetId = await ParanetsRegistry.getKnowledgeAssetsStartingFromKnowledgeAssetId(
      paranetId,
      getHashFromNumber(15),
      5,
    );

    expect(knowledgeAssetsFromAssetId.length).to.be.equal(3);
    expect(knowledgeAssetsFromAssetId[0]).to.be.equal(getHashFromNumber(15));
    expect(knowledgeAssetsFromAssetId[1]).to.be.equal(getHashFromNumber(16));
    expect(knowledgeAssetsFromAssetId[2]).to.be.equal(getHashFromNumber(17));

    await expect(
      ParanetsRegistry.getKnowledgeAssetsStartingFromKnowledgeAssetId(paranetId, getHashFromNumber(150), 5),
    ).to.be.revertedWith('Invalid starting KA');

    // expect(knowledgeAssetsFromAssetId.length).to.be.equal(0);

    const isAsset5Registrated = await ParanetsRegistry.isKnowledgeAssetRegistered(paranetId, getHashFromNumber(5));

    expect(isAsset5Registrated).to.be.equal(true);

    const isAsset50Registrated = await ParanetsRegistry.isKnowledgeAssetRegistered(paranetId, getHashFromNumber(50));

    expect(isAsset50Registrated).to.be.equal(false);

    await ParanetsRegistry.removeKnowledgeAsset(paranetId, getHashFromNumber(10));

    const isAsset10Registrated = await ParanetsRegistry.isKnowledgeAssetRegistered(paranetId, getHashFromNumber(10));

    expect(isAsset10Registrated).to.be.equal(false);

    knowledgeAssetsCount = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId);

    expect(knowledgeAssetsCount).to.be.equal(16);
  });
});
async function createParanet(
  accounts: SignerWithAddress[],
  ParanetsRegistry: ParanetsRegistry,
  nodesAccessPolicy: number,
  minersAccessPolicy: number,
) {
  const knowledgeAssetStorageContract = accounts[1];
  const tokenId = 123;
  const paranetName = 'Test Paranet';
  const paranetDescription = 'Description of Test Paranet';
  const _nodesAccessPolicy = nodesAccessPolicy;
  const _minersAccessPolicy = minersAccessPolicy;

  const paranetId = await ParanetsRegistry.registerParanet(
    knowledgeAssetStorageContract.address,
    tokenId,
    paranetName,
    paranetDescription,
    _nodesAccessPolicy,
    _minersAccessPolicy,
    0,
  );
  return paranetId;
}

function getHashFromNumber(number: number) {
  return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
}
