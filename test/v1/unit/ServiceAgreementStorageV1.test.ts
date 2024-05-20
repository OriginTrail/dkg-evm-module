import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Token, ServiceAgreementStorageV1, HubController } from '../../../typechain';

type ServiceAgreementStorageV1Fixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementStorageV1: ServiceAgreementStorageV1;
  Token: Token;
};

describe('@v1 @unit ServiceAgreementStorageV1 contract', function () {
  const agreementId = '0x' + randomBytes(32).toString('hex');
  const newAgreementId = '0x' + randomBytes(32).toString('hex');
  const epochsNumber = 5;
  const epochLength = 10;
  const tokenAmount = hre.ethers.utils.parseEther('100');
  const scoreFunctionId = 0;
  const proofWindowOffsetPerc = 10;

  let accounts: SignerWithAddress[];
  let ServiceAgreementStorageV1: ServiceAgreementStorageV1;
  let Token: Token;

  async function deployServiceAgreementStorageV1Fixture(): Promise<ServiceAgreementStorageV1Fixture> {
    await hre.deployments.fixture(['ServiceAgreementStorageV1']);
    accounts = await hre.ethers.getSigners();
    ServiceAgreementStorageV1 = await hre.ethers.getContract<ServiceAgreementStorageV1>('ServiceAgreementStorageV1');
    Token = await hre.ethers.getContract<Token>('Token');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ServiceAgreementStorageV1, Token };
  }

  async function createServiceAgreement() {
    await ServiceAgreementStorageV1.createServiceAgreementObject(
      agreementId,
      epochsNumber,
      epochLength,
      tokenAmount,
      scoreFunctionId,
      proofWindowOffsetPerc,
    );
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ServiceAgreementStorageV1, Token } = await loadFixture(deployServiceAgreementStorageV1Fixture));
  });

  it('The contract is named "ServiceAgreementStorageV1"', async () => {
    expect(await ServiceAgreementStorageV1.name()).to.equal('ServiceAgreementStorageV1');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ServiceAgreementStorageV1.version()).to.equal('1.0.0');
  });

  it('Should allow creating service agreement object', async () => {
    await createServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;

    const agreementData = await ServiceAgreementStorageV1.getAgreementData(agreementId);

    expect(agreementData).to.deep.equal([
      blockTimestamp,
      epochsNumber,
      epochLength,
      tokenAmount,
      [scoreFunctionId, proofWindowOffsetPerc],
    ]);
  });

  it('Should allow updating service agreement data using get and set', async () => {
    await createServiceAgreement();

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const blockTimestamp = (await hre.ethers.provider.getBlock(blockNumber)).timestamp;
    const newBlockTimestamp = blockTimestamp + 1;
    const newEpochsNumber = 10;
    const newEpochLength = 15;
    const newTokenAmount = hre.ethers.utils.parseEther('200');
    const newScoreFunctionId = 1;
    const newProofWindowOffsetPerc = 20;
    const agreementEpochSubmissionHead = '0x' + randomBytes(32).toString('hex');

    await ServiceAgreementStorageV1.setAgreementStartTime(agreementId, newBlockTimestamp);
    expect(await ServiceAgreementStorageV1.getAgreementStartTime(agreementId)).to.equal(newBlockTimestamp);

    await ServiceAgreementStorageV1.setAgreementEpochsNumber(agreementId, newEpochsNumber);
    expect(await ServiceAgreementStorageV1.getAgreementEpochsNumber(agreementId)).to.equal(newEpochsNumber);

    await ServiceAgreementStorageV1.setAgreementEpochLength(agreementId, newEpochLength);
    expect(await ServiceAgreementStorageV1.getAgreementEpochLength(agreementId)).to.equal(newEpochLength);

    await ServiceAgreementStorageV1.setAgreementTokenAmount(agreementId, newTokenAmount);
    expect(await ServiceAgreementStorageV1.getAgreementTokenAmount(agreementId)).to.equal(newTokenAmount);

    await ServiceAgreementStorageV1.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
    expect(await ServiceAgreementStorageV1.getAgreementScoreFunctionId(agreementId)).to.equal(newScoreFunctionId);

    await ServiceAgreementStorageV1.setAgreementProofWindowOffsetPerc(agreementId, newProofWindowOffsetPerc);
    expect(await ServiceAgreementStorageV1.getAgreementProofWindowOffsetPerc(agreementId)).to.equal(
      newProofWindowOffsetPerc,
    );

    await ServiceAgreementStorageV1.setAgreementEpochSubmissionHead(agreementId, 0, agreementEpochSubmissionHead);
    expect(await ServiceAgreementStorageV1.getAgreementEpochSubmissionHead(agreementId, 0)).to.equal(
      agreementEpochSubmissionHead,
    );
  });

  it('Should allow increment and decrement agreement rewarded number', async () => {
    await createServiceAgreement();

    const initialNodesNumber = await ServiceAgreementStorageV1.getAgreementRewardedNodesNumber(agreementId, 0);

    await ServiceAgreementStorageV1.incrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageV1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber + 1,
    );

    await ServiceAgreementStorageV1.decrementAgreementRewardedNodesNumber(agreementId, 0);
    expect(await ServiceAgreementStorageV1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(
      initialNodesNumber,
    );

    const nodesNumber = 5;
    await ServiceAgreementStorageV1.setAgreementRewardedNodesNumber(agreementId, 0, nodesNumber);
    expect(await ServiceAgreementStorageV1.getAgreementRewardedNodesNumber(agreementId, 0)).to.equal(nodesNumber);
  });

  it('Service agreement exists should return true for existing agreement', async () => {
    await createServiceAgreement();

    expect(await ServiceAgreementStorageV1.serviceAgreementExists(agreementId)).to.equal(true);
    expect(await ServiceAgreementStorageV1.serviceAgreementExists(newAgreementId)).to.equal(false);
  });

  it('Should allow creating commit submission object', async () => {
    const commitId = '0x' + randomBytes(32).toString('hex');
    const identityId = 2;
    const prevIdentityId = 1;
    const nextIdentityId = 3;
    const score = 5;

    await ServiceAgreementStorageV1.createCommitSubmissionObject(
      commitId,
      identityId,
      prevIdentityId,
      nextIdentityId,
      score,
    );

    const commitSubmission = await ServiceAgreementStorageV1.getCommitSubmission(commitId);

    expect(commitSubmission).to.deep.equal([identityId, prevIdentityId, nextIdentityId, score]);
  });

  it('Should allow transferring reward', async () => {
    const transferAmount = hre.ethers.utils.parseEther('100');
    const receiver = accounts[1].address;
    await Token.mint(ServiceAgreementStorageV1.address, transferAmount);

    const initialReceiverBalance = await Token.balanceOf(receiver);
    await ServiceAgreementStorageV1.transferAgreementTokens(receiver, transferAmount);
    expect(await Token.balanceOf(receiver)).to.equal(initialReceiverBalance.add(transferAmount));
  });
});
