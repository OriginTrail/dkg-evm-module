import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers, EventLog } from 'ethers';
import hre from 'hardhat';

import {
  Paranet,
  ParanetsRegistry,
  ParanetServicesRegistry,
  ParanetKnowledgeMinersRegistry,
  ParanetKnowledgeCollectionsRegistry,
  ParanetIncentivesPoolFactory,
  KnowledgeCollection,
  KnowledgeCollectionStorage,
  Profile,
  Token,
  Hub,
  EpochStorage,
  ParanetNeuroIncentivesPoolStorage,
} from '../../typechain';
import { setupParanet } from '../helpers/paranet-helpers';
import {
  getDefaultPublishingNode,
  getDefaultReceivingNodes,
  getDefaultKCCreator,
} from '../helpers/setup-helpers';

// Fixture containing all contracts and accounts needed to test Paranet
type ParanetFixture = {
  accounts: SignerWithAddress[];
  Paranet: Paranet;
  ParanetsRegistry: ParanetsRegistry;
  ParanetServicesRegistry: ParanetServicesRegistry;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  KnowledgeCollection: KnowledgeCollection;
  KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  Profile: Profile;
  Token: Token;
  EpochStorage: EpochStorage;
};

describe('@unit Paranet', () => {
  let accounts: SignerWithAddress[];
  let Paranet: Paranet;
  let ParanetsRegistry: ParanetsRegistry;
  let ParanetServicesRegistry: ParanetServicesRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  let ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  let KnowledgeCollection: KnowledgeCollection;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let Profile: Profile;
  let Token: Token;
  let EpochStorage: EpochStorage;

  // Deploy all contracts, set the HubOwner and necessary accounts. Returns the ParanetFixture
  async function deployParanetFixture(): Promise<ParanetFixture> {
    await hre.deployments.fixture([
      'Paranet',
      'ParanetsRegistry',
      'ParanetServicesRegistry',
      'ParanetKnowledgeMinersRegistry',
      'ParanetKnowledgeCollectionsRegistry',
      'ParanetIncentivesPoolFactory',
      'KnowledgeCollection',
      'Profile',
      'Token',
      'EpochStorage',
    ]);

    accounts = await hre.ethers.getSigners();
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    EpochStorage = await hre.ethers.getContract<EpochStorage>('EpochStorageV8');
    Paranet = await hre.ethers.getContract<Paranet>('Paranet');
    ParanetsRegistry =
      await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    ParanetServicesRegistry =
      await hre.ethers.getContract<ParanetServicesRegistry>(
        'ParanetServicesRegistry',
      );
    ParanetKnowledgeMinersRegistry =
      await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
        'ParanetKnowledgeMinersRegistry',
      );
    ParanetKnowledgeCollectionsRegistry =
      await hre.ethers.getContract<ParanetKnowledgeCollectionsRegistry>(
        'ParanetKnowledgeCollectionsRegistry',
      );
    ParanetIncentivesPoolFactory =
      await hre.ethers.getContract<ParanetIncentivesPoolFactory>(
        'ParanetIncentivesPoolFactory',
      );
    KnowledgeCollection = await hre.ethers.getContract<KnowledgeCollection>(
      'KnowledgeCollection',
    );
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );
    Profile = await hre.ethers.getContract<Profile>('Profile');
    Token = await hre.ethers.getContract<Token>('Token');

    return {
      accounts,
      Paranet,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
      ParanetIncentivesPoolFactory,
      KnowledgeCollection,
      KnowledgeCollectionStorage,
      Profile,
      Token,
      EpochStorage,
    };
  }

  // Before each test, deploy all contracts and necessary accounts. These variables can be used in the tests
  beforeEach(async () => {
    ({
      accounts,
      Paranet,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
      ParanetIncentivesPoolFactory,
      KnowledgeCollection,
      KnowledgeCollectionStorage,
      Profile,
      Token,
    } = await loadFixture(deployParanetFixture));
  });

  describe('Paranet Registration', () => {
    it('Should register a paranet successfully', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetName,
        paranetDescription,
        nodesAccessPolicy,
        minersAccessPolicy,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(await ParanetsRegistry.paranetExists(paranetId)).to.be.true;

      // Check paranet owner
      const startTokenId =
        (paranetKCTokenId - 1) *
          Number(
            await KnowledgeCollectionStorage.knowledgeCollectionMaxSize(),
          ) +
        paranetKATokenId;

      const ownedCountInRange = await KnowledgeCollectionStorage[
        'balanceOf(address,uint256,uint256)'
      ](paranetOwner.address, startTokenId, startTokenId + 1);

      expect(ownedCountInRange).to.equal(1);

      // Check paranet metadata
      const paranetMetadata =
        await ParanetsRegistry.getParanetMetadata(paranetId);
      expect(paranetMetadata.paranetKCStorageContract).to.equal(
        paranetKCStorageContract,
      );
      expect(paranetMetadata.paranetKCTokenId).to.equal(paranetKCTokenId);
      expect(paranetMetadata.paranetKATokenId).to.equal(paranetKATokenId);
      expect(paranetMetadata.name).to.equal(paranetName);
      expect(paranetMetadata.description).to.equal(paranetDescription);
      expect(paranetMetadata.nodesAccessPolicy).to.equal(nodesAccessPolicy);
      expect(paranetMetadata.minersAccessPolicy).to.equal(minersAccessPolicy);
    });
  });

  describe('Paranet Incentives Pool', () => {
    it('Should deploy incentives pool successfully', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      const tracToNeuroEmissionMultiplier = ethers.parseUnits('1', 12); // 1 NEURO per 1 TRAC
      const operatorRewardPercentage = 1000; // 10%
      const votersRewardPercentage = 2000; // 20%

      const tx = await ParanetIncentivesPoolFactory.connect(
        paranetOwner,
      ).deployNeuroIncentivesPool(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        tracToNeuroEmissionMultiplier,
        operatorRewardPercentage,
        votersRewardPercentage,
        'Neuroweb',
        await Token.getAddress(),
      );

      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (log) =>
          log.topics[0] ===
          ParanetIncentivesPoolFactory.interface.getEvent(
            'ParanetIncentivesPoolDeployed',
          ).topicHash,
      ) as EventLog;

      expect(event?.args[0]).to.equal(paranetKCStorageContract);
      expect(event?.args[1]).to.equal(paranetKCTokenId);
      expect(event?.args[2]).to.equal(paranetKATokenId);
      expect(event?.args[5]).to.equal('Neuroweb');
      expect(event?.args[6]).to.equal(await Token.getAddress());

      let incentivesPool = await ParanetsRegistry.getIncentivesPoolByPoolName(
        paranetId,
        event?.args[5],
      );
      expect(incentivesPool.storageAddr).to.equal(event?.args[3]);
      expect(incentivesPool.rewardTokenAddress).to.equal(
        await Token.getAddress(),
      );

      incentivesPool = await ParanetsRegistry.getIncentivesPoolByStorageAddress(
        paranetId,
        event?.args[3],
      );
      expect(incentivesPool.name).to.equal(event?.args[5]);
      expect(incentivesPool.rewardTokenAddress).to.equal(
        await Token.getAddress(),
      );

      // validate incentives pool address
      const incentivesPoolStorage = (await hre.ethers.getContractAt(
        'ParanetNeuroIncentivesPoolStorage',
        event?.args[3],
      )) as ParanetNeuroIncentivesPoolStorage;
      expect(
        await incentivesPoolStorage.paranetNeuroIncentivesPoolAddress(),
      ).to.equal(event?.args[4]);
      expect(await incentivesPoolStorage.paranetId()).to.equal(paranetId);
    });
  });
});
