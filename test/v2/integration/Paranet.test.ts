import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumberish, BytesLike } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';
import { Address } from 'hardhat-deploy/types';

import {
  Paranet,
  ParanetsRegistry,
  ParanetKnowledgeMinersRegistry,
  HubController,
  ContentAssetV2,
  ServiceAgreementV1,
  ContentAssetStorageV2,
  Token,
  ParanetIncentivesPoolFactory,
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v2/assets/ContentAsset.sol/ContentAssetV2';

type ParanetNeuroIncentivesPoolFixture = {
  accounts: SignerWithAddress[];
  ContentAsset: ContentAssetV2;
  ContentAssetStorage: ContentAssetStorageV2;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetsRegistry: ParanetsRegistry;
  Paranet: Paranet;
  ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
};

describe('@v2 @integration Paranet', function () {
  let accounts: SignerWithAddress[];
  let operator: SignerWithAddress;
  let miner: SignerWithAddress;
  let HubController: HubController;
  let ContentAsset: ContentAssetV2;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ContentAssetStorage: ContentAssetStorageV2;
  let Token: Token;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetsRegistry: ParanetsRegistry;
  let Paranet: Paranet;
  let ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;

  async function deployParanetNeuroIncentivesPoolFixture(): Promise<ParanetNeuroIncentivesPoolFixture> {
    await hre.deployments.fixture([
      'Token',
      'ServiceAgreementV1',
      'ContentAssetStorageV2',
      'ContentAssetV2',
      'Paranet',
      'ParanetIncentivesPoolFactory',
    ]);

    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorageV2>('ContentAssetStorage');
    ContentAsset = await hre.ethers.getContract<ContentAssetV2>('ContentAsset');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    Token = await hre.ethers.getContract<Token>('Token');

    ParanetKnowledgeMinersRegistry = await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
      'ParanetKnowledgeMinersRegistry',
    );
    ParanetsRegistry = await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    Paranet = await hre.ethers.getContract<Paranet>('Paranet');
    ParanetIncentivesPoolFactory = await hre.ethers.getContract<ParanetIncentivesPoolFactory>(
      'ParanetIncentivesPoolFactory',
    );

    accounts = await hre.ethers.getSigners();

    HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return {
      accounts,
      ContentAssetStorage,
      ContentAsset,
      ServiceAgreementV1,
      Token,
      ParanetKnowledgeMinersRegistry,
      ParanetsRegistry,
      Paranet,
      ParanetIncentivesPoolFactory,
    };
  }

  async function createAsset(
    assetInputStruct: ContentAssetStructs.AssetInputArgsStruct,
  ): Promise<{ tokenId: number; keyword: BytesLike; agreementId: BytesLike }> {
    await Token.connect(operator).increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.connect(operator).createAsset(assetInputStruct)).wait();
    const tokenId = Number(receipt.logs[0].topics[3]);

    const keyword = hre.ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [ContentAssetStorage.address, assetInputStruct.assertionId],
    );
    const agreementId = hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorage.address, tokenId, keyword],
    );
    return { tokenId, keyword, agreementId };
  }

  async function registerParanet(
    paranetKATokenId: BigNumberish,
    paranetName: string,
    paranetDescription: string,
    tracToNeuroEmissionMultiplier: BigNumberish,
    paranetOperatorRewardPercentage: BigNumberish,
    paranetIncentivizationProposalVotersRewardPercentage: BigNumberish,
  ): Promise<{ paranetId: BytesLike; ParanetNeuroIncentivesPoolAddress: Address }> {
    const tx1 = await Paranet.connect(operator).registerParanet(
      ContentAssetStorage.address,
      paranetKATokenId,
      paranetName,
      paranetDescription,
    );
    await tx1.wait();

    const tx2 = await ParanetIncentivesPoolFactory.connect(operator).deployNeuroIncentivesPool(
      ContentAssetStorage.address,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier,
      paranetOperatorRewardPercentage,
      paranetIncentivizationProposalVotersRewardPercentage,
    );
    await tx2.wait();

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [ContentAssetStorage.address, paranetKATokenId]),
    );
    const ParanetNeuroIncentivesPoolAddress = await ParanetsRegistry.getIncentivesPoolAddress(paranetId, 'Neuroweb');

    return {
      paranetId,
      ParanetNeuroIncentivesPoolAddress,
    };
  }

  beforeEach(async function () {
    hre.helpers.resetDeploymentsJson();
    ({
      accounts,
      ContentAssetStorage,
      ContentAsset,
      ServiceAgreementV1,
      Token,
      ParanetKnowledgeMinersRegistry,
      ParanetsRegistry,
      Paranet,
      ParanetIncentivesPoolFactory,
    } = await loadFixture(deployParanetNeuroIncentivesPoolFixture));

    operator = accounts[1];
    miner = accounts[2];
  });

  it('Should accept native tokens, update balance and variable successfully', async function () {
    const paranetKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('250'),
      scoreFunctionId: 2,
      immutable_: false,
    };
    const { tokenId: paranetTokenId } = await createAsset(paranetKAStruct);

    const { ParanetNeuroIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      1000, // paranetOperatorRewardPercentage -- 10%
      500, // paranetIncentivizationProposalVotersRewardPercentage -- 5%
    );

    const ParanetNeuroIncentivesPool = await hre.ethers.getContractAt(
      'ParanetNeuroIncentivesPool',
      ParanetNeuroIncentivesPoolAddress,
    );

    const initialBalance = await ParanetNeuroIncentivesPool.getNeuroBalance();

    expect(initialBalance).to.be.equal(0);

    const value = hre.ethers.utils.parseEther('100');
    const tx = await operator.sendTransaction({
      to: ParanetNeuroIncentivesPool.address,
      value,
    });
    await tx.wait();

    const finalBalance = await ParanetNeuroIncentivesPool.getNeuroBalance();
    const totalNeuroReceived = await ParanetNeuroIncentivesPool.totalNeuroReceived();

    expect(finalBalance).to.be.equal(totalNeuroReceived).to.be.equal(value);
  });

  // it('Should revert while getting operator reward before miner', async function () {
  //   const paranetKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
  //     assertionId: '0x' + randomBytes(32).toString('hex'),
  //     size: 1000,
  //     triplesNumber: 10,
  //     chunksNumber: 10,
  //     epochsNumber: 5,
  //     tokenAmount: hre.ethers.utils.parseEther('250'),
  //     scoreFunctionId: 2,
  //     immutable_: false,
  //   };
  //   const { tokenId: paranetTokenId } = await createAsset(paranetKAStruct);

  //   const { ParanetNeuroIncentivesPoolAddress } = await registerParanet(
  //     paranetTokenId,
  //     'Paranet1',
  //     'Test Paranet',
  //     hre.ethers.utils.parseEther('1'), // tracToNeuroRatio - 1:1
  //     1000, // operatorRewardPercentage -- 10%
  //     500, // paranetIncentivizationProposalVotersRewardPercentage -- 5%
  //   );

  //   const ParanetNeuroIncentivesPool = await hre.ethers.getContractAt(
  //     'ParanetNeuroIncentivesPool',
  //     ParanetNeuroIncentivesPoolAddress,
  //   );

  //   const value = hre.ethers.utils.parseEther('1000');
  //   const tx = await operator.sendTransaction({
  //     to: ParanetNeuroIncentivesPool.address,
  //     value,
  //   });
  //   await tx.wait();

  //   await expect(
  //     ParanetNeuroIncentivesPool.connect(operator).claimParanetOperatorReward(),
  //   ).to.be.revertedWithCustomError(ParanetNeuroIncentivesPool, 'NoRewardAvailable');
  // });

  it('Should correctly calculate miner reward', async function () {
    const paranetKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('250'),
      scoreFunctionId: 2,
      immutable_: false,
    };
    const { tokenId: paranetTokenId } = await createAsset(paranetKAStruct);

    const { ParanetNeuroIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      1000, // operatorRewardPercentage -- 10%
      500, // paranetIncentivizationProposalVotersRewardPercentage -- 5%
    );

    const ParanetNeuroIncentivesPool = await hre.ethers.getContractAt(
      'ParanetNeuroIncentivesPool',
      ParanetNeuroIncentivesPoolAddress,
    );

    const value = hre.ethers.utils.parseEther('5000');
    const tx1 = await operator.sendTransaction({
      to: ParanetNeuroIncentivesPool.address,
      value,
    });
    await tx1.wait();

    // Simulate some miner activity
    const testKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('2500'), // Miner spent 2500 TRAC
      scoreFunctionId: 2,
      immutable_: false,
    };
    await Token.connect(miner).increaseAllowance(ServiceAgreementV1.address, testKAStruct.tokenAmount);
    await Paranet.connect(miner).mintKnowledgeAsset(ContentAssetStorage.address, paranetTokenId, testKAStruct);

    const initialMinerBalance = await miner.getBalance();
    const tx2 = await ParanetNeuroIncentivesPool.connect(miner).claimKnowledgeMinerReward();
    const tx2Receipt = await tx2.wait();
    const tx2Details = await hre.ethers.provider.getTransaction(tx2Receipt.transactionHash);
    const finalMinerBalance = await miner.getBalance();

    const expectedMinerReward = value.div(2).mul(85).div(100);
    expect(finalMinerBalance.sub(initialMinerBalance).add(tx2Receipt.gasUsed.mul(tx2Details.gasPrice))).to.equal(
      expectedMinerReward,
    );
  });

  it('Should correctly calculate and send operator reward after miners reward', async function () {
    const paranetKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('250'),
      scoreFunctionId: 2,
      immutable_: false,
    };
    const { tokenId: paranetTokenId } = await createAsset(paranetKAStruct);

    const { ParanetNeuroIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      1000, // operatorRewardPercentage -- 10%
      500, // paranetIncentivizationProposalVotersRewardPercentage -- 5%
    );

    const ParanetNeuroIncentivesPool = await hre.ethers.getContractAt(
      'ParanetNeuroIncentivesPool',
      ParanetNeuroIncentivesPoolAddress,
    );

    const value = hre.ethers.utils.parseEther('6783');
    const tx1 = await operator.sendTransaction({
      to: ParanetNeuroIncentivesPool.address,
      value,
    });
    await tx1.wait();

    // Simulate some miner activity
    const testKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('2000'), // Miner spent 5000 TRAC
      scoreFunctionId: 2,
      immutable_: false,
    };
    await Token.connect(miner).increaseAllowance(ServiceAgreementV1.address, testKAStruct.tokenAmount);
    await Paranet.connect(miner).mintKnowledgeAsset(ContentAssetStorage.address, paranetTokenId, testKAStruct);

    const initialMinerBalance = await miner.getBalance();
    const tx2 = await ParanetNeuroIncentivesPool.connect(miner).claimKnowledgeMinerReward();
    const tx2Receipt = await tx2.wait();
    const tx2Details = await hre.ethers.provider.getTransaction(tx2Receipt.transactionHash);
    const finalMinerBalance = await miner.getBalance();

    const expectedMinerReward = hre.ethers.utils.parseEther('2000').mul(85).div(100);
    expect(finalMinerBalance.sub(initialMinerBalance).add(tx2Receipt.gasUsed.mul(tx2Details.gasPrice))).to.equal(
      expectedMinerReward,
    );

    const initialOperatorBalance = await operator.getBalance();
    const tx3 = await ParanetNeuroIncentivesPool.connect(operator).claimParanetOperatorReward();
    const tx3Receipt = await tx3.wait();
    const tx3Details = await hre.ethers.provider.getTransaction(tx3Receipt.transactionHash);
    const finalOperatorBalance = await operator.getBalance();

    const expectedOperatorReward = hre.ethers.utils.parseEther('2000').mul(10).div(100);
    expect(finalOperatorBalance.sub(initialOperatorBalance).add(tx3Receipt.gasUsed.mul(tx3Details.gasPrice))).to.equal(
      expectedOperatorReward,
    );
  });

  it('Should correctly handle additional Neuro deposit and reward claims', async function () {
    const paranetKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('250'),
      scoreFunctionId: 2,
      immutable_: false,
    };
    const { tokenId: paranetTokenId } = await createAsset(paranetKAStruct);

    const { ParanetNeuroIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      1000, // operatorRewardPercentage -- 10%
      500, // paranetIncentivizationProposalVotersRewardPercentage -- 5%
    );

    const ParanetNeuroIncentivesPool = await hre.ethers.getContractAt(
      'ParanetNeuroIncentivesPool',
      ParanetNeuroIncentivesPoolAddress,
    );

    const value = hre.ethers.utils.parseEther('6783');
    const tx1 = await operator.sendTransaction({
      to: ParanetNeuroIncentivesPool.address,
      value,
    });
    await tx1.wait();

    // Simulate some miner activity
    const testKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('2000'), // Miner spent 2000 TRAC
      scoreFunctionId: 2,
      immutable_: false,
    };
    await Token.connect(miner).increaseAllowance(ServiceAgreementV1.address, testKAStruct.tokenAmount);
    await Paranet.connect(miner).mintKnowledgeAsset(ContentAssetStorage.address, paranetTokenId, testKAStruct);

    const initialMinerBalance = await miner.getBalance();
    const tx2 = await ParanetNeuroIncentivesPool.connect(miner).claimKnowledgeMinerReward();
    const tx2Receipt = await tx2.wait();
    const tx2Details = await hre.ethers.provider.getTransaction(tx2Receipt.transactionHash);
    const finalMinerBalance = await miner.getBalance();

    const expectedMinerReward = hre.ethers.utils.parseEther('2000').mul(85).div(100);
    expect(finalMinerBalance.sub(initialMinerBalance).add(tx2Receipt.gasUsed.mul(tx2Details.gasPrice))).to.equal(
      expectedMinerReward,
    );

    const initialOperatorBalance = await operator.getBalance();
    const tx3 = await ParanetNeuroIncentivesPool.connect(operator).claimParanetOperatorReward();
    const tx3Receipt = await tx3.wait();
    const tx3Details = await hre.ethers.provider.getTransaction(tx3Receipt.transactionHash);
    const finalOperatorBalance = await operator.getBalance();

    const expectedOperatorReward = hre.ethers.utils.parseEther('2000').mul(10).div(100);
    expect(finalOperatorBalance.sub(initialOperatorBalance).add(tx3Receipt.gasUsed.mul(tx3Details.gasPrice))).to.equal(
      expectedOperatorReward,
    );

    // Send additional Neuro to the contract
    const additionalValue = hre.ethers.utils.parseEther('3000');
    const tx4 = await operator.sendTransaction({
      to: ParanetNeuroIncentivesPool.address,
      value: additionalValue,
    });
    await tx4.wait();

    // Mint another Knowledge asset from miner address
    const additionalKAStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('1500'), // Miner spent 1500 TRAC
      scoreFunctionId: 2,
      immutable_: false,
    };
    await Token.connect(miner).increaseAllowance(ServiceAgreementV1.address, additionalKAStruct.tokenAmount);
    await Paranet.connect(miner).mintKnowledgeAsset(ContentAssetStorage.address, paranetTokenId, additionalKAStruct);

    // Claim rewards for miner and operator again
    const initialMinerBalance2 = await miner.getBalance();
    const tx5 = await ParanetNeuroIncentivesPool.connect(miner).claimKnowledgeMinerReward();
    const tx5Receipt = await tx5.wait();
    const tx5Details = await hre.ethers.provider.getTransaction(tx5Receipt.transactionHash);
    const finalMinerBalance2 = await miner.getBalance();

    const expectedMinerReward2 = hre.ethers.utils.parseEther('1500').mul(85).div(100);
    expect(finalMinerBalance2.sub(initialMinerBalance2).add(tx5Receipt.gasUsed.mul(tx5Details.gasPrice))).to.equal(
      expectedMinerReward2,
    );

    const initialOperatorBalance2 = await operator.getBalance();
    const tx6 = await ParanetNeuroIncentivesPool.connect(operator).claimParanetOperatorReward();
    const tx6Receipt = await tx6.wait();
    const tx6Details = await hre.ethers.provider.getTransaction(tx6Receipt.transactionHash);
    const finalOperatorBalance2 = await operator.getBalance();

    const expectedOperatorReward2 = hre.ethers.utils.parseEther('1500').mul(10).div(100);
    expect(
      finalOperatorBalance2.sub(initialOperatorBalance2).add(tx6Receipt.gasUsed.mul(tx6Details.gasPrice)),
    ).to.equal(expectedOperatorReward2);
  });
});
