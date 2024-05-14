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
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v2/assets/ContentAsset.sol/ContentAssetV2';

type ParanetIncentivesPoolFixture = {
  accounts: SignerWithAddress[];
  ContentAsset: ContentAssetV2;
  ContentAssetStorage: ContentAssetStorageV2;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetsRegistry: ParanetsRegistry;
  Paranet: Paranet;
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

  async function deployParanetIncentivesPoolFixture(): Promise<ParanetIncentivesPoolFixture> {
    await hre.deployments.fixture([
      'Token',
      'ServiceAgreementV1',
      'ContentAssetStorageV2',
      'ContentAssetV2',
      'Paranet',
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
    };
  }

  async function createAsset(
    assetInputStruct: ContentAssetStructs.AssetInputArgsStruct,
  ): Promise<{ tokenId: number; keyword: BytesLike; agreementId: BytesLike }> {
    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAsset.createAsset(assetInputStruct)).wait();
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
    tracToNeuroRatio: BigNumberish,
    tracTarget: BigNumberish,
    operatorRewardPercentage: BigNumberish,
  ): Promise<{ paranetId: BytesLike; paranetIncentivesPoolAddress: Address }> {
    const tx = await Paranet.connect(operator).registerParanet(
      ContentAssetStorage.address,
      paranetKATokenId,
      paranetName,
      paranetDescription,
      tracToNeuroRatio,
      tracTarget,
      operatorRewardPercentage,
    );

    await tx.wait();

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [ContentAssetStorage.address, paranetKATokenId]),
    );
    const paranetIncentivesPoolAddress = await ParanetsRegistry.getIncentivesPoolAddress(paranetId);

    return {
      paranetId,
      paranetIncentivesPoolAddress,
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
    } = await loadFixture(deployParanetIncentivesPoolFixture));

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

    const { paranetIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      hre.ethers.utils.parseEther('1000'), // tracTarget
      1000, // operatorRewardPercentage -- 10%
    );

    const ParanetIncentivesPool = await hre.ethers.getContractAt('ParanetIncentivesPool', paranetIncentivesPoolAddress);

    const initialBalance = await ParanetIncentivesPool.getBalance();

    expect(initialBalance).to.be.equal(0);

    const value = hre.ethers.utils.parseEther('100');
    const tx = await operator.sendTransaction({
      to: ParanetIncentivesPool.address,
      value,
    });
    await tx.wait();

    const finalBalance = await ParanetIncentivesPool.getBalance();
    const totalNeuroReceived = await ParanetIncentivesPool.totalNeuroReceived();

    expect(finalBalance).to.be.equal(totalNeuroReceived).to.be.equal(value);
  });

  it('Should revert while getting operator reward before miner', async function () {
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

    const { paranetIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio - 1:1
      hre.ethers.utils.parseEther('1000'), // tracTarget
      1000, // operatorRewardPercentage -- 10%
    );

    const ParanetIncentivesPool = await hre.ethers.getContractAt('ParanetIncentivesPool', paranetIncentivesPoolAddress);

    const value = hre.ethers.utils.parseEther('1000');
    const tx = await operator.sendTransaction({
      to: ParanetIncentivesPool.address,
      value,
    });
    await tx.wait();

    await expect(ParanetIncentivesPool.connect(operator).getParanetOperatorReward()).to.be.revertedWithCustomError(
      ParanetIncentivesPool,
      'NoOperatorRewardAvailable',
    );
  });

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

    const { paranetIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      hre.ethers.utils.parseEther('5000'), // tracTarget
      1000, // operatorRewardPercentage -- 10%
    );

    const ParanetIncentivesPool = await hre.ethers.getContractAt('ParanetIncentivesPool', paranetIncentivesPoolAddress);

    const value = hre.ethers.utils.parseEther('5000');
    const tx1 = await operator.sendTransaction({
      to: ParanetIncentivesPool.address,
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
    const tx2 = await ParanetIncentivesPool.connect(miner).getKnowledgeMinerReward();
    const tx2Receipt = await tx2.wait();
    const tx2Details = await hre.ethers.provider.getTransaction(tx2Receipt.transactionHash);
    const finalMinerBalance = await miner.getBalance();

    const expectedMinerReward = value.div(2).mul(90).div(100);
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

    const { paranetIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      hre.ethers.utils.parseEther('5000'), // tracTarget
      1000, // operatorRewardPercentage -- 10%
    );

    const ParanetIncentivesPool = await hre.ethers.getContractAt('ParanetIncentivesPool', paranetIncentivesPoolAddress);

    const value = hre.ethers.utils.parseEther('6783');
    const tx1 = await operator.sendTransaction({
      to: ParanetIncentivesPool.address,
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
    const tx2 = await ParanetIncentivesPool.connect(miner).getKnowledgeMinerReward();
    const tx2Receipt = await tx2.wait();
    const tx2Details = await hre.ethers.provider.getTransaction(tx2Receipt.transactionHash);
    const finalMinerBalance = await miner.getBalance();

    const expectedMinerReward = value.mul(4).div(10).mul(90).div(100);
    expect(finalMinerBalance.sub(initialMinerBalance).add(tx2Receipt.gasUsed.mul(tx2Details.gasPrice))).to.equal(
      expectedMinerReward,
    );

    const initialOperatorBalance = await operator.getBalance();
    const tx3 = await ParanetIncentivesPool.connect(operator).getParanetOperatorReward();
    const tx3Receipt = await tx3.wait();
    const tx3Details = await hre.ethers.provider.getTransaction(tx3Receipt.transactionHash);
    const finalOperatorBalance = await operator.getBalance();

    const expectedOperatorReward = value.mul(4).div(10).mul(10).div(100);
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

    const { paranetIncentivesPoolAddress } = await registerParanet(
      paranetTokenId,
      'Paranet1',
      'Test Paranet',
      hre.ethers.utils.parseEther('1'), // tracToNeuroRatio -- 1:1
      hre.ethers.utils.parseEther('5000'), // tracTarget
      1000, // operatorRewardPercentage -- 10%
    );

    const ParanetIncentivesPool = await hre.ethers.getContractAt('ParanetIncentivesPool', paranetIncentivesPoolAddress);

    const value = hre.ethers.utils.parseEther('6783');
    const tx1 = await operator.sendTransaction({
      to: ParanetIncentivesPool.address,
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
    const tx2 = await ParanetIncentivesPool.connect(miner).getKnowledgeMinerReward();
    const tx2Receipt = await tx2.wait();
    const tx2Details = await hre.ethers.provider.getTransaction(tx2Receipt.transactionHash);
    const finalMinerBalance = await miner.getBalance();

    const expectedMinerReward = value.mul(4).div(10).mul(90).div(100);
    expect(finalMinerBalance.sub(initialMinerBalance).add(tx2Receipt.gasUsed.mul(tx2Details.gasPrice))).to.equal(
      expectedMinerReward,
    );

    const initialOperatorBalance = await operator.getBalance();
    const tx3 = await ParanetIncentivesPool.connect(operator).getParanetOperatorReward();
    const tx3Receipt = await tx3.wait();
    const tx3Details = await hre.ethers.provider.getTransaction(tx3Receipt.transactionHash);
    const finalOperatorBalance = await operator.getBalance();

    const expectedOperatorReward = value.mul(4).div(10).mul(10).div(100);
    expect(finalOperatorBalance.sub(initialOperatorBalance).add(tx3Receipt.gasUsed.mul(tx3Details.gasPrice))).to.equal(
      expectedOperatorReward,
    );

    // Send additional Neuro to the contract
    const additionalValue = hre.ethers.utils.parseEther('3000');
    const tx4 = await operator.sendTransaction({
      to: ParanetIncentivesPool.address,
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
    const tx5 = await ParanetIncentivesPool.connect(miner).getKnowledgeMinerReward();
    const tx5Receipt = await tx5.wait();
    const tx5Details = await hre.ethers.provider.getTransaction(tx5Receipt.transactionHash);
    const finalMinerBalance2 = await miner.getBalance();

    const expectedMinerReward2 = value.add(additionalValue).mul(7).div(10).mul(90).div(100).sub(expectedMinerReward);
    expect(finalMinerBalance2.sub(initialMinerBalance2).add(tx5Receipt.gasUsed.mul(tx5Details.gasPrice))).to.equal(
      expectedMinerReward2,
    );

    const initialOperatorBalance2 = await operator.getBalance();
    const tx6 = await ParanetIncentivesPool.connect(operator).getParanetOperatorReward();
    const tx6Receipt = await tx6.wait();
    const tx6Details = await hre.ethers.provider.getTransaction(tx6Receipt.transactionHash);
    const finalOperatorBalance2 = await operator.getBalance();

    const expectedOperatorReward2 = value
      .add(additionalValue)
      .mul(7)
      .div(10)
      .mul(10)
      .div(100)
      .sub(expectedOperatorReward);
    expect(
      finalOperatorBalance2.sub(initialOperatorBalance2).add(tx6Receipt.gasUsed.mul(tx6Details.gasPrice)),
    ).to.equal(expectedOperatorReward2);
  });
});
