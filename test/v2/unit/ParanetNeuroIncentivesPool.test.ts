/* eslint-disable @typescript-eslint/no-unused-vars */
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumberish } from 'ethers';
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
