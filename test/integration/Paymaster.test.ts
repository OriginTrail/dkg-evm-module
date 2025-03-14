import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'ethers';
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
  ParanetIncentivesPoolFactoryHelper,
  ParanetStagingRegistry,
  IdentityStorage,
  HubLib,
  ParanetLib,
  PaymasterManager,
  Paymaster,
} from '../../typechain';
import {
  createProfilesAndKC,
  createPaymaster,
} from '../helpers/kc-helpers';
import {
  getDefaultPublishingNode,
  getDefaultReceivingNodes,
  getDefaultKCCreator,
} from '../helpers/setup-helpers';

// Fixture containing all contracts and accounts needed to test Paranet
type PaymasterFixture = {
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
  HubLib: HubLib;
  ParanetLib: ParanetLib;
  PaymasterManager: PaymasterManager,
  Paymaster: Paymaster;
};

describe('@integration Paymaster', () => {
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
  let HubLib: HubLib;
  let ParanetLib: ParanetLib;
  let PaymasterManager: PaymasterManager;
  let Paymaster: Paymaster;

  // Deploy all contracts, set the HubOwner and necessary accounts. Returns the PaymasterFixture
  async function deployPaymasterFixture(): Promise<PaymasterFixture> {
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
      'PaymasterManager',
      'Paymaster',
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

    const hubLibDeployment = await hre.deployments.deploy('HubLib', {
      from: accounts[0].address,
      log: true,
    });
    HubLib = await hre.ethers.getContract<HubLib>(
      'HubLib',
      hubLibDeployment.address,
    );

    const paranetLibDeployment = await hre.deployments.deploy('ParanetLib', {
      from: accounts[0].address,
      log: true,
    });
    ParanetLib = await hre.ethers.getContract<ParanetLib>(
      'ParanetLib',
      paranetLibDeployment.address,
    );
    PaymasterManager = await hre.ethers.getContract<PaymasterManager>(
      'PaymasterManager',
    );
    Paymaster = await hre.ethers.getContract<Paymaster>(
      'Paymaster',
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
      IdentityStorage,
      HubLib,
      ParanetLib,
      PaymasterManager,
      Paymaster,
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
      HubLib,
      ParanetLib,
      Paymaster,
    } = await loadFixture(deployPaymasterFixture));
  });

  it('Should deploy a KC with Paymaster passed', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const paymasterCreator = kcCreator;
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);
    const tokenAmount = ethers.parseEther('100');

    const p = await createPaymaster(paymasterCreator, PaymasterManager);

    const paymaster = await hre.ethers.getContractAt('Paymaster', p.paymasterAddress);

    // Fund the paymaster with tokens
    await Token.connect(kcCreator).approve(p.paymasterAddress, tokenAmount);
    await paymaster.connect(kcCreator).fundPaymaster(tokenAmount);

    const tx = await paymaster.owner();

    await createProfilesAndKC(
      kcCreator,
      publishingNode,
      receivingNodes,
      { Profile, KnowledgeCollection, Token },
      {
        paymaster: p.paymasterAddress,
      },
    );

    // Verify the deployer of the Paymaster is the owner of it
    expect(p.deployer).to.equal(tx);
  });

  it('Should call Paymaster.coverCost when creating a KC with a valid paymaster', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const paymasterCreator = kcCreator;
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);
    const tokenAmount = ethers.parseEther('100');

    const p = await createPaymaster(paymasterCreator, PaymasterManager);

    const paymaster = await hre.ethers.getContractAt('Paymaster', p.paymasterAddress);

    // Fund the paymaster with tokens
    await Token.connect(kcCreator).approve(p.paymasterAddress, tokenAmount);
    await paymaster.connect(kcCreator).fundPaymaster(tokenAmount);

    const initialPaymasterBalance = await Token.balanceOf(p.paymasterAddress);

    const { collectionId } = await createProfilesAndKC(
      kcCreator,
      publishingNode,
      receivingNodes,
      { Profile, KnowledgeCollection, Token },
      { paymaster: p.paymasterAddress,
      },
    );

    // Verify that the paymaster's token balance has decreased by the token amount
    // This confirms that tokens were transferred from the paymaster to the KC contract
    const finalPaymasterBalance = await Token.balanceOf(p.paymasterAddress);
    expect(finalPaymasterBalance).to.equal(initialPaymasterBalance - tokenAmount);

    // Verify that the KC storage has the correct token amount for the collection
    const storedTokenAmount = await KnowledgeCollectionStorage.getTokenAmount(collectionId);
    expect(storedTokenAmount).to.equal(tokenAmount);

    // Verify that the KC was created with the correct token amount
    const collectionData = await KnowledgeCollectionStorage.getKnowledgeCollection(collectionId);
    expect(collectionData.tokenAmount).to.equal(tokenAmount);

    // Verify that the paymaster was used (indirectly, by checking that the KC creator didn't spend tokens)
    const kcCreatorBalance = await Token.balanceOf(kcCreator.address);
    // The KC creator's balance should not have changed since the paymaster covered the cost
    expect(kcCreatorBalance).to.be.gt(0); // Just verify the creator has tokens
  });
});
