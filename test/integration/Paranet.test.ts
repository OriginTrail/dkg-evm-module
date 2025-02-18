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
  ParanetIncentivesPoolStorage,
  ParanetIncentivesPoolFactoryHelper,
  ParanetStagingRegistry,
} from '../../typechain';
import { ACCESS_POLICIES } from '../helpers/constants';
import {
  createProfilesAndKC,
  getKCSignaturesData,
  createKnowledgeCollection,
} from '../helpers/kc-helpers';
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
  ParanetIncentivesPoolFactoryHelper: ParanetIncentivesPoolFactoryHelper;
  ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  KnowledgeCollection: KnowledgeCollection;
  KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  Profile: Profile;
  Token: Token;
  EpochStorage: EpochStorage;
  ParanetStagingRegistry: ParanetStagingRegistry;
};

describe('@unit Paranet', () => {
  let accounts: SignerWithAddress[];
  let Paranet: Paranet;
  let ParanetsRegistry: ParanetsRegistry;
  let ParanetServicesRegistry: ParanetServicesRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  let ParanetIncentivesPoolFactoryHelper: ParanetIncentivesPoolFactoryHelper;
  let ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  let KnowledgeCollection: KnowledgeCollection;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;
  let Profile: Profile;
  let Token: Token;
  let EpochStorage: EpochStorage;
  let ParanetStagingRegistry: ParanetStagingRegistry;

  // Deploy all contracts, set the HubOwner and necessary accounts. Returns the ParanetFixture
  async function deployParanetFixture(): Promise<ParanetFixture> {
    await hre.deployments.fixture([
      'Paranet',
      'ParanetsRegistry',
      'ParanetServicesRegistry',
      'ParanetKnowledgeMinersRegistry',
      'ParanetKnowledgeCollectionsRegistry',
      'ParanetIncentivesPoolFactoryHelper',
      'ParanetIncentivesPoolFactory',
      'KnowledgeCollection',
      'Profile',
      'Token',
      'EpochStorage',
      'ParanetStagingRegistry',
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
    ParanetIncentivesPoolFactoryHelper =
      await hre.ethers.getContract<ParanetIncentivesPoolFactoryHelper>(
        'ParanetIncentivesPoolFactoryHelper',
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
    // await hre.deployments.deploy('Token', {
    //   from: accounts[0].address,
    //   args: ['Neuro', 'NEURO'],
    //   log: true,
    // });
    Token = await hre.ethers.getContract<Token>('Token');
    ParanetStagingRegistry =
      await hre.ethers.getContract<ParanetStagingRegistry>(
        'ParanetStagingRegistry',
      );

    return {
      accounts,
      Paranet,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
      ParanetIncentivesPoolFactoryHelper,
      ParanetIncentivesPoolFactory,
      KnowledgeCollection,
      KnowledgeCollectionStorage,
      Profile,
      Token,
      EpochStorage,
      ParanetStagingRegistry,
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
      ParanetIncentivesPoolFactoryHelper,
      ParanetIncentivesPoolFactory,
      KnowledgeCollection,
      KnowledgeCollectionStorage,
      Profile,
      Token,
      ParanetStagingRegistry,
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

    it('Should revert when registering the same paranet twice', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const paranetName = 'Test Paranet';
      const paranetDescription = 'Test Paranet Description';
      const nodesAccessPolicy = ACCESS_POLICIES.OPEN;
      const minersAccessPolicy = ACCESS_POLICIES.OPEN;

      const { paranetKCStorageContract, paranetKCTokenId, paranetKATokenId } =
        await setupParanet(
          kcCreator,
          publishingNode,
          receivingNodes,
          {
            Paranet,
            Profile,
            Token,
            KnowledgeCollection,
            KnowledgeCollectionStorage,
          },
          paranetName,
          paranetDescription,
          nodesAccessPolicy,
          minersAccessPolicy,
        );

      await expect(
        Paranet.connect(kcCreator).registerParanet(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          paranetName,
          paranetDescription,
          nodesAccessPolicy,
          minersAccessPolicy,
          ACCESS_POLICIES.OPEN,
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'ParanetHasAlreadyBeenRegistered',
      );
    });

    it('Should revert when non-owner tries to register paranet', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const nonOwner = accounts[10];

      const paranetKCStorageContract =
        await KnowledgeCollectionStorage.getAddress();

      const { collectionId } = await createProfilesAndKC(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Profile,
          KnowledgeCollection,
          Token,
        },
      );

      await expect(
        Paranet.connect(nonOwner).registerParanet(
          paranetKCStorageContract,
          collectionId,
          1,
          'paranetName',
          'paranetDescription',
          ACCESS_POLICIES.OPEN,
          ACCESS_POLICIES.OPEN,
          ACCESS_POLICIES.OPEN,
        ),
      ).to.be.revertedWith("Caller isn't the owner of the KA");
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
      ).deployIncentivesPool(
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
      expect(event?.args[5]).to.equal(await Token.getAddress());

      let incentivesPool = await ParanetsRegistry.getIncentivesPoolByPoolName(
        paranetId,
        'Neuroweb',
      );
      expect(incentivesPool.storageAddr).to.equal(event?.args[3]);
      expect(incentivesPool.rewardTokenAddress).to.equal(
        await Token.getAddress(),
      );

      incentivesPool = await ParanetsRegistry.getIncentivesPoolByStorageAddress(
        paranetId,
        event?.args[3],
      );
      expect(incentivesPool.name).to.equal('Neuroweb');
      expect(incentivesPool.rewardTokenAddress).to.equal(
        await Token.getAddress(),
      );

      // validate incentives pool address
      const incentivesPoolStorage = (await hre.ethers.getContractAt(
        'ParanetIncentivesPoolStorage',
        event?.args[3],
      )) as ParanetIncentivesPoolStorage;
      expect(
        await incentivesPoolStorage.paranetIncentivesPoolAddress(),
      ).to.equal(event?.args[4]);
      expect(await incentivesPoolStorage.paranetId()).to.equal(paranetId);
    });
  });

  describe('Submit Knowledge Collection to Paranet', () => {
    it('Should submit knowledge collection to paranet successfully', async () => {
      // 1. Setup paranet first
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        // paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );
      // 3. Submit knowledge collection to paranet
      await Paranet.connect(kcCreator).submitKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 4. Verify submission
      // Check if KC is registered in paranet
      const isRegistered =
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          paranetId,
          ethers.keccak256(
            ethers.solidityPacked(
              ['address', 'uint256'],
              [await KnowledgeCollectionStorage.getAddress(), collectionId],
            ),
          ),
        );

      expect(isRegistered).to.be.equal(true);

      // Check if KC is in miner's submitted collections
      const submittedCollections =
        await ParanetKnowledgeMinersRegistry.getSubmittedKnowledgeCollections(
          kcCreator.address,
          paranetId,
        );
      expect(submittedCollections).to.include(
        ethers.keccak256(
          ethers.solidityPacked(
            ['address', 'uint256'],
            [await KnowledgeCollectionStorage.getAddress(), collectionId],
          ),
        ),
      );

      // Check miner's stats were updated
      const minerMetadata =
        await ParanetKnowledgeMinersRegistry.getKnowledgeMinerMetadata(
          kcCreator.address,
        );
      expect(minerMetadata.totalSubmittedKnowledgeCollectionsCount).to.equal(1);

      // Check if TRAC amounts were tracked correctly
      const remainingTokenAmount =
        await KnowledgeCollectionStorage.getTokenAmount(collectionId);

      // Check cumulative TRAC spent
      const cumulativeTracSpent =
        await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(
          kcCreator.address,
          paranetId,
        );
      expect(cumulativeTracSpent).to.equal(remainingTokenAmount);

      // Check unrewarded TRAC spent
      const unrewardedTracSpent =
        await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
          kcCreator.address,
          paranetId,
        );
      expect(unrewardedTracSpent).to.equal(remainingTokenAmount);

      // Check total TRAC spent
      const totalTracSpent =
        await ParanetKnowledgeMinersRegistry.getTotalTracSpent(
          kcCreator.address,
        );
      expect(totalTracSpent).to.equal(remainingTokenAmount);

      // Check paranet's cumulative knowledge value
      const paranetMetadata =
        await ParanetsRegistry.getParanetMetadata(paranetId);
      expect(paranetMetadata.cumulativeKnowledgeValue).to.equal(
        remainingTokenAmount,
      );

      const signaturesData2 = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId: collectionId2 } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData2,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );

      // Verify event emission
      await expect(
        Paranet.connect(kcCreator).submitKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId2,
        ),
      )
        .to.emit(Paranet, 'KnowledgeCollectionSubmittedToParanet')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId2,
        );
    });

    it('Should revert when non-owner tries to submit knowledge collection', async () => {
      // 1. Setup paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const nonOwner = accounts[10];

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // 2. Create a knowledge collection
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );

      // 3. Try to submit KC with non-owner account
      await expect(
        Paranet.connect(nonOwner).submitKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId,
        ),
      ).to.be.revertedWith("Caller isn't the owner of the KC");
    });

    it('Should revert when registering the same knowledge collection twice', async () => {
      // 1. Setup paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // 2. Create a knowledge collection
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );

      await Paranet.connect(kcCreator).submitKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 4. Try to submit the same knowledge collection again
      await expect(
        Paranet.connect(kcCreator).submitKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId,
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'KnowledgeCollectionIsAPartOfOtherParanet',
      );
    });

    it('Should not allow submitting KC to second paranet after first', async () => {
      // 1. Setup first paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const firstParanet = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'First Paranet',
        'First Paranet Description',
      );

      // 2. Setup second paranet

      const signaturesData2 = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );

      const { collectionId: secondParanetCollectionId } =
        await createKnowledgeCollection(
          kcCreator,
          firstParanet.publishingNodeIdentityId,
          firstParanet.receivingNodesIdentityIds,
          signaturesData2,
          {
            KnowledgeCollection: KnowledgeCollection,
            Token: Token,
          },
        );

      await Paranet.connect(kcCreator).registerParanet(
        await KnowledgeCollectionStorage.getAddress(),
        secondParanetCollectionId,
        1,
        'Second Paranet',
        'Second Paranet Description',
        0,
        0,
        0,
      );

      // 3. Create a knowledge collection
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        firstParanet.publishingNodeIdentityId,
        firstParanet.receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );

      // 4. Submit KC to first paranet
      await Paranet.connect(kcCreator).submitKnowledgeCollection(
        firstParanet.paranetKCStorageContract,
        firstParanet.paranetKCTokenId,
        firstParanet.paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 5. Try to submit the same KC to second paranet
      await expect(
        Paranet.connect(kcCreator).submitKnowledgeCollection(
          await KnowledgeCollectionStorage.getAddress(),
          secondParanetCollectionId,
          1,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId,
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'KnowledgeCollectionIsAPartOfOtherParanet',
      );

      // 6. Verify KC is only registered in first paranet
      const knowledgeCollectionId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256'],
          [await KnowledgeCollectionStorage.getAddress(), collectionId],
        ),
      );

      const isRegisteredInFirstParanet =
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          firstParanet.paranetId,
          knowledgeCollectionId,
        );
      expect(isRegisteredInFirstParanet).to.be.equal(true);

      const secondParanetId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256', 'uint256'],
          [
            await KnowledgeCollectionStorage.getAddress(),
            secondParanetCollectionId,
            1,
          ],
        ),
      );
      const isRegisteredInSecondParanet =
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          secondParanetId,
          knowledgeCollectionId,
        );
      expect(isRegisteredInSecondParanet).to.be.equal(false);
    });
  });

  describe('Paranet with Staged Knowledge Collections', () => {
    const KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING = 1;

    it('Should create paranet with staging policy and add curator successfully', async () => {
      // 1. Setup initial accounts
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      // 2. Create paranet with staging policy
      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
      } = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'Test Paranet',
        'Test Paranet Description',
        0,
        0,
        KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING,
      );

      // 3. Add paranet owner as curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner.address,
      );

      // 4. Verify curator was added correctly
      const isCurator = await ParanetStagingRegistry.isCurator(
        paranetId,
        paranetOwner.address,
      );
      expect(isCurator).to.be.equal(true);

      // 5. Verify paranet metadata
      const paranetMetadata =
        await ParanetsRegistry.getParanetMetadata(paranetId);
      expect(paranetMetadata.knowledgeCollectionsSubmissionPolicy).to.equal(
        KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING,
      );

      // 6. Get all curators and verify
      const curators =
        await ParanetStagingRegistry.getAllParanetCurators(paranetId);
      expect(curators).to.have.lengthOf(1);
      expect(curators[0]).to.equal(paranetOwner.address);
    });

    it('Should revert when non-owner tries to add curator', async () => {
      // 1. Setup initial accounts
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const nonOwner = accounts[10];

      // 2. Create paranet with staging policy
      const { paranetKCStorageContract, paranetKCTokenId, paranetKATokenId } =
        await setupParanet(
          kcCreator,
          publishingNode,
          receivingNodes,
          {
            Paranet,
            Profile,
            Token,
            KnowledgeCollection,
            KnowledgeCollectionStorage,
          },
          'Test Paranet',
          'Test Paranet Description',
          0,
          0,
          KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING,
        );

      // 3. Try to add curator with non-owner account
      await expect(
        Paranet.connect(nonOwner).addCurator(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          nonOwner.address,
        ),
      ).to.be.revertedWith("Caller isn't the owner of the KA");
    });

    it('Should submit KC to staging and have curator approve it', async () => {
      // 1. Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'Test Paranet',
        'Test Paranet Description',
        0,
        0,
        KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING,
      );

      // 2. Add paranet owner as curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner.address,
      );

      // 4. Submit KC to paranet (goes to staging)
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );
      // 3. Submit knowledge collection to paranet
      await Paranet.connect(kcCreator).stageKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 5. Verify KC is in staging
      const knowledgeCollectionId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256'],
          [await KnowledgeCollectionStorage.getAddress(), collectionId],
        ),
      );

      const stagedStatus =
        await ParanetStagingRegistry.getKnowledgeCollectionStatus(
          paranetId,
          knowledgeCollectionId,
        );
      expect(stagedStatus).to.equal(1); // PENDING

      const isStaged = await ParanetStagingRegistry.isKnowledgeCollectionStaged(
        paranetId,
        knowledgeCollectionId,
      );
      expect(isStaged).to.be.equal(true);

      // 6. Have curator approve the KC
      await Paranet.connect(paranetOwner).reviewKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetKCStorageContract,
        collectionId,
        true, // approve
      );

      // 7. Verify KC is now registered in paranet
      const isRegistered =
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          paranetId,
          knowledgeCollectionId,
        );
      expect(isRegistered).to.be.equal(true);

      const stagedStatusAfterApproval =
        await ParanetStagingRegistry.getKnowledgeCollectionStatus(
          paranetId,
          knowledgeCollectionId,
        );
      expect(stagedStatusAfterApproval).to.equal(2); // APPROVED

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [pendingCollections, total] =
        await ParanetStagingRegistry.getPendingCollections(paranetId, 0, 10);
      expect(total).to.be.equal(0);
    });

    it('Should submit KC to staging and have curator reject it', async () => {
      // 1. Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'Test Paranet',
        'Test Paranet Description',
        0,
        0,
        KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING,
      );

      // 2. Add paranet owner as curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner.address,
      );

      // 3. Create and submit KC to paranet staging
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );

      await Paranet.connect(kcCreator).stageKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 4. Get knowledge collection ID
      const knowledgeCollectionId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256'],
          [await KnowledgeCollectionStorage.getAddress(), collectionId],
        ),
      );

      // 5. Have curator reject the KC
      await Paranet.connect(paranetOwner).reviewKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
        false, // reject
      );

      // 6. Verify KC was rejected and not registered in paranet
      const isRegistered =
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          paranetId,
          knowledgeCollectionId,
        );
      expect(isRegistered).to.be.equal(false);

      const stagedStatusAfterRejection =
        await ParanetStagingRegistry.getKnowledgeCollectionStatus(
          paranetId,
          knowledgeCollectionId,
        );
      expect(stagedStatusAfterRejection).to.equal(3); // REJECTED

      // 7. Verify KC is still staged but marked as rejected
      const isStaged = await ParanetStagingRegistry.isKnowledgeCollectionStaged(
        paranetId,
        knowledgeCollectionId,
      );
      expect(isStaged).to.be.equal(false);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [pendingCollectionsAfterRejection, totalAfterRejection] =
        await ParanetStagingRegistry.getPendingCollections(paranetId, 0, 10);
      expect(totalAfterRejection).to.be.equal(0);
    });

    it('Should allow resubmission of previously rejected Knowledge Collection', async () => {
      // 1. Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'Test Paranet',
        'Test Paranet Description',
        0,
        0,
        KNOWLEDGE_COLLECTIONS_SUBMISSION_POLICY_STAGING,
      );

      // 2. Add paranet owner as curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner.address,
      );

      // 3. Create and submit KC to paranet staging
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId } = await createKnowledgeCollection(
        kcCreator,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        signaturesData,
        {
          KnowledgeCollection: KnowledgeCollection,
          Token: Token,
        },
      );

      // 4. First submission - Stage the Knowledge Collection
      await Paranet.connect(kcCreator).stageKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      const knowledgeCollectionId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256'],
          [await KnowledgeCollectionStorage.getAddress(), collectionId],
        ),
      );

      // 5. Verify it's in pending state
      let [pendingCollections, total] =
        await ParanetStagingRegistry.getPendingCollections(paranetId, 0, 10);
      expect(total).to.equal(1);
      expect(pendingCollections[0].knowledgeCollectionId).to.equal(
        knowledgeCollectionId,
      );
      expect(pendingCollections[0].status).to.equal(1); // PENDING

      // 6. Have curator reject the KC
      await Paranet.connect(paranetOwner).reviewKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
        false, // reject
      );

      // 7. Verify rejection status (???)
      let status = await ParanetStagingRegistry.getKnowledgeCollectionStatus(
        paranetId,
        knowledgeCollectionId,
      );
      expect(status).to.equal(3); // REJECTED

      [pendingCollections, total] =
        await ParanetStagingRegistry.getPendingCollections(paranetId, 0, 10);
      expect(total).to.equal(0);
      expect(pendingCollections).to.have.lengthOf(0);

      // 8. Resubmit the Knowledge Collection
      await Paranet.connect(kcCreator).stageKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 9. Verify it's back in pending state
      [pendingCollections, total] =
        await ParanetStagingRegistry.getPendingCollections(paranetId, 0, 10);
      expect(total).to.equal(1);
      expect(pendingCollections[0].knowledgeCollectionId).to.equal(
        knowledgeCollectionId,
      );
      expect(pendingCollections[0].status).to.equal(1); // PENDING

      // 10. Have curator approve the KC this time
      await Paranet.connect(paranetOwner).reviewKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
        true, // approve
      );

      // 11. Verify final approval status
      status = await ParanetStagingRegistry.getKnowledgeCollectionStatus(
        paranetId,
        knowledgeCollectionId,
      );
      expect(status).to.equal(2); // APPROVED

      // 12. Verify KC is now registered in paranet
      const isRegistered =
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          paranetId,
          knowledgeCollectionId,
        );
      expect(isRegistered).to.be.equal(true);

      // 13. Verify no more pending collections
      [pendingCollections, total] =
        await ParanetStagingRegistry.getPendingCollections(paranetId, 0, 10);
      expect(total).to.equal(0);
      expect(pendingCollections).to.have.lengthOf(0);
    });
  });

  describe('Paranet Curator Management', () => {
    it('Should add and remove a single curator', async () => {
      // Setup paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const curator = accounts[10];

      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
      } = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'Test Paranet',
        'Test Paranet Description',
        0,
        0,
        1, // STAGING policy
      );

      // Add curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator.address,
      );

      // Verify curator was added
      expect(
        await ParanetStagingRegistry.isCurator(paranetId, curator.address),
      ).to.be.equal(true);
      let curators =
        await ParanetStagingRegistry.getAllParanetCurators(paranetId);
      expect(curators).to.have.lengthOf(1);
      expect(curators[0]).to.equal(curator.address);

      // Remove curator
      await Paranet.connect(paranetOwner).removeCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator.address,
      );

      // Verify curator was removed
      expect(
        await ParanetStagingRegistry.isCurator(paranetId, curator.address),
      ).to.be.equal(false);
      curators = await ParanetStagingRegistry.getAllParanetCurators(paranetId);
      expect(curators).to.have.lengthOf(0);
    });

    it('Should handle multiple curators and removal of middle curator', async () => {
      // Setup paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const curator1 = accounts[10];
      const curator2 = accounts[11];
      const curator3 = accounts[12];

      const {
        paranetOwner,
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
      } = await setupParanet(
        kcCreator,
        publishingNode,
        receivingNodes,
        {
          Paranet,
          Profile,
          Token,
          KnowledgeCollection,
          KnowledgeCollectionStorage,
        },
        'Test Paranet',
        'Test Paranet Description',
        0,
        0,
        1, // STAGING policy
      );

      // Add three curators
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator1.address,
      );
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator2.address,
      );
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator3.address,
      );

      // Verify all curators were added
      let curators =
        await ParanetStagingRegistry.getAllParanetCurators(paranetId);
      expect(curators).to.have.lengthOf(3);
      expect(curators).to.include(curator1.address);
      expect(curators).to.include(curator2.address);
      expect(curators).to.include(curator3.address);

      // Remove middle curator
      await Paranet.connect(paranetOwner).removeCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator2.address,
      );

      // Verify correct curator was removed and others remain
      expect(
        await ParanetStagingRegistry.isCurator(paranetId, curator1.address),
      ).to.be.equal(true);
      expect(
        await ParanetStagingRegistry.isCurator(paranetId, curator2.address),
      ).to.be.equal(false);
      expect(
        await ParanetStagingRegistry.isCurator(paranetId, curator3.address),
      ).to.be.equal(true);

      curators = await ParanetStagingRegistry.getAllParanetCurators(paranetId);
      expect(curators).to.have.lengthOf(2);
      expect(curators).to.include(curator1.address);
      expect(curators).to.include(curator3.address);
      expect(curators).to.not.include(curator2.address);
    });
  });
});
