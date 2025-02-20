import { randomBytes } from 'crypto';

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
  IdentityStorage,
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
  IdentityStorage: IdentityStorage;
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
  let IdentityStorage: IdentityStorage;
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
      'IdentityStorage',
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
    IdentityStorage =
      await hre.ethers.getContract<IdentityStorage>('IdentityStorage');

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
      IdentityStorage,
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

    it('Should revert when registering paranet with invalid access policy values', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const paranetKCStorageContract =
        await KnowledgeCollectionStorage.getAddress();

      // Create profiles and KC first
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

      // Try with invalid nodes access policy (2)
      await expect(
        Paranet.connect(kcCreator).registerParanet(
          paranetKCStorageContract,
          collectionId,
          1, // kaTokenId
          'Test Paranet',
          'Test Description',
          2, // invalid nodes access policy
          0, // valid miners access policy
          0, // valid submission policy
        ),
      ).to.be.revertedWith('Invalid policy');

      // Try with invalid miners access policy (3)
      await expect(
        Paranet.connect(kcCreator).registerParanet(
          paranetKCStorageContract,
          collectionId,
          1, // kaTokenId
          'Test Paranet',
          'Test Description',
          0, // valid nodes access policy
          3, // invalid miners access policy
          0, // valid submission policy
        ),
      ).to.be.revertedWith('Invalid policy');

      // Try with invalid submission policy (2)
      await expect(
        Paranet.connect(kcCreator).registerParanet(
          paranetKCStorageContract,
          collectionId,
          1, // kaTokenId
          'Test Paranet',
          'Test Description',
          0, // valid nodes access policy
          0, // valid miners access policy
          2, // invalid submission policy
        ),
      ).to.be.revertedWith('Invalid policy');

      // Try with all invalid policies
      await expect(
        Paranet.connect(kcCreator).registerParanet(
          paranetKCStorageContract,
          collectionId,
          1, // kaTokenId
          'Test Paranet',
          'Test Description',
          2, // invalid nodes access policy
          3, // invalid miners access policy
          2, // invalid submission policy
        ),
      ).to.be.revertedWith('Invalid policy');
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

  describe('Paranet Incentives Pool Rewards', () => {
    it('Should deploy pool, add KCs, fund pool and claim rewards correctly', async () => {
      // 1. Setup paranet first
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        paranetId,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // 2. Deploy incentives pool
      const tracToNeuroEmissionMultiplier = ethers.parseUnits('5', 12); // 5 NEURO per 1 TRAC
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
        'TestPool',
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

      const poolStorageAddress = event?.args[3];
      const poolAddress = event?.args[4];

      // 3. Create and submit knowledge collections to paranet
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
          KnowledgeCollection,
          Token,
        },
      );
      await Paranet.connect(kcCreator).submitKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      // 4. Fund the incentives pool with tokens
      const fundAmount = ethers.parseUnits('1000', 12); // 1000 tokens
      await Token.connect(accounts[0]).mint(poolStorageAddress, fundAmount);

      // 5. Get pool contracts
      const incentivesPool = await hre.ethers.getContractAt(
        'ParanetIncentivesPool',
        poolAddress,
      );
      const incentivesPoolStorage = await hre.ethers.getContractAt(
        'ParanetIncentivesPoolStorage',
        poolStorageAddress,
      );

      // 6. Check initial balances
      expect(await incentivesPoolStorage.getBalance()).to.equal(fundAmount);
      expect(await incentivesPoolStorage.totalMinersclaimedToken()).to.equal(0);
      expect(await incentivesPoolStorage.totalOperatorsclaimedToken()).to.equal(
        0,
      );
      expect(await incentivesPoolStorage.totalVotersclaimedToken()).to.equal(0);

      // 6.1. Check claim subfunctions - Not necessary for the claim flow
      // Check all percentage getters
      const operatorPercentage =
        await incentivesPoolStorage.paranetOperatorRewardPercentage();
      const votersPercentage =
        await incentivesPoolStorage.paranetIncentivizationProposalVotersRewardPercentage();

      expect(operatorPercentage).to.equal(operatorRewardPercentage); // 10%
      expect(votersPercentage).to.equal(votersRewardPercentage); // 20%

      // Calculate miners percentage (should be 70%)
      const minersPercentage =
        BigInt(10 ** 4) - operatorPercentage - votersPercentage;
      expect(minersPercentage).to.equal(7000); // 70%

      expect(await incentivesPoolStorage.paranetId()).to.equal(paranetId);

      // Check effective token emission multiplier
      const effectiveMultiplier =
        await incentivesPool.getEffectiveTokenEmissionMultiplier(
          await hre.ethers.provider
            .getBlock('latest')
            .then((b) => b!.timestamp),
        );
      expect(effectiveMultiplier).to.equal(ethers.parseUnits('5', 12));

      // Check unrewarded TRAC spent
      const unrewardedTracSpent =
        await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
          kcCreator.address,
          await incentivesPoolStorage.paranetId(),
        );
      expect(unrewardedTracSpent).to.be.gt(10 ** 6);

      // Calculate expected reward manually
      const expectedReward =
        (((BigInt(unrewardedTracSpent) * effectiveMultiplier) /
          BigInt(10 ** 18)) *
          BigInt(minersPercentage)) /
        BigInt(10 ** 4);

      // Compare with contract calculation
      const actualReward = await incentivesPool
        .connect(kcCreator)
        .getTotalKnowledgeMinerIncentiveEstimation();
      expect(actualReward).to.equal(expectedReward);
      expect(actualReward).to.be.gt(0);

      const claimableMinerRewardAmount = await incentivesPool
        .connect(kcCreator)
        .getClaimableKnowledgeMinerRewardAmount();

      const newUnrewardedTracSpent =
        claimableMinerRewardAmount == actualReward
          ? 0
          : (BigInt(actualReward - claimableMinerRewardAmount) *
              BigInt(10 ** 18)) /
            BigInt(await incentivesPoolStorage.getClaimedMinerRewardsLength());

      expect(newUnrewardedTracSpent).to.equal(0);

      expect(
        await incentivesPoolStorage.getClaimedMinerRewardsLength(),
      ).to.equal(0);

      // 7. Claim miner rewards
      const minerRewardEstimate = await incentivesPool
        .connect(kcCreator)
        .getTotalKnowledgeMinerIncentiveEstimation();
      expect(minerRewardEstimate).to.be.gt(0);

      const claimableMinerReward = await incentivesPool
        .connect(kcCreator)
        .getClaimableKnowledgeMinerRewardAmount();

      await incentivesPool
        .connect(kcCreator)
        .claimKnowledgeMinerReward(claimableMinerReward);

      // 8. Verify miner rewards claimed correctly
      expect(
        await incentivesPoolStorage
          .connect(kcCreator)
          .totalMinersclaimedToken(),
      ).to.equal(claimableMinerReward);
      const minerProfile =
        await incentivesPoolStorage.getClaimedMinerRewardsAtIndex(
          await incentivesPoolStorage.claimedMinerRewardsIndexes(
            kcCreator.address,
          ),
        );
      expect(minerProfile.addr).to.equal(kcCreator.address);
      expect(minerProfile.claimedToken).to.equal(claimableMinerReward);

      // 9. Claim operator rewards
      const operatorRewardEstimate =
        await incentivesPool.getTotalParanetOperatorIncentiveEstimation();
      expect(operatorRewardEstimate).to.be.gt(0);

      const claimableOperatorReward =
        await incentivesPool.getClaimableParanetOperatorRewardAmount();
      await incentivesPool.connect(paranetOwner).claimParanetOperatorReward();

      // 10. Verify operator rewards claimed correctly
      expect(await incentivesPoolStorage.totalOperatorsclaimedToken()).to.equal(
        claimableOperatorReward,
      );
      const operatorProfile =
        await incentivesPoolStorage.getClaimedOperatorRewardsAtIndex(
          await incentivesPoolStorage.claimedOperatorRewardsIndexes(
            paranetOwner.address,
          ),
        );
      expect(operatorProfile.addr).to.equal(paranetOwner.address);
      expect(operatorProfile.claimedToken).to.equal(claimableOperatorReward);

      // 11. Verify final pool balance
      const expectedRemainingBalance =
        fundAmount - claimableMinerReward - claimableOperatorReward;
      expect(await incentivesPoolStorage.getBalance()).to.equal(
        expectedRemainingBalance,
      );
    });

    it('Should fail to claim rewards when pool has no funds', async () => {
      // 1. Setup paranet first
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
        paranetId,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // Deploy pool without funding it
      const tx = await ParanetIncentivesPoolFactory.connect(
        paranetOwner,
      ).deployIncentivesPool(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        ethers.parseUnits('1', 12), // 1 NEURO per 1 TRAC
        1000, // 10% operatorRewardPercentage
        2000, // 20% votersRewardPercentage
        'TestPool',
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

      const incentivesPool = await hre.ethers.getContractAt(
        'ParanetIncentivesPool',
        event?.args[4],
      );

      // Create and submit knowledge collections to paranet
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
          KnowledgeCollection,
          Token,
        },
      );

      await Paranet.connect(kcCreator).submitKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
      );

      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          kcCreator.address,
        ),
      ).to.be.equal(true);

      // Try to claim miner rewards
      await expect(
        incentivesPool.connect(kcCreator).claimKnowledgeMinerReward(0),
      ).to.be.revertedWithCustomError(incentivesPool, 'NoRewardAvailable');

      // Try to claim operator rewards
      await expect(
        incentivesPool.connect(paranetOwner).claimParanetOperatorReward(),
      ).to.be.revertedWithCustomError(incentivesPool, 'NoRewardAvailable');
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

    it('Should not allow approving a rejected knowledge collection', async () => {
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
        1, // STAGING policy
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

      // 4. Stage the Knowledge Collection
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

      // 5. Reject the KC
      await Paranet.connect(paranetOwner).reviewKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
        false, // reject
      );

      // 6. Verify rejection status
      let status = await ParanetStagingRegistry.getKnowledgeCollectionStatus(
        paranetId,
        knowledgeCollectionId,
      );
      expect(status).to.equal(3); // Still REJECTED

      // 7. Try to approve the rejected KC (should fail)
      await expect(
        Paranet.connect(paranetOwner).reviewKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId,
          true, // try to approve
        ),
      ).to.be.revertedWith('Knowledge collection is not staged');

      // 8. Verify status remains rejected
      status = await ParanetStagingRegistry.getKnowledgeCollectionStatus(
        paranetId,
        knowledgeCollectionId,
      );
      expect(status).to.equal(3); // Still REJECTED
    });

    it('Should revert when non-curator tries to review collection', async () => {
      // 1. Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const curator = accounts[10];
      const nonCurator = accounts[11];

      const {
        paranetOwner,
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
        1, // STAGING policy
      );

      // 2. Add curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator.address,
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

      // 4. Try to review with non-curator account
      await expect(
        Paranet.connect(nonCurator).reviewKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId,
          true, // approve
        ),
      ).to.be.revertedWith('Not authorized curator');
    });

    it('Should revert when reviewing already reviewed collection', async () => {
      // 1. Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const curator = accounts[10];

      const {
        paranetOwner,
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
        1, // STAGING policy
      );

      // 2. Add curator
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator.address,
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

      // 4. First review (approve)
      await Paranet.connect(curator).reviewKnowledgeCollection(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        await KnowledgeCollectionStorage.getAddress(),
        collectionId,
        false, // rejected
      );

      // 5. Try to review again
      await expect(
        Paranet.connect(curator).reviewKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          collectionId,
          true, // approve
        ),
      ).to.be.revertedWith('Knowledge collection is not staged');
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

    it('Should revert when adding curator to non-staging paranet', async () => {
      // Setup paranet with OPEN submission policy (0)
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const curator = accounts[10];

      const {
        paranetOwner,
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
        0, // nodesAccessPolicy
        0, // minersAccessPolicy
        0, // OPEN submission policy
      );

      // Attempt to add curator - should fail
      await expect(
        Paranet.connect(paranetOwner).addCurator(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          curator.address,
        ),
      ).to.be.revertedWith('Paranet does not allow adding curators');
    });

    it('Should revert when adding same curator twice', async () => {
      // Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const curator = accounts[10];

      const {
        paranetOwner,
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
        0, // nodesAccessPolicy
        0, // minersAccessPolicy
        1, // STAGING policy
      );

      // Add curator first time
      await Paranet.connect(paranetOwner).addCurator(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        curator.address,
      );

      // Try to add same curator again - should fail
      await expect(
        Paranet.connect(paranetOwner).addCurator(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          curator.address,
        ),
      ).to.be.revertedWith('Existing curator');
    });

    it('Should revert when removing non-existent curator', async () => {
      // Setup paranet with staging policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const nonExistentCurator = accounts[10];

      const {
        paranetOwner,
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
        0, // nodesAccessPolicy
        0, // minersAccessPolicy
        1, // STAGING policy
      );

      // Try to remove curator that was never added - should fail
      await expect(
        Paranet.connect(paranetOwner).removeCurator(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          nonExistentCurator.address,
        ),
      ).to.be.revertedWith('Address is not a curator');
    });
  });

  describe('Paranet Service Registration', () => {
    it('Should register a paranet service successfully', async () => {
      // 1. Setup initial paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // 2. Create a new knowledge collection for the service
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId: serviceCollectionId } =
        await createKnowledgeCollection(
          kcCreator,
          publishingNodeIdentityId,
          receivingNodesIdentityIds,
          signaturesData,
          {
            KnowledgeCollection: KnowledgeCollection,
            Token: Token,
          },
        );

      // 3. Setup service parameters
      const serviceName = 'Test Service';
      const serviceDescription = 'Test Service Description';
      const serviceAddresses = [accounts[10].address, accounts[11].address];

      // 4. Register the service
      const tx = await Paranet.connect(paranetOwner).registerParanetService(
        await KnowledgeCollectionStorage.getAddress(),
        serviceCollectionId,
        1, // serviceKATokenId
        serviceName,
        serviceDescription,
        serviceAddresses,
      );

      // 5. Verify service registration
      const serviceId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256', 'uint256'],
          [
            await KnowledgeCollectionStorage.getAddress(),
            serviceCollectionId,
            1,
          ],
        ),
      );

      // Check if service exists
      const serviceExists =
        await ParanetServicesRegistry.paranetServiceExists(serviceId);
      expect(serviceExists).to.be.equal(true);

      // Verify service metadata
      const serviceMetadata =
        await ParanetServicesRegistry.getParanetServiceMetadata(serviceId);
      expect(serviceMetadata.name).to.equal(serviceName);
      expect(serviceMetadata.description).to.equal(serviceDescription);
      expect(serviceMetadata.paranetServiceAddresses).to.deep.equal(
        serviceAddresses,
      );
      expect(serviceMetadata.paranetServiceKCStorageContract).to.equal(
        await KnowledgeCollectionStorage.getAddress(),
      );
      expect(serviceMetadata.paranetServiceKCTokenId).to.equal(
        serviceCollectionId,
      );
      expect(serviceMetadata.paranetServiceKATokenId).to.equal(1);

      // Verify service addresses
      const registeredAddresses =
        await ParanetServicesRegistry.getParanetServiceAddresses(serviceId);
      expect(registeredAddresses).to.deep.equal(serviceAddresses);

      // Verify individual service addresses are registered
      for (const addr of serviceAddresses) {
        const isRegistered =
          await ParanetServicesRegistry.isParanetServiceAddressRegistered(
            serviceId,
            addr,
          );
        expect(isRegistered).to.be.equal(true);
      }

      // 6. Verify event emission
      await expect(tx)
        .to.emit(Paranet, 'ParanetServiceRegistered')
        .withArgs(
          await KnowledgeCollectionStorage.getAddress(),
          serviceCollectionId,
          1,
          serviceName,
          serviceDescription,
          serviceAddresses,
        );

      // 7. Add paranet service to paranet
      const addServiceTx = await Paranet.connect(
        paranetOwner,
      ).addParanetServices(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        [
          {
            knowledgeCollectionStorageContract:
              await KnowledgeCollectionStorage.getAddress(),
            knowledgeCollectionTokenId: serviceCollectionId,
            knowledgeAssetTokenId: 1,
          },
        ],
      );

      // Verify service is implemented in paranet
      const isImplemented = await ParanetsRegistry.isServiceImplemented(
        paranetId,
        serviceId,
      );
      expect(isImplemented).to.be.equal(true);

      // Verify paranet services list
      const paranetServices = await ParanetsRegistry.getServices(paranetId);
      expect(paranetServices).to.include(serviceId);
      expect(paranetServices).to.have.lengthOf(1);

      // Verify ParanetServiceAdded event
      await expect(addServiceTx)
        .to.emit(Paranet, 'ParanetServiceAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          serviceCollectionId,
          1,
        );
    });

    it('Should revert when trying to register the same paranet service twice', async () => {
      // 1. Setup initial paranet
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);

      const {
        paranetOwner,
        publishingNodeIdentityId,
        receivingNodesIdentityIds,
      } = await setupParanet(kcCreator, publishingNode, receivingNodes, {
        Paranet,
        Profile,
        Token,
        KnowledgeCollection,
        KnowledgeCollectionStorage,
      });

      // 2. Create a new knowledge collection for the service
      const signaturesData = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId: serviceCollectionId } =
        await createKnowledgeCollection(
          kcCreator,
          publishingNodeIdentityId,
          receivingNodesIdentityIds,
          signaturesData,
          {
            KnowledgeCollection: KnowledgeCollection,
            Token: Token,
          },
        );

      // 3. Setup service parameters
      const serviceName = 'Test Service';
      const serviceDescription = 'Test Service Description';
      const serviceAddresses = [accounts[10].address, accounts[11].address];

      // 4. Register the service first time
      await Paranet.connect(paranetOwner).registerParanetService(
        await KnowledgeCollectionStorage.getAddress(),
        serviceCollectionId,
        1, // serviceKATokenId
        serviceName,
        serviceDescription,
        serviceAddresses,
      );

      // 5. Attempt to register the same service again
      await expect(
        Paranet.connect(paranetOwner).registerParanetService(
          await KnowledgeCollectionStorage.getAddress(),
          serviceCollectionId,
          1, // serviceKATokenId
          serviceName,
          serviceDescription,
          serviceAddresses,
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'ParanetServiceHasAlreadyBeenRegistered',
      );
    });
  });

  describe('Paranet Permissioned Miners', () => {
    it('Should allow owner to add and remove curated miners', async () => {
      // Setup paranet with permissioned miners policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const miner1 = accounts[10];
      const miner2 = accounts[11];

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId, // Add this to destructuring
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
        ACCESS_POLICIES.OPEN, // nodes policy
        1, // miners policy
        ACCESS_POLICIES.OPEN, // submission policy
      );

      // Verify initial state
      expect(
        await ParanetsRegistry.getKnowledgeMinersCount(paranetId),
      ).to.equal(0);
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner1.address,
        ),
      ).to.be.equal(false);
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner2.address,
        ),
      ).to.be.equal(false);

      // Add miners
      await expect(
        Paranet.connect(kcCreator).addParanetCuratedMiners(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [miner1.address, miner2.address],
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedMinerAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner1.address,
        )
        .to.emit(Paranet, 'ParanetCuratedMinerAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner2.address,
        );

      // Verify miners were added
      expect(
        await ParanetsRegistry.getKnowledgeMinersCount(paranetId),
      ).to.equal(2);
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner1.address,
        ),
      ).to.be.equal(true);
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner2.address,
        ),
      ).to.be.equal(true);

      const registeredMiners =
        await ParanetsRegistry.getKnowledgeMiners(paranetId);
      expect(registeredMiners[0]).to.be.equal(miner1.address);
      expect(registeredMiners[1]).to.be.equal(miner2.address);

      // Remove miners
      await expect(
        Paranet.connect(kcCreator).removeParanetCuratedMiners(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [miner1.address],
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedMinerRemoved')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner1.address,
        );

      // Verify miner1 was removed but miner2 remains
      expect(
        await ParanetsRegistry.getKnowledgeMinersCount(paranetId),
      ).to.equal(1);
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner1.address,
        ),
      ).to.be.equal(false);
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner2.address,
        ),
      ).to.be.equal(true);

      const remainingMiners =
        await ParanetsRegistry.getKnowledgeMiners(paranetId);
      expect(remainingMiners).to.have.lengthOf(1);
      expect(remainingMiners[0]).to.equal(miner2.address);
    });

    it('Should handle miner access requests correctly', async () => {
      // Setup paranet with permissioned miners policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const miner = accounts[10];

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        ACCESS_POLICIES.OPEN, // nodes policy
        1, // miners policy
        ACCESS_POLICIES.OPEN, // submission policy
      );

      // Request access
      await expect(
        Paranet.connect(miner).requestParanetCuratedMinerAccess(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedMinerAccessRequestCreated')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner.address,
        );

      // Verify request state
      const latestRequest =
        await ParanetsRegistry.getLatestKnowledgeMinerAccessRequest(
          paranetId,
          miner.address,
        );
      expect(latestRequest.miner).to.equal(miner.address);
      expect(latestRequest.status).to.equal(1); // PENDING status
      expect(latestRequest.createdAt).to.be.gt(0);
      expect(latestRequest.updatedAt).to.equal(latestRequest.createdAt);

      // Approve request
      await expect(
        Paranet.connect(kcCreator).approveCuratedMiner(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner.address,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedMinerAccessRequestAccepted')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner.address,
        )
        .to.emit(Paranet, 'ParanetCuratedMinerAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner.address,
        );

      // Verify request state after approval
      const updatedRequest =
        await ParanetsRegistry.getLatestKnowledgeMinerAccessRequest(
          paranetId,
          miner.address,
        );
      expect(updatedRequest.miner).to.equal(miner.address);
      expect(updatedRequest.status).to.equal(2); // ACCEPTED status
      expect(updatedRequest.createdAt).to.equal(latestRequest.createdAt);
      expect(updatedRequest.updatedAt).to.be.gt(latestRequest.updatedAt);

      // Verify miner is now registered
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner.address,
        ),
      ).to.be.equal(true);
    });

    it('Should handle miner access request rejection', async () => {
      // Setup paranet with permissioned miners policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const miner = accounts[10];

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        ACCESS_POLICIES.OPEN, // nodes policy
        1, // miners policy
        ACCESS_POLICIES.OPEN, // submission policy
      );

      // Request access
      await Paranet.connect(miner).requestParanetCuratedMinerAccess(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
      );

      // Verify initial request state
      const latestRequest =
        await ParanetsRegistry.getLatestKnowledgeMinerAccessRequest(
          paranetId,
          miner.address,
        );
      expect(latestRequest.miner).to.equal(miner.address);
      expect(latestRequest.status).to.equal(1); // PENDING status
      expect(latestRequest.createdAt).to.be.gt(0);
      expect(latestRequest.updatedAt).to.equal(latestRequest.createdAt);

      // Reject request
      await expect(
        Paranet.connect(kcCreator).rejectCuratedMiner(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner.address,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedMinerAccessRequestRejected')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          miner.address,
        );

      // Verify request state after rejection
      const updatedRequest =
        await ParanetsRegistry.getLatestKnowledgeMinerAccessRequest(
          paranetId,
          miner.address,
        );
      expect(updatedRequest.miner).to.equal(miner.address);
      expect(updatedRequest.status).to.equal(3); // REJECTED status
      expect(updatedRequest.createdAt).to.equal(latestRequest.createdAt);
      expect(updatedRequest.updatedAt).to.be.gt(latestRequest.updatedAt);

      // Verify miner is not registered
      expect(
        await ParanetsRegistry.isKnowledgeMinerRegistered(
          paranetId,
          miner.address,
        ),
      ).to.be.equal(false);
    });

    it('Should revert when non-owner tries to add/remove miners', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const miner = accounts[10];
      const nonOwner = accounts[11];

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
          ACCESS_POLICIES.OPEN,
          1,
          ACCESS_POLICIES.OPEN,
        );

      // Try to add miner as non-owner
      await expect(
        Paranet.connect(nonOwner).addParanetCuratedMiners(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [miner.address],
        ),
      ).to.be.revertedWith("Caller isn't the owner of the KA");

      // Try to remove miner as non-owner
      await expect(
        Paranet.connect(nonOwner).removeParanetCuratedMiners(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [miner.address],
        ),
      ).to.be.revertedWith("Caller isn't the owner of the KA");
    });

    it('Should revert when requesting access multiple times', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const miner = accounts[10];

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
          ACCESS_POLICIES.OPEN,
          1,
          ACCESS_POLICIES.OPEN,
        );

      // First request
      await Paranet.connect(miner).requestParanetCuratedMinerAccess(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
      );

      // Try to request again while first request is pending
      await expect(
        Paranet.connect(miner).requestParanetCuratedMinerAccess(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'ParanetCuratedMinerAccessRequestInvalidStatus',
      );
    });

    it('Should allow registered miner to submit KC but reject unregistered miner', async () => {
      // Setup paranet with permissioned miners policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const miner1 = accounts[10];
      const miner2 = accounts[11];

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        ACCESS_POLICIES.OPEN, // nodes policy
        1, // miners policy - PERMISSIONED
        ACCESS_POLICIES.OPEN, // submission policy
      );

      // Add miner1 as a curated miner
      await Paranet.connect(kcCreator).addParanetCuratedMiners(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        [miner1.address],
      );

      // Create KC for miner1
      const signaturesData1 = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId: miner1CollectionId } =
        await createKnowledgeCollection(
          miner1, // Using miner1 as KC creator
          publishingNodeIdentityId,
          receivingNodesIdentityIds,
          signaturesData1,
          {
            KnowledgeCollection: KnowledgeCollection,
            Token: Token,
          },
        );

      // Create KC for miner2
      const signaturesData2 = await getKCSignaturesData(
        publishingNode,
        1,
        receivingNodes,
      );
      const { collectionId: miner2CollectionId } =
        await createKnowledgeCollection(
          miner2, // Using miner2 as KC creator
          publishingNodeIdentityId,
          receivingNodesIdentityIds,
          signaturesData2,
          {
            KnowledgeCollection: KnowledgeCollection,
            Token: Token,
          },
        );

      // Miner1 (registered) submits KC - should succeed
      await expect(
        Paranet.connect(miner1).submitKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          miner1CollectionId,
        ),
      )
        .to.emit(Paranet, 'KnowledgeCollectionSubmittedToParanet')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          miner1CollectionId,
        );

      // Verify miner1's KC was added
      const miner1CollectionBytes = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256'],
          [await KnowledgeCollectionStorage.getAddress(), miner1CollectionId],
        ),
      );

      expect(
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          paranetId,
          miner1CollectionBytes,
        ),
      ).to.be.equal(true);

      // Miner2 (unregistered) attempts to submit KC - should fail
      await expect(
        Paranet.connect(miner2).submitKnowledgeCollection(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          await KnowledgeCollectionStorage.getAddress(),
          miner2CollectionId,
        ),
      ).to.be.revertedWith('Miner is not registered');

      // Verify miner2's KC was not added

      const miner2CollectionBytes = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256'],
          [await KnowledgeCollectionStorage.getAddress(), miner2CollectionId],
        ),
      );
      expect(
        await ParanetsRegistry.isKnowledgeCollectionRegistered(
          paranetId,
          miner2CollectionBytes,
        ),
      ).to.be.equal(false);

      // Verify total KC count is 1 (only miner1's KC)
      expect(
        await ParanetsRegistry.getKnowledgeCollectionsCount(paranetId),
      ).to.equal(1);
    });
  });

  describe('Paranet Permissioned Nodes', () => {
    it('Should allow owner to add and remove curated nodes', async () => {
      // Setup paranet with permissioned nodes policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const node1 = accounts[10];
      const node2 = accounts[11];

      // Create profiles for test nodes
      await Profile.connect(node1).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Node1',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      await Profile.connect(node2).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Node2',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      const node1IdentityId = await IdentityStorage.getIdentityId(
        node1.address,
      );
      const node2IdentityId = await IdentityStorage.getIdentityId(
        node2.address,
      );

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        1, // NODES_ACCESS_POLICY_PERMISSIONED
        ACCESS_POLICIES.OPEN,
        ACCESS_POLICIES.OPEN,
      );

      // Verify initial state
      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        0,
      );
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node1IdentityId),
      ).to.be.equal(false);
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node2IdentityId),
      ).to.be.equal(false);

      // Add nodes
      await expect(
        Paranet.connect(kcCreator).addParanetCuratedNodes(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [node1IdentityId, node2IdentityId],
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedNodeAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          node1IdentityId,
        )
        .to.emit(Paranet, 'ParanetCuratedNodeAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          node2IdentityId,
        );

      // Verify nodes were added
      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        2,
      );
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node1IdentityId),
      ).to.be.equal(true);
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node2IdentityId),
      ).to.be.equal(true);

      const curatedNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
      expect(curatedNodes[0].identityId).to.equal(node1IdentityId);
      expect(curatedNodes[1].identityId).to.equal(node2IdentityId);

      // Remove node1
      await expect(
        Paranet.connect(kcCreator).removeParanetCuratedNodes(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [node1IdentityId],
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedNodeRemoved')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          node1IdentityId,
        );

      // Verify node1 was removed but node2 remains
      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        1,
      );
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node1IdentityId),
      ).to.be.equal(false);
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node2IdentityId),
      ).to.be.equal(true);

      const remainingNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
      expect(remainingNodes).to.have.lengthOf(1);
      expect(remainingNodes[0].identityId).to.equal(node2IdentityId);
    });

    it('Should handle node join requests correctly', async () => {
      // Setup paranet with permissioned nodes policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const applicantNode = accounts[10];

      // Create profile for applicant node
      await Profile.connect(applicantNode).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Applicant',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      const applicantIdentityId = await IdentityStorage.getIdentityId(
        applicantNode.address,
      );

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        1, // NODES_ACCESS_POLICY_PERMISSIONED
        ACCESS_POLICIES.OPEN,
        ACCESS_POLICIES.OPEN,
      );

      // Request to join
      await expect(
        Paranet.connect(applicantNode).requestParanetCuratedNodeAccess(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestCreated')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        );

      // Verify initial request state
      const latestRequest = await ParanetsRegistry.getLatestNodeJoinRequest(
        paranetId,
        applicantIdentityId,
      );
      expect(latestRequest.identityId).to.equal(applicantIdentityId);
      expect(latestRequest.status).to.equal(1); // PENDING status
      expect(latestRequest.createdAt).to.be.gt(0);
      expect(latestRequest.updatedAt).to.equal(latestRequest.createdAt);

      // Approve request
      await expect(
        Paranet.connect(kcCreator).approveCuratedNode(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestAccepted')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        )
        .to.emit(Paranet, 'ParanetCuratedNodeAdded')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        );

      // Verify request state after approval
      const updatedRequest = await ParanetsRegistry.getLatestNodeJoinRequest(
        paranetId,
        applicantIdentityId,
      );
      expect(updatedRequest.identityId).to.equal(applicantIdentityId);
      expect(updatedRequest.status).to.equal(2); // ACCEPTED status
      expect(updatedRequest.createdAt).to.equal(latestRequest.createdAt);
      expect(updatedRequest.updatedAt).to.be.gt(latestRequest.updatedAt);

      // Verify node is now registered
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, applicantIdentityId),
      ).to.be.equal(true);
    });

    it('Should handle node join request rejection correctly', async () => {
      // Setup paranet with permissioned nodes policy
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const applicantNode = accounts[10];

      // Create profile for applicant node
      await Profile.connect(applicantNode).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Applicant',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      const applicantIdentityId = await IdentityStorage.getIdentityId(
        applicantNode.address,
      );

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        1, // NODES_ACCESS_POLICY_PERMISSIONED
        ACCESS_POLICIES.OPEN,
        ACCESS_POLICIES.OPEN,
      );

      // Request to join
      await expect(
        Paranet.connect(applicantNode).requestParanetCuratedNodeAccess(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestCreated')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        );

      // Verify initial request state
      const latestRequest = await ParanetsRegistry.getLatestNodeJoinRequest(
        paranetId,
        applicantIdentityId,
      );
      expect(latestRequest.identityId).to.equal(applicantIdentityId);
      expect(latestRequest.status).to.equal(1); // PENDING status

      // Reject request
      await expect(
        Paranet.connect(kcCreator).rejectCuratedNode(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        ),
      )
        .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestRejected')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          applicantIdentityId,
        );

      // Verify request state after rejection
      const updatedRequest = await ParanetsRegistry.getLatestNodeJoinRequest(
        paranetId,
        applicantIdentityId,
      );
      expect(updatedRequest.identityId).to.equal(applicantIdentityId);
      expect(updatedRequest.status).to.equal(3); // REJECTED status
      expect(updatedRequest.createdAt).to.equal(latestRequest.createdAt);
      expect(updatedRequest.updatedAt).to.be.gt(latestRequest.updatedAt);

      // Verify node is not registered
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, applicantIdentityId),
      ).to.be.equal(false);
    });

    it('Should handle edge cases when adding and removing multiple nodes', async () => {
      const kcCreator = getDefaultKCCreator(accounts);
      const publishingNode = getDefaultPublishingNode(accounts);
      const receivingNodes = getDefaultReceivingNodes(accounts);
      const node1 = accounts[10];
      const node2 = accounts[11];
      const node3 = accounts[12];

      // Create profiles for test nodes
      await Profile.connect(node1).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Node1',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      await Profile.connect(node2).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Node2',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      await Profile.connect(node3).createProfile(
        accounts[0].address,
        [], // operational wallets
        'Node3',
        '0x' + randomBytes(32).toString('hex'),
        0,
      );
      const node1IdentityId = await IdentityStorage.getIdentityId(
        node1.address,
      );
      const node2IdentityId = await IdentityStorage.getIdentityId(
        node2.address,
      );
      const node3IdentityId = await IdentityStorage.getIdentityId(
        node3.address,
      );

      const {
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetId,
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
        1, // NODES_ACCESS_POLICY_PERMISSIONED
        ACCESS_POLICIES.OPEN,
        ACCESS_POLICIES.OPEN,
      );

      // Add nodes in sequence
      await Paranet.connect(kcCreator).addParanetCuratedNodes(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        [node1IdentityId],
      );

      await Paranet.connect(kcCreator).addParanetCuratedNodes(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        [node2IdentityId, node3IdentityId],
      );

      // Verify all nodes were added
      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        3,
      );
      const allNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
      expect(allNodes.map((node) => node.identityId)).to.have.members([
        node1IdentityId,
        node2IdentityId,
        node3IdentityId,
      ]);

      // Remove nodes from edges (first and last)
      await Paranet.connect(kcCreator).removeParanetCuratedNodes(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        [node1IdentityId, node3IdentityId],
      );

      // Verify middle node remains
      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        1,
      );
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node1IdentityId),
      ).to.be.equal(false);
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node2IdentityId),
      ).to.be.equal(true);
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node3IdentityId),
      ).to.be.equal(false);

      // Try to remove non-existent node - should revert
      await expect(
        Paranet.connect(kcCreator).removeParanetCuratedNodes(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [node1IdentityId], // Already removed
        ),
      ).to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeDoesntExist');

      // Verify state remains unchanged
      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        1,
      );
      expect(
        await ParanetsRegistry.isCuratedNode(paranetId, node2IdentityId),
      ).to.be.equal(true);

      // Try to add duplicate node
      await expect(
        Paranet.connect(kcCreator).addParanetCuratedNodes(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          [node2IdentityId],
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'ParanetCuratedNodeHasAlreadyBeenAdded',
      );

      expect(await ParanetsRegistry.getCuratedNodesCount(paranetId)).to.equal(
        1,
      );
      const finalNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
      expect(finalNodes).to.have.lengthOf(1);
      expect(finalNodes[0].identityId).to.equal(node2IdentityId);
    });
  });
});
