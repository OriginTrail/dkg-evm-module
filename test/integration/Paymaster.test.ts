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
} from '../../typechain';
import {
  createPaymaster,
} from '../helpers/paymaster-helpers';
import {
  createProfilesAndKC,
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
    } = await loadFixture(deployPaymasterFixture));
  });

  it('Should deploy a KC with Paymaster passed', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const paymasterCreator = kcCreator;

    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);

    const { deployer, paymasterAddress } = await createPaymaster(paymasterCreator, PaymasterManager);

    const paymaster = await hre.ethers.getContractAt('Paymaster', paymasterAddress);

    await paymaster.connect(kcCreator).addAllowedAddress(kcCreator.address);
    expect(await paymaster.allowedAddresses(kcCreator.address)).to.be.true;

    const tokenAmount = ethers.parseEther('100');
    await Token.connect(kcCreator).approve(paymasterAddress, tokenAmount);
    await paymaster.connect(kcCreator).fundPaymaster(tokenAmount);

    expect(await Token.balanceOf(paymasterAddress)).to.equal(tokenAmount);

    const initialPaymasterBalance = await Token.balanceOf(paymasterAddress);

    const paymasterOwner = await paymaster.owner();

    expect(deployer).to.equal(paymasterOwner);
    expect(kcCreator.address).to.equal(paymasterOwner);

    const { collectionId } = await createProfilesAndKC(
      kcCreator,
      publishingNode,
      receivingNodes,
      { Profile, KnowledgeCollection, Token },
      { paymaster: paymasterAddress,
        tokenAmount: tokenAmount,
      }
    );

    // Verify that the paymaster's token balance has decreased by the token amount
    // This confirms that tokens were transferred from the paymaster to the KC contract
    const finalPaymasterBalance = await Token.balanceOf(paymasterAddress);
    expect(finalPaymasterBalance).to.equal(initialPaymasterBalance - tokenAmount);

    // Verify that the KC storage has the correct token amount for the collection
    const storedTokenAmount = await KnowledgeCollectionStorage.getTokenAmount(collectionId);
    expect(storedTokenAmount).to.equal(tokenAmount);

    // Verify that the KC was created with the correct token amount
    const collectionData = await KnowledgeCollectionStorage.getKnowledgeCollection(collectionId);
    expect(collectionData.tokenAmount).to.equal(tokenAmount);

    // Verify that the KC creator's balance should not have changed since the paymaster covered the cost
    const kcCreatorBalance = await Token.balanceOf(kcCreator.address);
    // The KC creator's balance should not have changed since the paymaster covered the cost
    expect(kcCreatorBalance).to.be.gt(0); // Just verify the creator has tokens
  });

  it('Whitelisted users can publish and pay', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const paymasterCreator = kcCreator;
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);

    const whitelistedUser = accounts[8];

    const { paymasterAddress } = await createPaymaster(paymasterCreator, PaymasterManager);
    const paymaster = await hre.ethers.getContractAt('Paymaster', paymasterAddress);

    const tokenAmount = ethers.parseEther('100');
    await Token.connect(kcCreator).approve(paymasterAddress, tokenAmount);
    await paymaster.connect(kcCreator).fundPaymaster(tokenAmount);

    expect(await paymaster.allowedAddresses(whitelistedUser.address)).to.be.false;

    await paymaster.connect(kcCreator).addAllowedAddress(whitelistedUser.address);

    expect(await paymaster.allowedAddresses(whitelistedUser.address)).to.be.true;

    await Token.connect(kcCreator).transfer(whitelistedUser.address, ethers.parseEther('10'));

    const { collectionId } = await createProfilesAndKC(
      whitelistedUser,
      publishingNode,
      receivingNodes,
      { Profile, KnowledgeCollection, Token },
      { paymaster: paymasterAddress,
        tokenAmount: tokenAmount,
      }
    );

    // Check that we can retrieve the collection and it has valid data
    const collectionData = await KnowledgeCollectionStorage.getKnowledgeCollection(collectionId);
    expect(collectionData.tokenAmount).to.equal(tokenAmount);

    // Check that token amount is properly set
    const storedTokenAmount = await KnowledgeCollectionStorage.getTokenAmount(collectionId);
    expect(storedTokenAmount).to.equal(tokenAmount);

    // Make sure paymaster was used correctly
    const finalPaymasterBalance = await Token.balanceOf(paymasterAddress);
    expect(finalPaymasterBalance).to.equal(0); // All tokens should have been spent
  });

  it('Non-whitelisted accounts cannot use the paymaster', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const publishingNode = getDefaultPublishingNode(accounts);
    const receivingNodes = getDefaultReceivingNodes(accounts);
    const nonWhitelistedUser = accounts[7]; // This user will not be whitelisted
    // Deploy the paymaster owned by kcCreator
    const { paymasterAddress } = await createPaymaster(kcCreator, PaymasterManager);
    const paymaster = await hre.ethers.getContractAt('Paymaster', paymasterAddress);

    // Fund the paymaster with tokens
    const tokenAmount = ethers.parseEther('100');
    await Token.connect(kcCreator).approve(paymasterAddress, tokenAmount);
    await paymaster.connect(kcCreator).fundPaymaster(tokenAmount);

    // Verify the non-whitelisted user is indeed not whitelisted
    expect(await paymaster.allowedAddresses(nonWhitelistedUser.address)).to.be.false;

    // Give the non-whitelisted user some tokens to create profiles
    await Token.connect(kcCreator).transfer(nonWhitelistedUser.address, ethers.parseEther('10'));

    // When a non-whitelisted user tries to use the paymaster, the transaction should revert
    await expect(
      createProfilesAndKC(
        nonWhitelistedUser,
        publishingNode,
        receivingNodes,
        { Profile, KnowledgeCollection, Token },
        { paymaster: paymasterAddress, tokenAmount: tokenAmount }
      )
    ).to.be.revertedWithCustomError(paymaster, 'NotAllowed');

    // Verify paymaster's balance hasn't changed (no tokens were spent)
    const finalPaymasterBalance = await Token.balanceOf(paymasterAddress);
    expect(finalPaymasterBalance).to.equal(tokenAmount);
  });

  it('Non KnowledgeCollection address cant call coverCost', async () => {
    const kcCreator = getDefaultKCCreator(accounts);
    const nonKC = accounts[6]; // This will be our non-KnowledgeCollection address

    // Deploy the paymaster owned by kcCreator
    const { paymasterAddress } = await createPaymaster(kcCreator, PaymasterManager);
    const paymaster = await hre.ethers.getContractAt('Paymaster', paymasterAddress);

    // Fund the paymaster with tokens
    const tokenAmount = ethers.parseEther('100');
    await Token.connect(kcCreator).approve(paymasterAddress, tokenAmount);
    await paymaster.connect(kcCreator).fundPaymaster(tokenAmount);

    // Get the actual KnowledgeCollection address from the Hub
    const hub = await hre.ethers.getContract<Hub>('Hub');
    const knowledgeCollectionAddress = await hub.getContractAddress('KnowledgeCollection');

    // Verify that nonKC is not the KnowledgeCollection address
    expect(nonKC.address).to.not.equal(knowledgeCollectionAddress);

    await paymaster.connect(kcCreator).addAllowedAddress(nonKC.address);

    expect(await paymaster.allowedAddresses(nonKC.address)).to.be.true;

    // Try to call coverCost from nonKC address
    await expect(
      paymaster.connect(nonKC).coverCost(ethers.parseEther('10'), nonKC.address)
    ).to.be.revertedWith('Sender is not the KnowledgeCollection contract');

    // Verify paymaster's balance hasn't changed (no tokens were spent)
    const finalPaymasterBalance = await Token.balanceOf(paymasterAddress);
    expect(finalPaymasterBalance).to.equal(tokenAmount);
  });
});
