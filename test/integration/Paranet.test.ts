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
  ParanetNeuroIncentivesPool,
} from '../../typechain';
import {
  createKnowledgeCollection,
  getKCSignaturesData,
} from '../helpers/kc-helpers';
import { createProfile, createProfiles } from '../helpers/profile-helpers';

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

  async function createAndRegisterParanet() {
    // Create profiles for admin, publisher and validators
    const publishingNode = {
      admin: accounts[1],
      operational: accounts[2],
    };
    const receivingNodes = [
      {
        admin: accounts[3],
        operational: accounts[4],
      },
      {
        admin: accounts[5],
        operational: accounts[6],
      },
      {
        admin: accounts[7],
        operational: accounts[8],
      },
    ];

    const kcCreator = accounts[9]; // knowledge collection creator and paranet owner

    const { identityId: publishingNodeIdentityId } = await createProfile(
      Profile,
      publishingNode,
    );
    const receivingNodesIdentityIds = (
      await createProfiles(Profile, receivingNodes)
    ).map((p) => p.identityId);

    // Create knowledge collection
    const signaturesData = await getKCSignaturesData(
      publishingNode,
      publishingNodeIdentityId,
      receivingNodes,
    );
    const { collectionId } = await createKnowledgeCollection(
      KnowledgeCollection,
      Token,
      kcCreator,
      publishingNodeIdentityId,
      receivingNodesIdentityIds,
      signaturesData,
    );

    // Register paranet
    const paranetKCStorageContract =
      await KnowledgeCollectionStorage.getAddress();
    const paranetKATokenId = 1;
    const paranetName = 'Test Paranet';
    const paranetDescription = 'Test Paranet Description';
    const nodesAccessPolicy = 0; // OPEN
    const minersAccessPolicy = 0; // OPEN

    await Paranet.connect(kcCreator).registerParanet(
      paranetKCStorageContract,
      collectionId,
      paranetKATokenId,
      paranetName,
      paranetDescription,
      nodesAccessPolicy,
      minersAccessPolicy,
    );

    return {
      publishingNode,
      receivingNodes,
      publishingNodeIdentityId,
      receivingNodesIdentityIds,
      paranetOwner: kcCreator,
      paranetKCStorageContract,
      paranetKCTokenId: collectionId,
      paranetKATokenId,
      paranetName,
      paranetDescription,
      nodesAccessPolicy,
      minersAccessPolicy,
      paranetId: ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256', 'uint256'],
          [paranetKCStorageContract, collectionId, paranetKATokenId],
        ),
      ),
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
      } = await createAndRegisterParanet();

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
      const {
        paranetId,
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        paranetOwner,
      } = await createAndRegisterParanet();

      const tracToNeuroEmissionMultiplier = ethers.parseUnits('1', 12); // 1 NEURO per 1 TRAC
      const operatorRewardPercentage = 1000; // 10%
      const votersRewardPercentage = 2000; // 20%

      const tx = await ParanetIncentivesPoolFactory.connect(
        paranetOwner,
      ).deployNeuroIncentivesPool(
        true, // isNativeReward
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        tracToNeuroEmissionMultiplier,
        operatorRewardPercentage,
        votersRewardPercentage,
      );

      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (log) =>
          log.topics[0] ===
          ParanetIncentivesPoolFactory.interface.getEvent(
            'ParanetIncetivesPoolDeployed',
          ).topicHash,
      ) as EventLog;

      expect(event?.args[0]).to.equal(paranetKCStorageContract);
      expect(event?.args[1]).to.equal(paranetKCTokenId);
      expect(event?.args[2][0]).to.equal('Neuroweb');

      const poolAddress = await ParanetsRegistry.getIncentivesPoolAddress(
        paranetId,
        'Neuroweb',
      );
      expect(poolAddress).to.equal(event?.args[2][1]);

      const pool = (await hre.ethers.getContractAt(
        'ParanetNeuroIncentivesPool',
        poolAddress,
      )) as ParanetNeuroIncentivesPool;
      expect(await pool.parentParanetId()).to.equal(paranetId);
    });
  });
});
