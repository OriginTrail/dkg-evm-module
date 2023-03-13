import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { Token, Hub, ServiceAgreementStorageProxy } from '../typechain';

type ServiceAgreementStorageProxyFixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  Token: Token;
};

describe('ServiceAgreementStorageProxy contract', function () {
  const agreementId = '0x' + randomBytes(32).toString('hex');
  const newAgreementId = '0x' + randomBytes(32).toString('hex');
  const epochsNumber = 5;
  const epochLength = 10;
  const tokenAmount = hre.ethers.utils.parseEther('100');
  const scoreFunctionId = 0;
  const proofWindowOffsetPerc = 10;

  let accounts: SignerWithAddress[];
  let Hub: Hub;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let Token: Token;

  async function deployServiceAgreementStorageProxyFixture(): Promise<ServiceAgreementStorageProxyFixture> {
    await hre.deployments.fixture(['ServiceAgreementStorageProxy']);
    accounts = await hre.ethers.getSigners();
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    Token = await hre.ethers.getContract<Token>('Token');
    Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ServiceAgreementStorageProxy, Token };
  }

  async function createOldServiceAgreement() {
    await ServiceAgreementStorageProxy.createOldServiceAgreementObject(
      agreementId,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );
  }

  async function createNewServiceAgreement() {
    await ServiceAgreementStorageProxy.createServiceAgreementObject(
      agreementId,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );
  }

  beforeEach(async () => {
    ({ accounts, ServiceAgreementStorageProxy, Token } = await loadFixture(deployServiceAgreementStorageProxyFixture));
  });

  it('The contract is named "ServiceAgreementStorageProxy"', async () => {
    expect(await ServiceAgreementStorageProxy.name()).to.equal('ServiceAgreementStorageProxy');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ServiceAgreementStorageProxy.version()).to.equal('1.0.0');
  });

  it('Should allow creating old service agreement object', async () => {
    await createOldServiceAgreement();

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

  it('Should allow deleting old service agreement object', async () => {
    await createOldServiceAgreement();

    await ServiceAgreementStorageProxy.deleteServiceAgreementObject(agreementId);

    const agreementData = await ServiceAgreementStorageProxy.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([0, 0, 0, [0, 0], [0, 0]]);
  });

  it('Should allow updating old service agreement data using get and set', async () => {
    await createNewServiceAgreement();

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

    await ServiceAgreementStorageProxy['setAgreementEpochSubmissionHead(bytes32,uint16,bytes32)'](
      agreementId,
      0,
      agreementEpochSubmissionHead,
    );
    expect(
      await ServiceAgreementStorageProxy['getAgreementEpochSubmissionHead(bytes32,uint16)'](agreementId, 0),
    ).to.equal(agreementEpochSubmissionHead);
  });

  it('Should allow incrementing/decrementing/setting/deleting agreement rewarded number for old SA', async () => {
    await createOldServiceAgreement();

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

  it('Service agreement exists should return true for existing new agreement', async () => {
    await createNewServiceAgreement();

    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(agreementId)).to.equal(true);
    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(newAgreementId)).to.equal(false);
  });

  it('Should allow creating/deleting commit submission object for old SA', async () => {
    const commitId = '0x' + randomBytes(32).toString('hex');
    const identityId = 2;
    const prevIdentityId = 1;
    const nextIdentityId = 3;
    const score = 5;

    await ServiceAgreementStorageProxy.createOldCommitSubmissionObject(
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

  it('Should allow creating new service agreement object', async () => {
    await createNewServiceAgreement();

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

  it('Should allow deleting new service agreement object', async () => {
    await createNewServiceAgreement();

    await ServiceAgreementStorageProxy.deleteServiceAgreementObject(agreementId);

    const agreementData = await ServiceAgreementStorageProxy.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([0, 0, 0, [0, 0], [0, 0]]);
  });

  it('Should allow updating new service agreement data using get and set', async () => {
    await createNewServiceAgreement();

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

    await ServiceAgreementStorageProxy['setAgreementEpochSubmissionHead(bytes32,uint16,uint256,bytes32)'](
      agreementId,
      0,
      0,
      agreementEpochSubmissionHead,
    );
    expect(
      await ServiceAgreementStorageProxy['getAgreementEpochSubmissionHead(bytes32,uint16,uint256)'](agreementId, 0, 0),
    ).to.equal(agreementEpochSubmissionHead);
  });

  it('Should allow incrementing/decrementing/setting/deleting agreement rewarded number for new SA', async () => {
    await createNewServiceAgreement();

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

  it('Service agreement exists should return true for existing new agreement', async () => {
    await createNewServiceAgreement();

    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(agreementId)).to.equal(true);
    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(newAgreementId)).to.equal(false);
  });

  it('Should allow creating/deleting commit submission object for new SA', async () => {
    const commitId = '0x' + randomBytes(32).toString('hex');
    const identityId = 2;
    const prevIdentityId = 1;
    const nextIdentityId = 3;
    const score = 5;

    await ServiceAgreementStorageProxy.createCommitSubmissionObject(
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

  it('Should allow increasing/deacreasing/deleting epoch state commits count for new SA', async () => {
    await createNewServiceAgreement();

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

  it('Should allow setting/deleting update commits deadline for new SA', async () => {
    await createNewServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    const stateId = '0x' + randomBytes(32).toString('hex');
    const deadline = blockTimestamp + 1000;

    await ServiceAgreementStorageProxy.setUpdateCommitsDeadline(stateId, deadline);
    expect(await ServiceAgreementStorageProxy.getUpdateCommitsDeadline(stateId)).to.equal(deadline);

    await ServiceAgreementStorageProxy.deleteUpdateCommitsDeadline(stateId);
    expect(await ServiceAgreementStorageProxy.getUpdateCommitsDeadline(stateId)).to.equal(0);
  });

  it('Should allow transferring reward for new SA', async () => {
    const transferAmount = hre.ethers.utils.parseEther('100');
    const receiver = accounts[1].address;
    await Token.mint(await ServiceAgreementStorageProxy.latestStorageAddress(), transferAmount);

    const initialReceiverBalance = await Token.balanceOf(receiver);
    await ServiceAgreementStorageProxy.transferAgreementTokens(receiver, transferAmount);
    expect(await Token.balanceOf(receiver)).to.equal(initialReceiverBalance.add(transferAmount));
  });
});
