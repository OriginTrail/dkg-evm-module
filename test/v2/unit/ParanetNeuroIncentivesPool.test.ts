/* eslint-disable @typescript-eslint/no-unused-vars */
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumberish, Event } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  HubController,
  Paranet,
  ContentAssetStorageV2,
  ContentAssetV2,
  ParanetsRegistry,
  ParanetServicesRegistry,
  ParanetKnowledgeMinersRegistry,
  ParanetKnowledgeAssetsRegistry,
  HashingProxy,
  ServiceAgreementStorageProxy,
  Token,
  ServiceAgreementV1,
  ParanetIncentivesPoolFactory,
  Hub,
} from '../../../typechain';
import { IERC721 } from '../../../typechain/@openzeppelin/contracts/token/ERC721/IERC721';

type deployParanetFixture = {
  accounts: SignerWithAddress[];
  Paranet: Paranet;
  HubController: HubController;
  ContentAssetV2: ContentAssetV2;
  ContentAssetStorageV2: ContentAssetStorageV2;
  ParanetsRegistry: ParanetsRegistry;
  ParanetServicesRegistry: ParanetServicesRegistry;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;
  ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  HashingProxy: HashingProxy;
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  Token: Token;
  NeuroERC20: Token;
  ServiceAgreementV1: ServiceAgreementV1;
};

type IncentivizationPoolParameters = {
  paranetKAStorageContract: string;
  paranetKATokenId: BigNumberish;
  tracToNeuroEmissionMultiplier: BigNumberish;
  paranetOperatorRewardPercentage: BigNumberish;
  paranetIncentivizationProposalVotersRewardPercentage: BigNumberish;
};

