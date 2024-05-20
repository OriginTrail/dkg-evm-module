import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Token, ServiceAgreementStorageV1U1, HubController } from '../../../typechain';

type ServiceAgreementStorageV1U1Fixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  Token: Token;
};

describe('@v1 @unit ServiceAgreementStorageV1U1 contract', function () {
  const agreementId = '0x' + randomBytes(32).toString('hex');
  const newAgreementId = '0x' + randomBytes(32).toString('hex');
  const startTime = Math.floor(Date.now() / 1000).toString();
  const epochsNumber = 5;
  const epochLength = 10;
  const tokenAmount = hre.ethers.utils.parseEther('100');
  const scoreFunctionId = 0;
  const proofWindowOffsetPerc = 10;

  let accounts: SignerWithAddress[];
  let ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  let Token: Token;

  async function deployServiceAgreementStorageV1U1Fixture(): Promise<ServiceAgreementStorageV1U1Fixture> {
    await hre.deployments.fixture(['ServiceAgreementStorageV1U1']);
    accounts = await hre.ethers.getSigners();
    ServiceAgreementStorageV1U1 = await hre.ethers.getContract<ServiceAgreementStorageV1U1>(
      'ServiceAgreementStorageV1U1',
    );
    Token = await hre.ethers.getContract<Token>('Token');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ServiceAgreementStorageV1U1, Token };
  }

  async function createServiceAgreement() {
    await ServiceAgreementStorageV1U1.createServiceAgreementObject(
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
    ({ accounts, ServiceAgreementStorageV1U1, Token } = await loadFixture(deployServiceAgreementStorageV1U1Fixture));
  });

  it('The contract is named "ServiceAgreementStorageV1U1"', async () => {
    expect(await ServiceAgreementStorageV1U1.name()).to.equal('ServiceAgreementStorageV1U1');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ServiceAgreementStorageV1U1.version()).to.equal('1.0.0');
  });

  it('Should allow creating service agreement object', async () => {
    await createServiceAgreement();

    const agreementData = await ServiceAgreementStorageV1U1.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([
      startTime,
      epochsNumber,
      epochLength,
      [tokenAmount, 0],
      [scoreFunctionId, proofWindowOffsetPerc],
    ]);
  });

  it('Should allow deleting service agreement object', async () => {
    await createServiceAgreement();

    await ServiceAgreementStorageV1U1.deleteServiceAgreementObject(agreementId);

    const agreementData = await ServiceAgreementStorageV1U1.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([0, 0, 0, [0, 0], [0, 0]]);
  });

  it('Should allow updating service agreement data using get and set', async () => {
    await createServiceAgreement();

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

    await ServiceAgreementStorageV1U1.setAgreementStartTime(agreementId, newBlockTimestamp);
    expect(await ServiceAgreementStorageV1U1.getAgreementStartTime(agreementId)).to.equal(newBlockTimestamp);

    await ServiceAgreementStorageV1U1.setAgreementEpochsNumber(agreementId, newEpochsNumber);
    expect(await ServiceAgreementStorageV1U1.getAgreementEpochsNumber(agreementId)).to.equal(newEpochsNumber);

    await ServiceAgreementStorageV1U1.setAgreementEpochLength(agreementId, newEpochLength);
    expect(await ServiceAgreementStorageV1U1.getAgreementEpochLength(agreementId)).to.equal(newEpochLength);

    await ServiceAgreementStorageV1U1.setAgreementTokenAmount(agreementId, newTokenAmount);
    expect(await ServiceAgreementStorageV1U1.getAgreementTokenAmount(agreementId)).to.equal(newTokenAmount);

    await ServiceAgreementStorageV1U1.setAgreementUpdateTokenAmount(agreementId, newUpdateTokenAmount);
    expect(await ServiceAgreementStorageV1U1.getAgreementUpdateTokenAmount(agreementId)).to.equal(newUpdateTokenAmount);

    await ServiceAgreementStorageV1U1.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
    expect(await ServiceAgreementStorageV1U1.getAgreementScoreFunctionId(agreementId)).to.equal(newScoreFunctionId);

    await ServiceAgreementStorageV1U1.setAgreementProofWindowOffsetPerc(agreementId, newProofWindowOffsetPerc);
    expect(await ServiceAgreementStorageV1U1.getAgreementProofWindowOffsetPerc(agreementId)).to.equal(
      newProofWindowOffsetPerc,
    );

    await ServiceAgreementStorageV1U1.setAgreementEpochSubmissionHead(agreementId, 0, 0, agreementEpochSubmissionHead);
    expect(await ServiceAgreementStorageV1U1.getAgreementEpochSubmissionHead(agreementId, 0, 0)).to.equal(
      agreementEpochSubmissionHead,
    );
  });

  it('Should allow incrementing/decrementing/setting/deleting agreement rewarded number', async () => {
    await createServiceAgreement();

    const initialNodesNumber = await ServiceAgreementStorageV1U1.getAgreementRewardedNodesNumber(agreementId, 0);

    await ServiceAgreementStorageV1U1.incrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageV1U1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber + 1,
    );

    await ServiceAgreementStorageV1U1.decrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageV1U1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber,
    );

    const nodesNumber = 5;
    await ServiceAgreementStorageV1U1.setAgreementRewardedNodesNumber(agreementId, 0, nodesNumber);
    expect(await ServiceAgreementStorageV1U1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(nodesNumber);

    await ServiceAgreementStorageV1U1.deleteAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageV1U1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(0);
  });

  it('Service agreement exists should return true for existing agreement', async () => {
    await createServiceAgreement();

    expect(await ServiceAgreementStorageV1U1.serviceAgreementExists(agreementId)).to.equal(true);
    expect(await ServiceAgreementStorageV1U1.serviceAgreementExists(newAgreementId)).to.equal(false);
  });

  it('Should allow creating/deleting commit submission object', async () => {
    const commitId = '0x' + randomBytes(32).toString('hex');
    const identityId = 2;
    const prevIdentityId = 1;
    const nextIdentityId = 3;
    const score = 5;

    await ServiceAgreementStorageV1U1.createEpochStateCommitSubmissionObject(
      commitId,
      identityId,
      prevIdentityId,
      nextIdentityId,
      score,
    );
    let commitSubmission = await ServiceAgreementStorageV1U1.getEpochStateCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([identityId, prevIdentityId, nextIdentityId, score]);

    await ServiceAgreementStorageV1U1.deleteEpochStateCommitSubmissionsObject(commitId);
    commitSubmission = await ServiceAgreementStorageV1U1.getEpochStateCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([0, 0, 0, 0]);
  });

  it('Should allow increasing/deacreasing/deleting epoch state commits count', async () => {
    await createServiceAgreement();

    const epochStateId = '0x' + randomBytes(32).toString('hex');

    const initialCommitsNumber = await ServiceAgreementStorageV1U1.getEpochStateCommitsCount(epochStateId);

    await ServiceAgreementStorageV1U1.incrementEpochStateCommitsCount(epochStateId);
    expect(await ServiceAgreementStorageV1U1.getEpochStateCommitsCount(epochStateId)).to.equal(
      initialCommitsNumber + 1,
    );

    await ServiceAgreementStorageV1U1.decrementEpochStateCommitsCount(epochStateId);
    expect(await ServiceAgreementStorageV1U1.getEpochStateCommitsCount(epochStateId)).to.equal(initialCommitsNumber);

    const commitsNumber = 5;
    await ServiceAgreementStorageV1U1.setEpochStateCommitsCount(epochStateId, commitsNumber);
    expect(await ServiceAgreementStorageV1U1.getEpochStateCommitsCount(epochStateId)).to.equal(commitsNumber);

    await ServiceAgreementStorageV1U1.deleteEpochStateCommitsCount(epochStateId);
    expect(await ServiceAgreementStorageV1U1.getEpochStateCommitsCount(epochStateId)).to.equal(0);
  });

  it('Should allow setting/deleting update commits deadline', async () => {
    await createServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    const stateId = '0x' + randomBytes(32).toString('hex');
    const deadline = blockTimestamp + 1000;

    await ServiceAgreementStorageV1U1.setUpdateCommitsDeadline(stateId, deadline);
    expect(await ServiceAgreementStorageV1U1.getUpdateCommitsDeadline(stateId)).to.equal(deadline);

    await ServiceAgreementStorageV1U1.deleteUpdateCommitsDeadline(stateId);
    expect(await ServiceAgreementStorageV1U1.getUpdateCommitsDeadline(stateId)).to.equal(0);
  });

  it('Should allow transferring reward', async () => {
    const transferAmount = hre.ethers.utils.parseEther('100');
    const receiver = accounts[1].address;
    await Token.mint(ServiceAgreementStorageV1U1.address, transferAmount);

    const initialReceiverBalance = await Token.balanceOf(receiver);
    await ServiceAgreementStorageV1U1.transferAgreementTokens(receiver, transferAmount);
    expect(await Token.balanceOf(receiver)).to.equal(initialReceiverBalance.add(transferAmount));
  });
});
