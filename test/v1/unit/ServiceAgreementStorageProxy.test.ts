import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Token, ServiceAgreementStorageProxy, HubController } from '../../../typechain';

type ServiceAgreementStorageProxyFixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  Token: Token;
};

describe('@v1 @unit ServiceAgreementStorageProxy contract', function () {
  const agreementId = '0x' + randomBytes(32).toString('hex');
  const newAgreementId = '0x' + randomBytes(32).toString('hex');
  const startTime = Math.floor(Date.now() / 1000).toString();
  const epochsNumber = 5;
  const epochLength = 10;
  const tokenAmount = hre.ethers.utils.parseEther('100');
  const scoreFunctionId = 0;
  const proofWindowOffsetPerc = 10;

  let accounts: SignerWithAddress[];
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let Token: Token;

  async function deployServiceAgreementStorageProxyFixture(): Promise<ServiceAgreementStorageProxyFixture> {
    await hre.deployments.fixture(['ServiceAgreementStorageProxy']);
    accounts = await hre.ethers.getSigners();
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    Token = await hre.ethers.getContract<Token>('Token');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ServiceAgreementStorageProxy, Token };
  }

  async function createV1ServiceAgreement() {
    await ServiceAgreementStorageProxy.createV1ServiceAgreementObject(
      agreementId,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );
  }

  async function createV1U1ServiceAgreement() {
    await ServiceAgreementStorageProxy.createV1U1ServiceAgreementObject(
      agreementId,
      startTime,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ServiceAgreementStorageProxy, Token } = await loadFixture(deployServiceAgreementStorageProxyFixture));
  });

  it('The contract is named "ServiceAgreementStorageProxy"', async () => {
    expect(await ServiceAgreementStorageProxy.name()).to.equal('ServiceAgreementStorageProxy');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ServiceAgreementStorageProxy.version()).to.equal('1.0.0');
  });

  it('Should allow creating V1 service agreement object', async () => {
    await createV1ServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    const agreementData = await ServiceAgreementStorageProxy.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([
      blockTimestamp,
      epochsNumber,
      epochLength,
      [tokenAmount, 0],
      [scoreFunctionId, proofWindowOffsetPerc],
    ]);
  });

  it('Should allow deleting V1 service agreement object', async () => {
    await createV1ServiceAgreement();

    await ServiceAgreementStorageProxy.deleteServiceAgreementObject(agreementId);

    const agreementData = await ServiceAgreementStorageProxy.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([0, 0, 0, [0, 0], [0, 0]]);
  });

  it('Should allow updating V1 service agreement data using get and set', async () => {
    await createV1ServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;
    const newBlockTimestamp = blockTimestamp + 1;
    const newEpochsNumber = 10;
    const newEpochLength = 15;
    const newTokenAmount = hre.ethers.utils.parseEther('200');
    const newScoreFunctionId = 1;
    const newProofWindowOffsetPerc = 20;
    const agreementEpochSubmissionHead = '0x' + randomBytes(32).toString('hex');

    await ServiceAgreementStorageProxy.setAgreementStartTime(agreementId, newBlockTimestamp);
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.equal(newBlockTimestamp);

    await ServiceAgreementStorageProxy.setAgreementEpochsNumber(agreementId, newEpochsNumber);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.equal(newEpochsNumber);

    await ServiceAgreementStorageProxy.setAgreementEpochLength(agreementId, newEpochLength);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.equal(newEpochLength);

    await ServiceAgreementStorageProxy.setAgreementTokenAmount(agreementId, newTokenAmount);
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(newTokenAmount);

    await ServiceAgreementStorageProxy.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.equal(newScoreFunctionId);

    await ServiceAgreementStorageProxy.setAgreementProofWindowOffsetPerc(agreementId, newProofWindowOffsetPerc);
    expect(await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId)).to.equal(
      newProofWindowOffsetPerc,
    );

    await ServiceAgreementStorageProxy.setV1AgreementEpochSubmissionHead(agreementId, 0, agreementEpochSubmissionHead);
    expect(await ServiceAgreementStorageProxy.getV1AgreementEpochSubmissionHead(agreementId, 0)).to.equal(
      agreementEpochSubmissionHead,
    );
  });

  it('Should allow incrementing/decrementing/setting/deleting agreement rewarded number for V1 SA', async () => {
    await createV1ServiceAgreement();

    const initialNodesNumber = await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0);

    await ServiceAgreementStorageProxy.incrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber + 1,
    );

    await ServiceAgreementStorageProxy.decrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber,
    );

    const nodesNumber = 5;
    await ServiceAgreementStorageProxy.setAgreementRewardedNodesNumber(agreementId, 0, nodesNumber);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(nodesNumber);

    await ServiceAgreementStorageProxy.deleteAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(0);
  });

  it('Service agreement exists should return true for existing V1U1 agreement', async () => {
    await createV1U1ServiceAgreement();

    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(agreementId)).to.equal(true);
    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(newAgreementId)).to.equal(false);
  });

  it('Should allow creating/deleting commit submission object for V1 SA', async () => {
    const commitId = '0x' + randomBytes(32).toString('hex');
    const identityId = 2;
    const prevIdentityId = 1;
    const nextIdentityId = 3;
    const score = 5;

    await ServiceAgreementStorageProxy.createV1CommitSubmissionObject(
      commitId,
      identityId,
      prevIdentityId,
      nextIdentityId,
      score,
    );
    let commitSubmission = await ServiceAgreementStorageProxy.getCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([identityId, prevIdentityId, nextIdentityId, score]);

    await ServiceAgreementStorageProxy.deleteCommitSubmissionsObject(commitId);
    commitSubmission = await ServiceAgreementStorageProxy.getCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([0, 0, 0, 0]);
  });

  it('Should allow creating V1U1 service agreement object', async () => {
    await createV1U1ServiceAgreement();

    const agreementData = await ServiceAgreementStorageProxy.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([
      startTime,
      epochsNumber,
      epochLength,
      [tokenAmount, 0],
      [scoreFunctionId, proofWindowOffsetPerc],
    ]);
  });

  it('Should allow deleting V1U1 service agreement object', async () => {
    await createV1U1ServiceAgreement();

    await ServiceAgreementStorageProxy.deleteServiceAgreementObject(agreementId);

    const agreementData = await ServiceAgreementStorageProxy.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([0, 0, 0, [0, 0], [0, 0]]);
  });

  it('Should allow updating V1U1 service agreement data using get and set', async () => {
    await createV1U1ServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;
    const newBlockTimestamp = blockTimestamp + 1;
    const newEpochsNumber = 10;
    const newEpochLength = 15;
    const newTokenAmount = hre.ethers.utils.parseEther('200');
    const newUpdateTokenAmount = hre.ethers.utils.parseEther('100');
    const newScoreFunctionId = 1;
    const newProofWindowOffsetPerc = 20;
    const agreementEpochSubmissionHead = '0x' + randomBytes(32).toString('hex');

    await ServiceAgreementStorageProxy.setAgreementStartTime(agreementId, newBlockTimestamp);
    expect(await ServiceAgreementStorageProxy.getAgreementStartTime(agreementId)).to.equal(newBlockTimestamp);

    await ServiceAgreementStorageProxy.setAgreementEpochsNumber(agreementId, newEpochsNumber);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.equal(newEpochsNumber);

    await ServiceAgreementStorageProxy.setAgreementEpochLength(agreementId, newEpochLength);
    expect(await ServiceAgreementStorageProxy.getAgreementEpochLength(agreementId)).to.equal(newEpochLength);

    await ServiceAgreementStorageProxy.setAgreementTokenAmount(agreementId, newTokenAmount);
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(newTokenAmount);

    await ServiceAgreementStorageProxy.setAgreementUpdateTokenAmount(agreementId, newUpdateTokenAmount);
    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.equal(
      newUpdateTokenAmount,
    );

    await ServiceAgreementStorageProxy.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
    expect(await ServiceAgreementStorageProxy.getAgreementScoreFunctionId(agreementId)).to.equal(newScoreFunctionId);

    await ServiceAgreementStorageProxy.setAgreementProofWindowOffsetPerc(agreementId, newProofWindowOffsetPerc);
    expect(await ServiceAgreementStorageProxy.getAgreementProofWindowOffsetPerc(agreementId)).to.equal(
      newProofWindowOffsetPerc,
    );

    await ServiceAgreementStorageProxy.setV1U1AgreementEpochSubmissionHead(
      agreementId,
      0,
      0,
      agreementEpochSubmissionHead,
    );
    expect(await ServiceAgreementStorageProxy.getV1U1AgreementEpochSubmissionHead(agreementId, 0, 0)).to.equal(
      agreementEpochSubmissionHead,
    );
  });

  it('Should allow incrementing/decrementing/setting/deleting agreement rewarded number for V1U1 SA', async () => {
    await createV1U1ServiceAgreement();

    const initialNodesNumber = await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0);

    await ServiceAgreementStorageProxy.incrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber + 1,
    );

    await ServiceAgreementStorageProxy.decrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber,
    );

    const nodesNumber = 5;
    await ServiceAgreementStorageProxy.setAgreementRewardedNodesNumber(agreementId, 0, nodesNumber);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(nodesNumber);

    await ServiceAgreementStorageProxy.deleteAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageProxy.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(0);
  });

  it('Service agreement exists should return true for existing V1U1 agreement', async () => {
    await createV1U1ServiceAgreement();

    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(agreementId)).to.equal(true);
    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(newAgreementId)).to.equal(false);
  });

  it('Should allow creating/deleting commit submission object for V1U1 SA', async () => {
    const commitId = '0x' + randomBytes(32).toString('hex');
    const identityId = 2;
    const prevIdentityId = 1;
    const nextIdentityId = 3;
    const score = 5;

    await ServiceAgreementStorageProxy.createV1U1CommitSubmissionObject(
      commitId,
      identityId,
      prevIdentityId,
      nextIdentityId,
      score,
    );
    let commitSubmission = await ServiceAgreementStorageProxy.getCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([identityId, prevIdentityId, nextIdentityId, score]);

    await ServiceAgreementStorageProxy.deleteCommitSubmissionsObject(commitId);
    commitSubmission = await ServiceAgreementStorageProxy.getCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([0, 0, 0, 0]);
  });

  it('Should allow increasing/deacreasing/deleting epoch state commits count for V1U1 SA', async () => {
    await createV1U1ServiceAgreement();

    const epochStateId = '0x' + randomBytes(32).toString('hex');

    const initialCommitsNumber = await ServiceAgreementStorageProxy.getCommitsCount(epochStateId);

    await ServiceAgreementStorageProxy.incrementCommitsCount(epochStateId);
    expect(await ServiceAgreementStorageProxy.getCommitsCount(epochStateId)).to.equal(initialCommitsNumber + 1);

    await ServiceAgreementStorageProxy.decrementCommitsCount(epochStateId);
    expect(await ServiceAgreementStorageProxy.getCommitsCount(epochStateId)).to.equal(initialCommitsNumber);

    const commitsNumber = 5;
    await ServiceAgreementStorageProxy.setCommitsCount(epochStateId, commitsNumber);
    expect(await ServiceAgreementStorageProxy.getCommitsCount(epochStateId)).to.equal(commitsNumber);

    await ServiceAgreementStorageProxy.deleteCommitsCount(epochStateId);
    expect(await ServiceAgreementStorageProxy.getCommitsCount(epochStateId)).to.equal(0);
  });

  it('Should allow setting/deleting update commits deadline for V1U1 SA', async () => {
    await createV1U1ServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    const stateId = '0x' + randomBytes(32).toString('hex');
    const deadline = blockTimestamp + 1000;

    await ServiceAgreementStorageProxy.setUpdateCommitsDeadline(stateId, deadline);
    expect(await ServiceAgreementStorageProxy.getUpdateCommitsDeadline(stateId)).to.equal(deadline);

    await ServiceAgreementStorageProxy.deleteUpdateCommitsDeadline(stateId);
    expect(await ServiceAgreementStorageProxy.getUpdateCommitsDeadline(stateId)).to.equal(0);
  });

  it('Should allow transferring reward for V1U1 SA', async () => {
    const transferAmount = hre.ethers.utils.parseEther('100');
    const receiver = accounts[1].address;
    await Token.mint(await ServiceAgreementStorageProxy.agreementV1U1StorageAddress(), transferAmount);

    const initialReceiverBalance = await Token.balanceOf(receiver);
    await ServiceAgreementStorageProxy.transferV1U1AgreementTokens(receiver, transferAmount);
    expect(await Token.balanceOf(receiver)).to.equal(initialReceiverBalance.add(transferAmount));
  });
});