describe('@v2 @unit ParanetNeuroIncentivesPool contract', function () {
  let accounts: SignerWithAddress[];
  let Paranet: Paranet;
  let HubController: HubController;
  let ContentAssetV2: ContentAssetV2;
  let ContentAssetStorageV2: ContentAssetStorageV2;
  let ParanetsRegistry: ParanetsRegistry;
  let ParanetServicesRegistry: ParanetServicesRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;
  let ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  let HashingProxy: HashingProxy;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let Token: Token;
  let NeuroERC20: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let Hub: Hub;

  const EMISSION_MULTIPLIER_SCALING_FACTOR = hre.ethers.constants.WeiPerEther; // 1e18
  const PERCENTAGE_SCALING_FACTOR = 10_000; // as per the contract
  const MAX_CUMULATIVE_VOTERS_WEIGHT = 10_000;

  async function deployParanetFixture(): Promise<deployParanetFixture> {
    await hre.deployments.fixture(
      [
        'HubV2',
        'HubController',
        'Paranet',
        'ContentAssetStorageV2',
        'ContentAssetV2',
        'ParanetsRegistry',
        'ParanetServicesRegistry',
        'ParanetKnowledgeMinersRegistry',
        'ParanetKnowledgeAssetsRegistry',
        'ParanetIncentivesPoolFactory',
        'HashingProxy',
        'ServiceAgreementStorageProxy',
        'Token',
        'Neuro',
        'ServiceAgreementV1',
      ],
      { keepExistingDeployments: false },
    );

    Hub = await hre.ethers.getContract<Hub>('Hub');
    HubController = await hre.ethers.getContract<HubController>('HubController');
    Paranet = await hre.ethers.getContract<Paranet>('Paranet');
    ContentAssetV2 = await hre.ethers.getContract<ContentAssetV2>('ContentAsset');
    ContentAssetStorageV2 = await hre.ethers.getContract<ContentAssetStorageV2>('ContentAssetStorage');
    ParanetsRegistry = await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    ParanetServicesRegistry = await hre.ethers.getContract<ParanetServicesRegistry>('ParanetServicesRegistry');
    ParanetKnowledgeMinersRegistry = await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
      'ParanetKnowledgeMinersRegistry',
    );
    ParanetKnowledgeAssetsRegistry = await hre.ethers.getContract<ParanetKnowledgeAssetsRegistry>(
      'ParanetKnowledgeAssetsRegistry',
    );
    ParanetIncentivesPoolFactory = await hre.ethers.getContract<ParanetIncentivesPoolFactory>(
      'ParanetIncentivesPoolFactory',
    );
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    HashingProxy = await hre.ethers.getContract<HashingProxy>('HashingProxy');
    Token = await hre.ethers.getContract<Token>('Token');
    const neuroERC20Address = await Hub.getContractAddress('NeurowebERC20');
    NeuroERC20 = await hre.ethers.getContractAt<Token>('Token', neuroERC20Address);
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');

    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return {
      accounts,
      Paranet,
      HubController,
      ContentAssetV2,
      ContentAssetStorageV2,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeAssetsRegistry,
      ParanetIncentivesPoolFactory,
      HashingProxy,
      ServiceAgreementStorageProxy,
      Token,
      NeuroERC20,
      ServiceAgreementV1,
    };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({
      accounts,
      Paranet,
      HubController,
      ContentAssetV2,
      ContentAssetStorageV2,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeAssetsRegistry,
      ParanetIncentivesPoolFactory,
      HashingProxy,
      ServiceAgreementStorageProxy,
      Token,
      NeuroERC20,
      ServiceAgreementV1,
    } = await loadFixture(deployParanetFixture));
  });

  it('The contract is named "ParanetNeuroIncentivesPool"', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);
    expect(await IncentivesPool.name()).to.equal('ParanetNeuroIncentivesPool');
  });

  it('The contract is version "2.2.0"', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);
    expect(await IncentivesPool.version()).to.equal('2.2.0');
  });

  it('Should accept ERC20 Neuro and update the balance', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const neuroAmount = hre.ethers.utils.parseEther('100000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    expect(await IncentivesPool.getNeuroBalance()).to.be.equal(neuroAmount);
  });

  it('Should become a Knowledge miner when creating an asset on paranet', async () => {
    // register paranet
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    // create a Knowledge Asset
    const knowledgeMiner = accounts[2];
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 1, '10');

    expect(await ParanetsRegistry.isKnowledgeMinerRegistered(paranetId, knowledgeMiner.address)).to.be.true;
  });

  it('Check paranet operator after transfer', async () => {
    // register paranet
    const number = 1;
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, number);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // create ERC721 contract instance
    const owner = accounts[100 + number];
    const erc721 = (await hre.ethers.getContractAt('IERC721', paranetKAStorageContract, owner)) as IERC721;

    // transfer to new operator
    const newOwner = accounts[200 + number];
    const tx = await erc721.transferFrom(owner.address, newOwner.address, paranetKATokenId);
    await tx.wait();

    // check transfer
    const currentOwner = await erc721.ownerOf(paranetKATokenId);
    expect(currentOwner).to.be.equal(newOwner.address);

    // check if paranet operator
    const isParanetOperator = await IncentivesPool.isParanetOperator(newOwner.address);
    expect(isParanetOperator).to.be.true;
  });

  it('votersRegistrar can add voters, voters data can be returned and added voters are proposal voters', async function () {
    const number = 1;
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, number);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // Add voters (voter1 and voter2) to the contract
    const votersRegistrar = accounts[0];
    const voter1 = accounts[1];
    const voter2 = accounts[2];
    await IncentivesPool.connect(votersRegistrar).addVoters([
      { addr: voter1.address, weight: 500 },
      { addr: voter2.address, weight: 1000 },
    ]);

    // Retrieve the voters data
    const firstVoterData = await IncentivesPool.getVoter(voter1.address);
    const secondVoterData = await IncentivesPool.getVoter(voter2.address);

    // Check voter1 data
    expect(firstVoterData.addr).to.equal(voter1.address);
    expect(firstVoterData.weight).to.equal(500);
    expect(firstVoterData.claimedNeuro).to.equal(0);
    expect(await IncentivesPool.isProposalVoter(voter1.address)).to.be.true;

    // Check voter2 data
    expect(secondVoterData.addr).to.equal(voter2.address);
    expect(secondVoterData.weight).to.equal(1000);
    expect(secondVoterData.claimedNeuro).to.equal(0);
    expect(await IncentivesPool.isProposalVoter(voter2.address)).to.be.true;
  });

  it('Get a total Incentives Pool NEURO balance', async function () {
    // create a paranet
    const number = 1;
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, number);

    // create an incentive pool
    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // transfer tokens to the incentives pool
    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    expect(await IncentivesPool.getNeuroBalance()).to.be.equal(neuroAmount);
  });

  it('Get the total received Incentive Pool NEURO', async function () {
    // create a paranet
    const number = 1;
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, number);

    // create an incentive pool
    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // transfer tokens to the incentives pool
    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    // Simulate a knowledge miner minting a knowledge asset and claiming the reward
    const knowledgeMiner = accounts[1];
    const tokenAmount = '10';
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 2, tokenAmount);
    await IncentivesPool.connect(knowledgeMiner).claimKnowledgeMinerReward();

    // Claim operator reward
    const operator = accounts[100 + number];
    await IncentivesPool.connect(operator).claimParanetOperatorReward();

    // Add a voter and claim the reward
    const votersRegistrar = accounts[0];
    const voter = accounts[2];
    await IncentivesPool.connect(votersRegistrar).addVoters([{ addr: voter.address, weight: 10000 }]);
    await IncentivesPool.connect(voter).claimIncentivizationProposalVoterReward();

    expect(await IncentivesPool.totalNeuroReceived()).to.be.equal(neuroAmount);
  });

  it('Get the right NEURO Emission Multiplier based on a particular timestamp', async function () {
    // create a paranet
    const number = 1;
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, number);

    // create an incentive pool
    const initialMultiplier = hre.ethers.utils.parseEther('1');
    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: initialMultiplier,
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // initiate the multiplier update and fetch the emitted timestamp
    const newMultiplier = hre.ethers.utils.parseEther('2');
    const votersRegistrar = accounts[0];
    const tx = await IncentivesPool.connect(votersRegistrar).initiateNeuroEmissionMultiplierUpdate(newMultiplier);
    const receipt = await tx.wait();
    const event = receipt.events?.find((e: Event) => e.event === 'NeuroEmissionMultiplierUpdateInitiated');
    const emittedTimestamp = event?.args?.timestamp;

    // jump 7 days in time
    const seconds = 7 * 86400;
    await time.increase(seconds);

    // finalize the update
    await IncentivesPool.connect(votersRegistrar).finalizeNeuroEmissionMultiplierUpdate();

    const initialNeuroEmissionMultiplier = await IncentivesPool.getEffectiveNeuroEmissionMultiplier(
      emittedTimestamp - seconds,
    );
    const newNeuroEmissionMultiplier = await IncentivesPool.getEffectiveNeuroEmissionMultiplier(emittedTimestamp);

    expect(initialNeuroEmissionMultiplier).to.be.equal(initialMultiplier);
    expect(newNeuroEmissionMultiplier).to.be.equal(newMultiplier);
  });

  it('Knowledge miner can claim the correct NEURO reward', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('0.5'), // 0.5 NEURO per 1 TRAC
      paranetOperatorRewardPercentage: 1_000, // 10%
      paranetIncentivizationProposalVotersRewardPercentage: 1_000, // 10%
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    const knowledgeMiner = accounts[2];

    // Simulate the knowledge miner minting a knowledge asset (spending TRAC)
    const tokenAmount = '10';
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 2, tokenAmount);

    // Get unrewardedTracSpent
    const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      knowledgeMiner.address,
      paranetId,
    );

    // Act
    const claimableReward = await IncentivesPool.connect(knowledgeMiner).getClaimableKnowledgeMinerRewardAmount();

    // Assert
    const minersRewardPercentage =
      PERCENTAGE_SCALING_FACTOR -
      incentivesPoolParams.paranetOperatorRewardPercentage -
      incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage;

    const expectedReward = unrewardedTracSpent
      .mul(incentivesPoolParams.tracToNeuroEmissionMultiplier)
      .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
      .mul(minersRewardPercentage)
      .div(PERCENTAGE_SCALING_FACTOR);

    expect(claimableReward).to.equal(expectedReward);

    const initialNeuroBalance = await NeuroERC20.balanceOf(knowledgeMiner.address);

    // Claim the reward
    await IncentivesPool.connect(knowledgeMiner).claimKnowledgeMinerReward();

    // Check balances
    const finalNeuroBalance = await NeuroERC20.balanceOf(knowledgeMiner.address);
    expect(finalNeuroBalance.sub(initialNeuroBalance)).to.equal(expectedReward);

    const claimedNeuro = await IncentivesPool.minerClaimedNeuro(knowledgeMiner.address);
    expect(claimedNeuro).to.equal(expectedReward);

    const totalMinersClaimedNeuro = await IncentivesPool.totalMinersClaimedNeuro();
    expect(totalMinersClaimedNeuro).to.equal(expectedReward);

    const newUnrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      knowledgeMiner.address,
      paranetId,
    );
    expect(newUnrewardedTracSpent).to.equal(0);
  });

  it('Knowledge miner cannot claim more NEURO than their share', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'), // 1 NEURO per 1 TRAC
      paranetOperatorRewardPercentage: 2_000, // 20%
      paranetIncentivizationProposalVotersRewardPercentage: 2_000, // 20%
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const neuroAmount = hre.ethers.utils.parseEther('50'); // Less NEURO in the pool
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    const knowledgeMiner = accounts[2];

    // Simulate the knowledge miner minting a knowledge asset (spending TRAC)
    const tokenAmount = '100'; // 100 TRAC
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 2, tokenAmount);

    // Act
    const claimableReward = await IncentivesPool.connect(knowledgeMiner).getClaimableKnowledgeMinerRewardAmount();

    // Assert
    const minersRewardPercentage =
      PERCENTAGE_SCALING_FACTOR -
      incentivesPoolParams.paranetOperatorRewardPercentage -
      incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage;

    // Expected reward based on NEURO balance and miners' percentage
    const minersRewardLimit = neuroAmount.mul(minersRewardPercentage).div(PERCENTAGE_SCALING_FACTOR);
    expect(claimableReward).to.equal(minersRewardLimit);

    const initialNeuroBalance = await NeuroERC20.balanceOf(knowledgeMiner.address);

    // Claim the reward
    await IncentivesPool.connect(knowledgeMiner).claimKnowledgeMinerReward();

    // Check balances
    const finalNeuroBalance = await NeuroERC20.balanceOf(knowledgeMiner.address);
    expect(finalNeuroBalance.sub(initialNeuroBalance)).to.equal(minersRewardLimit);

    const claimedNeuro = await IncentivesPool.minerClaimedNeuro(knowledgeMiner.address);
    expect(claimedNeuro).to.equal(minersRewardLimit);

    const totalMinersClaimedNeuro = await IncentivesPool.totalMinersClaimedNeuro();
    expect(totalMinersClaimedNeuro).to.equal(minersRewardLimit);

    // Unrewarded TRAC should not be zero since they couldn't claim the full amount
    const newUnrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      knowledgeMiner.address,
      paranetId,
    );
    expect(newUnrewardedTracSpent).to.be.gt(0);
  });

  it('Only authorized users can claim rewards', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);
    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const unauthorizedUser = accounts[5];

    await expect(IncentivesPool.connect(unauthorizedUser).claimKnowledgeMinerReward()).to.be.revertedWith(
      'Fn can only be used by K-Miners',
    );

    await expect(IncentivesPool.connect(unauthorizedUser).claimParanetOperatorReward()).to.be.revertedWith(
      'Fn can only be used by operator',
    );

    await expect(IncentivesPool.connect(unauthorizedUser).claimIncentivizationProposalVoterReward()).to.be.revertedWith(
      'Fn can only be used by voter',
    );
  });

  it('Emission multiplier update process works correctly', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);
    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // Initiate an emission multiplier update
    const newMultiplier = hre.ethers.utils.parseEther('2'); // New multiplier
    await IncentivesPool.connect(accounts[0]).initiateNeuroEmissionMultiplierUpdate(newMultiplier);

    // Check that the update is scheduled
    const neuroEmissionMultipliers = await IncentivesPool.getNeuroEmissionMultipliers();
    expect(neuroEmissionMultipliers.length).to.equal(2);
    expect(neuroEmissionMultipliers[1].multiplier).to.equal(newMultiplier);
    expect(neuroEmissionMultipliers[1].finalized).to.equal(false);

    // Try to finalize before delay period
    await expect(IncentivesPool.connect(accounts[0]).finalizeNeuroEmissionMultiplierUpdate()).to.be.revertedWith(
      'Delay period not yet passed',
    );

    // Increase time to pass the delay
    const delay = await IncentivesPool.neuroEmissionMultiplierUpdateDelay();
    await time.increase(delay.toNumber() + 1);

    // Finalize the update
    await IncentivesPool.connect(accounts[0]).finalizeNeuroEmissionMultiplierUpdate();

    // Check that the multiplier is updated
    const updatedMultipliers = await IncentivesPool.getNeuroEmissionMultipliers();
    expect(updatedMultipliers[1].finalized).to.equal(true);
  });

  it('Cannot add voters exceeding MAX_CUMULATIVE_VOTERS_WEIGHT', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);
    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    // Try to add voters exceeding the maximum cumulative weight
    const voters = [];
    for (let i = 0; i < 11; i++) {
      voters.push({ addr: accounts[i].address, weight: 1_000 });
    }

    await expect(IncentivesPool.connect(accounts[0]).addVoters(voters)).to.be.revertedWith(
      'Cumulative weight is too big',
    );
  });

  it('Emission multiplier change impacts rewards correctly', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 10);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'), // Initial multiplier
      paranetOperatorRewardPercentage: 1_000, // 10%
      paranetIncentivizationProposalVotersRewardPercentage: 1_000, // 10%
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 10);

    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    const knowledgeMiner = accounts[20];

    // Knowledge miner mints a knowledge asset before emission multiplier change
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 20, '50');

    // Initiate and finalize emission multiplier update
    const newMultiplier = hre.ethers.utils.parseEther('2'); // New multiplier
    await IncentivesPool.connect(accounts[0]).initiateNeuroEmissionMultiplierUpdate(newMultiplier);
    const delay = await IncentivesPool.neuroEmissionMultiplierUpdateDelay();
    await time.increase(delay.toNumber() + 1);
    await IncentivesPool.connect(accounts[0]).finalizeNeuroEmissionMultiplierUpdate();

    // Knowledge miner mints another knowledge asset after emission multiplier change
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 21, '50');

    // Act
    const claimableReward = await IncentivesPool.connect(knowledgeMiner).getClaimableKnowledgeMinerRewardAmount();

    // Assert
    const minersRewardPercentage =
      PERCENTAGE_SCALING_FACTOR -
      incentivesPoolParams.paranetOperatorRewardPercentage -
      incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage;

    // Expected reward is the sum of rewards calculated with new multiplier
    const rewardBeforeChange = hre.ethers.utils
      .parseEther('50') // TRAC spent before change
      .mul(newMultiplier) // New multiplier
      .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
      .mul(minersRewardPercentage)
      .div(PERCENTAGE_SCALING_FACTOR);

    const rewardAfterChange = hre.ethers.utils
      .parseEther('50') // TRAC spent after change
      .mul(newMultiplier) // New multiplier
      .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
      .mul(minersRewardPercentage)
      .div(PERCENTAGE_SCALING_FACTOR);

    const expectedReward = rewardBeforeChange.add(rewardAfterChange);
    expect(claimableReward).to.equal(expectedReward);

    const initialNeuroBalance = await NeuroERC20.balanceOf(knowledgeMiner.address);

    // Claim the reward
    await IncentivesPool.connect(knowledgeMiner).claimKnowledgeMinerReward();

    // Check balances
    const finalNeuroBalance = await NeuroERC20.balanceOf(knowledgeMiner.address);
    expect(finalNeuroBalance.sub(initialNeuroBalance)).to.equal(expectedReward);

    const newUnrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      knowledgeMiner.address,
      paranetId,
    );
    expect(newUnrewardedTracSpent).to.equal(0);
  });

  it('Multiple knowledge miners receive correct rewards proportionally', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 11);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 11);

    const neuroAmount = hre.ethers.utils.parseEther('2000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    const knowledgeMiner1 = accounts[21];
    const knowledgeMiner2 = accounts[22];
    const knowledgeMiner3 = accounts[23];

    // Knowledge miners mint knowledge assets with different TRAC amounts
    await createParanetKnowledgeAsset(knowledgeMiner1, paranetKAStorageContract, paranetKATokenId, 30, '100'); // 100 TRAC
    await createParanetKnowledgeAsset(knowledgeMiner2, paranetKAStorageContract, paranetKATokenId, 31, '200'); // 200 TRAC
    await createParanetKnowledgeAsset(knowledgeMiner3, paranetKAStorageContract, paranetKATokenId, 32, '300'); // 300 TRAC

    // Act & Assert for each miner
    for (const miner of [knowledgeMiner1, knowledgeMiner2, knowledgeMiner3]) {
      const claimableReward = await IncentivesPool.connect(miner).getClaimableKnowledgeMinerRewardAmount();

      const minersRewardPercentage =
        PERCENTAGE_SCALING_FACTOR -
        incentivesPoolParams.paranetOperatorRewardPercentage -
        incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage;

      const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(miner.address, paranetId);

      const expectedReward = unrewardedTracSpent
        .mul(incentivesPoolParams.tracToNeuroEmissionMultiplier)
        .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
        .mul(minersRewardPercentage)
        .div(PERCENTAGE_SCALING_FACTOR);

      expect(claimableReward).to.equal(expectedReward);

      const initialNeuroBalance = await NeuroERC20.balanceOf(miner.address);

      // Claim the reward
      await IncentivesPool.connect(miner).claimKnowledgeMinerReward();

      // Check balances
      const finalNeuroBalance = await NeuroERC20.balanceOf(miner.address);
      expect(finalNeuroBalance.sub(initialNeuroBalance)).to.equal(expectedReward);

      const newUnrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
        miner.address,
        paranetId,
      );
      expect(newUnrewardedTracSpent).to.equal(0);
    }
  });

  it('Cannot adjust voters weights after rewards have been claimed', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 12);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 2_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 12);

    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    // Simulate knowledge miners minting knowledge assets
    const knowledgeMiner = accounts[24];
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 40, '100');

    // Add voters with initial weights
    const voter1 = accounts[25];
    const voter2 = accounts[26];
    const voters = [
      { addr: voter1.address, weight: 5_000 }, // 50%
      { addr: voter2.address, weight: 5_000 }, // 50%
    ];
    await IncentivesPool.connect(accounts[0]).addVoters(voters);

    // Voters claim rewards
    await IncentivesPool.connect(voter1).claimIncentivizationProposalVoterReward();
    await IncentivesPool.connect(voter2).claimIncentivizationProposalVoterReward();

    // Attempt to adjust weights after voters have claimed rewards
    await expect(IncentivesPool.connect(accounts[0]).removeVoters(2)).to.be.revertedWith('Cannot modify voters list');

    const adjustedVoters = [
      { addr: voter1.address, weight: 7_000 }, // 70%
      { addr: voter2.address, weight: 3_000 }, // 30%
    ];
    await expect(IncentivesPool.connect(accounts[0]).addVoters(adjustedVoters)).to.be.revertedWith(
      'Cannot modify voters list',
    );

    // Knowledge miner mints more knowledge assets
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 41, '100');

    // Voters claim rewards again
    const initialVoter1Balance = await NeuroERC20.balanceOf(voter1.address);
    const initialVoter2Balance = await NeuroERC20.balanceOf(voter2.address);

    await IncentivesPool.connect(voter1).claimIncentivizationProposalVoterReward();
    await IncentivesPool.connect(voter2).claimIncentivizationProposalVoterReward();

    const finalVoter1Balance = await NeuroERC20.balanceOf(voter1.address);
    const finalVoter2Balance = await NeuroERC20.balanceOf(voter2.address);

    const additionalVoter1Reward = finalVoter1Balance.sub(initialVoter1Balance);
    const additionalVoter2Reward = finalVoter2Balance.sub(initialVoter2Balance);

    // Expected rewards based on initial weights (since weights cannot be adjusted)
    const votersRewardPercentage = incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage;
    const additionalKnowledgeValue = hre.ethers.utils.parseEther('100'); // Additional TRAC spent
    const totalVotersReward = additionalKnowledgeValue
      .mul(incentivesPoolParams.tracToNeuroEmissionMultiplier)
      .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
      .mul(votersRewardPercentage)
      .div(PERCENTAGE_SCALING_FACTOR);

    const expectedVoter1AdditionalReward = totalVotersReward.mul(5_000).div(MAX_CUMULATIVE_VOTERS_WEIGHT);
    const expectedVoter2AdditionalReward = totalVotersReward.mul(5_000).div(MAX_CUMULATIVE_VOTERS_WEIGHT);

    expect(additionalVoter1Reward).to.equal(expectedVoter1AdditionalReward);
    expect(additionalVoter2Reward).to.equal(expectedVoter2AdditionalReward);
  });

  it('Cannot set invalid reward percentages', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 13);

    // Sum of percentages exceeds 100%
    const invalidIncentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 6_000, // 60%
      paranetIncentivizationProposalVotersRewardPercentage: 5_000, // 50%
    };

    await expect(deployERC20NeuroIncentivesPool(accounts, invalidIncentivesPoolParams, 13)).to.be.revertedWith(
      'Invalid rewards ratio',
    );

    // Valid percentages
    const validIncentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 4_000, // 40%
      paranetIncentivizationProposalVotersRewardPercentage: 5_000, // 50%
    };

    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, validIncentivesPoolParams, 13);
    expect(IncentivesPool.address).to.be.properAddress;
  });

  it('Total NEURO received calculation is accurate', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 14);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 2_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 14);

    const neuroAmount1 = hre.ethers.utils.parseEther('500');
    const neuroAmount2 = hre.ethers.utils.parseEther('700');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount1);
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount2);

    const totalNeuroReceived = await IncentivesPool.totalNeuroReceived();
    expect(totalNeuroReceived).to.equal(neuroAmount1.add(neuroAmount2));

    // Knowledge miner claims reward
    const knowledgeMiner = accounts[30];
    await createParanetKnowledgeAsset(knowledgeMiner, paranetKAStorageContract, paranetKATokenId, 50, '100');

    await IncentivesPool.connect(knowledgeMiner).claimKnowledgeMinerReward();

    const totalNeuroReceivedAfterClaim = await IncentivesPool.totalNeuroReceived();
    expect(totalNeuroReceivedAfterClaim).to.equal(neuroAmount1.add(neuroAmount2));
  });

  it('Operator can claim the correct NEURO reward', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'), // 1 NEURO per 1 TRAC
      paranetOperatorRewardPercentage: 2_000, // 20%
      paranetIncentivizationProposalVotersRewardPercentage: 1_000, // 10%
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    // Simulate knowledge miners minting knowledge assets
    const knowledgeMiner1 = accounts[2];
    await createParanetKnowledgeAsset(knowledgeMiner1, paranetKAStorageContract, paranetKATokenId, 2, '100');

    const knowledgeMiner2 = accounts[3];
    await createParanetKnowledgeAsset(knowledgeMiner2, paranetKAStorageContract, paranetKATokenId, 3, '50');

    // Act
    const claimableOperatorReward = await IncentivesPool.connect(
      accounts[100 + 1],
    ).getClaimableParanetOperatorRewardAmount();

    // Assert
    const operatorRewardPercentage = incentivesPoolParams.paranetOperatorRewardPercentage;
    const totalKnowledgeValue = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId);

    const expectedOperatorReward = totalKnowledgeValue
      .mul(incentivesPoolParams.tracToNeuroEmissionMultiplier)
      .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
      .mul(operatorRewardPercentage)
      .div(PERCENTAGE_SCALING_FACTOR);

    expect(claimableOperatorReward).to.equal(expectedOperatorReward);

    const initialNeuroBalance = await NeuroERC20.balanceOf(accounts[100 + 1].address);

    // Claim the reward
    await IncentivesPool.connect(accounts[100 + 1]).claimParanetOperatorReward();

    // Check balances
    const finalNeuroBalance = await NeuroERC20.balanceOf(accounts[100 + 1].address);
    expect(finalNeuroBalance.sub(initialNeuroBalance)).to.equal(expectedOperatorReward);

    const claimedOperatorNeuro = await IncentivesPool.operatorClaimedNeuro(accounts[100 + 1].address);
    expect(claimedOperatorNeuro).to.equal(expectedOperatorReward);

    const totalOperatorsClaimedNeuro = await IncentivesPool.totalOperatorsClaimedNeuro();
    expect(totalOperatorsClaimedNeuro).to.equal(expectedOperatorReward);
  });

  it('Voters can claim rewards proportional to their weights', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'), // 1 NEURO per 1 TRAC
      paranetOperatorRewardPercentage: 1_000, // 10%
      paranetIncentivizationProposalVotersRewardPercentage: 2_000, // 20%
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const neuroAmount = hre.ethers.utils.parseEther('1000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    // Simulate knowledge miners minting knowledge assets
    const knowledgeMiner1 = accounts[2];
    await createParanetKnowledgeAsset(knowledgeMiner1, paranetKAStorageContract, paranetKATokenId, 2, '100');

    const knowledgeMiner2 = accounts[3];
    await createParanetKnowledgeAsset(knowledgeMiner2, paranetKAStorageContract, paranetKATokenId, 3, '50');

    // Add voters
    const voter1 = accounts[4];
    const voter2 = accounts[5];
    const voters = [
      { addr: voter1.address, weight: 6_000 }, // 60%
      { addr: voter2.address, weight: 4_000 }, // 40%
    ];
    await IncentivesPool.connect(accounts[0]).addVoters(voters);

    // Act
    const claimableRewardVoter1 = await IncentivesPool.connect(voter1).getClaimableProposalVoterRewardAmount();
    const claimableRewardVoter2 = await IncentivesPool.connect(voter2).getClaimableProposalVoterRewardAmount();

    // Assert
    const votersRewardPercentage = incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage;
    const totalKnowledgeValue = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId);

    const totalVotersReward = totalKnowledgeValue
      .mul(incentivesPoolParams.tracToNeuroEmissionMultiplier)
      .div(EMISSION_MULTIPLIER_SCALING_FACTOR)
      .mul(votersRewardPercentage)
      .div(PERCENTAGE_SCALING_FACTOR);

    const expectedRewardVoter1 = totalVotersReward.mul(6_000).div(MAX_CUMULATIVE_VOTERS_WEIGHT);
    const expectedRewardVoter2 = totalVotersReward.mul(4_000).div(MAX_CUMULATIVE_VOTERS_WEIGHT);

    expect(claimableRewardVoter1).to.equal(expectedRewardVoter1);
    expect(claimableRewardVoter2).to.equal(expectedRewardVoter2);

    const voter1InitialBalance = await NeuroERC20.balanceOf(voter1.address);
    const voter2InitialBalance = await NeuroERC20.balanceOf(voter2.address);

    // Claim rewards
    await IncentivesPool.connect(voter1).claimIncentivizationProposalVoterReward();
    await IncentivesPool.connect(voter2).claimIncentivizationProposalVoterReward();

    // Check balances
    const voter1FinalBalance = await NeuroERC20.balanceOf(voter1.address);
    const voter2FinalBalance = await NeuroERC20.balanceOf(voter2.address);

    expect(voter1FinalBalance.sub(voter1InitialBalance)).to.equal(expectedRewardVoter1);
    expect(voter2FinalBalance.sub(voter2InitialBalance)).to.equal(expectedRewardVoter2);
  });

  // Helper functions
  async function registerParanet(accounts: SignerWithAddress[], Paranet: Paranet, number: number) {
    const assetInputArgs = {
      assertionId: getHashFromNumber(number),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(accounts[100 + number]).increaseAllowance(
      ServiceAgreementV1.address,
      assetInputArgs.tokenAmount,
    );
    const tx = await ContentAssetV2.connect(accounts[100 + number]).createAsset(assetInputArgs);
    const receipt = await tx.wait();

    const paranetKAStorageContract = ContentAssetStorageV2.address;
    const paranetKATokenId = Number(receipt.logs[0].topics[3]);
    const paranetName = 'Test paranet 1';
    const paranetDescription = 'Description of Test Paranet';

    await Paranet.connect(accounts[100 + number]).registerParanet(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetName,
      paranetDescription,
    );

    return {
      paranetKAStorageContract,
      paranetKATokenId,
      paranetId: hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['address', 'uint256'], [paranetKAStorageContract, paranetKATokenId]),
      ),
    };
  }

  async function deployERC20NeuroIncentivesPool(
    accounts: SignerWithAddress[],
    incentivesPoolParams: IncentivizationPoolParameters,
    number: number,
  ) {
    const tx = await ParanetIncentivesPoolFactory.connect(accounts[100 + number]).deployNeuroIncentivesPool(
      false,
      incentivesPoolParams.paranetKAStorageContract,
      incentivesPoolParams.paranetKATokenId,
      incentivesPoolParams.tracToNeuroEmissionMultiplier,
      incentivesPoolParams.paranetOperatorRewardPercentage,
      incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage,
    );
    const receipt = await tx.wait();

    const IncentivesPool = await hre.ethers.getContractAt(
      'ParanetNeuroIncentivesPool',
      receipt.events?.[0].args?.incentivesPool.addr,
    );

    return IncentivesPool;
  }

  async function createParanetKnowledgeAsset(
    knowledgeMinerAccount: SignerWithAddress,
    paranetKAStorageContract: string,
    paranetKATokenId: number,
    assertionIdNumber: number,
    tokenAmount: string,
  ) {
    const assetInputArgs = {
      assertionId: getHashFromNumber(assertionIdNumber),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther(tokenAmount),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(knowledgeMinerAccount).increaseAllowance(
      ServiceAgreementV1.address,
      assetInputArgs.tokenAmount,
    );

    await Paranet.connect(knowledgeMinerAccount).mintKnowledgeAsset(
      paranetKAStorageContract,
      paranetKATokenId,
      assetInputArgs,
    );
  }

  function getHashFromNumber(number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
  }
});
