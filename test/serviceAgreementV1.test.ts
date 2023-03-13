import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import hre from 'hardhat';

import {
  ContentAssetStorage,
  Token,
  Hub,
  ParametersStorage,
  ServiceAgreementV1,
  ServiceAgreementStorageProxy,
} from '../typechain';
import { ServiceAgreementStructsV1 } from '../typechain/contracts/ServiceAgreementV1';

type ServiceAgreementV1Fixture = {
  accounts: SignerWithAddress[];
  ContentAssetStorage: ContentAssetStorage;
  ParametersStorage: ParametersStorage;
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
};

describe('ServiceAgreementV1 contract', function () {
  let accounts: SignerWithAddress[];
  let Hub: Hub;
  let ContentAssetStorage: ContentAssetStorage;
  let ParametersStorage: ParametersStorage;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let ServiceAgreementV1: ServiceAgreementV1;
  let Token: Token;

  const serviceAgreementInputArgs: ServiceAgreementStructsV1.ServiceAgreementInputArgsStruct = {
    assetCreator: '',
    assetContract: '',
    tokenId: 1,
    keyword: '0x' + randomBytes(32).toString('hex'),
    hashFunctionId: 1,
    epochsNumber: 10,
    tokenAmount: hre.ethers.utils.parseEther('10'),
    scoreFunctionId: 1,
  };

  async function createServiceAgreement(): Promise<string> {
    await Token.increaseAllowance(ServiceAgreementV1.address, serviceAgreementInputArgs.tokenAmount);

    const blockNumber = await hre.ethers.provider.getBlockNumber();

    await expect(await ServiceAgreementV1.createServiceAgreement(serviceAgreementInputArgs))
      .to.emit(ServiceAgreementV1, 'ServiceAgreementV1Created')
      .withArgs(
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        serviceAgreementInputArgs.hashFunctionId,
        (await hre.ethers.provider.getBlock(blockNumber)).timestamp + 1,
        serviceAgreementInputArgs.epochsNumber,
        await ParametersStorage.epochLength(),
        serviceAgreementInputArgs.tokenAmount,
      );

    return hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorage.address, serviceAgreementInputArgs.tokenId, serviceAgreementInputArgs.keyword],
    );
  }

  async function deployServiceAgreementV1Fixture(): Promise<ServiceAgreementV1Fixture> {
    await hre.deployments.fixture(['ServiceAgreementStorageProxy', 'ServiceAgreementV1', 'ContentAssetStorage']);
    accounts = await hre.ethers.getSigners();
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    Token = await hre.ethers.getContract<Token>('Token');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    Hub = await hre.ethers.getContract<Hub>('Hub');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    serviceAgreementInputArgs.assetCreator = accounts[0].address;
    serviceAgreementInputArgs.assetContract = ContentAssetStorage.address;

    await ParametersStorage.setEpochLength(60 * 60); // 60 minutes
    await ParametersStorage.setCommitWindowDurationPerc(25); // 25% (15 minutes)
    await ParametersStorage.setMinProofWindowOffsetPerc(50); // range from 50%
    await ParametersStorage.setMaxProofWindowOffsetPerc(75); // range to 75%
    await ParametersStorage.setProofWindowDurationPerc(25); // 25% (15 minutes)

    return {
      accounts,
      ContentAssetStorage,
      ParametersStorage,
      ServiceAgreementStorageProxy,
      ServiceAgreementV1,
      Token,
    };
  }

  beforeEach(async () => {
    ({ accounts, ContentAssetStorage, ParametersStorage, ServiceAgreementV1, Token } = await loadFixture(
      deployServiceAgreementV1Fixture,
    ));
  });

  it('The contract is named "ServiceAgreementV1"', async () => {
    expect(await ServiceAgreementV1.name()).to.equal('ServiceAgreementV1');
  });

  it('The contract is version "1.1.0"', async () => {
    expect(await ServiceAgreementV1.version()).to.equal('1.1.0');
  });

  it('Create new SA with valid input args; await all parameters to be set up', async () => {
    await createServiceAgreement();
  });

  it('Create new SA and terminate it, expect SA to be terminated', async () => {
    const agreementId = await createServiceAgreement();

    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(agreementId)).to.eql(true);

    expect(
      await ServiceAgreementV1.terminateAgreement(
        serviceAgreementInputArgs.assetCreator,
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        serviceAgreementInputArgs.hashFunctionId,
      ),
    ).to.emit(ServiceAgreementV1, 'ServiceAgreementV1Terminated');

    expect(await ServiceAgreementStorageProxy.serviceAgreementExists(agreementId)).to.eql(false);
  });

  it('Create new SA and extend storing period, expect epochs number to be increased', async () => {
    const agreementId = await createServiceAgreement();

    const oldEpochsNumber = Number(serviceAgreementInputArgs.epochsNumber);
    const oldTokenAmount: BigNumber = hre.ethers.utils.parseEther(
      hre.ethers.utils.formatEther(await serviceAgreementInputArgs.tokenAmount),
    );

    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.equal(oldEpochsNumber);
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(oldTokenAmount);

    const additionalEpochsNumber = 5;
    const additionalTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalTokenAmount);
    expect(
      await ServiceAgreementV1.extendStoringPeriod(
        serviceAgreementInputArgs.assetCreator,
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        serviceAgreementInputArgs.hashFunctionId,
        additionalEpochsNumber,
        additionalTokenAmount,
      ),
    ).to.emit(ServiceAgreementV1, 'ServiceAgreementV1Extended');

    expect(await ServiceAgreementStorageProxy.getAgreementEpochsNumber(agreementId)).to.equal(
      oldEpochsNumber + additionalEpochsNumber,
    );
    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(
      oldTokenAmount.add(additionalTokenAmount),
    );
  });

  it('Create new SA and add tokens, expect token amount to be increased', async () => {
    const agreementId = await createServiceAgreement();

    const oldTokenAmount: BigNumber = hre.ethers.utils.parseEther(
      hre.ethers.utils.formatEther(await serviceAgreementInputArgs.tokenAmount),
    );

    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(oldTokenAmount);

    const additionalTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalTokenAmount);
    expect(
      await ServiceAgreementV1.addTokens(
        serviceAgreementInputArgs.assetCreator,
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        serviceAgreementInputArgs.hashFunctionId,
        additionalTokenAmount,
      ),
    ).to.emit(ServiceAgreementV1, 'ServiceAgreementV1RewardRaised');

    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(
      oldTokenAmount.add(additionalTokenAmount),
    );
  });

  it('Create new SA and add update tokens, expect update token amount to be increased', async () => {
    const agreementId = await createServiceAgreement();

    const oldUpdateTokenAmount: BigNumber = hre.ethers.utils.parseEther('0');

    expect(await ServiceAgreementStorageProxy.getAgreementUpdateTokenAmount(agreementId)).to.equal(
      oldUpdateTokenAmount,
    );

    const additionalUpdateTokenAmount = hre.ethers.utils.parseEther('10');

    await Token.increaseAllowance(ServiceAgreementV1.address, additionalUpdateTokenAmount);
    expect(
      await ServiceAgreementV1.addUpdateTokens(
        serviceAgreementInputArgs.assetCreator,
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        serviceAgreementInputArgs.hashFunctionId,
        additionalUpdateTokenAmount,
      ),
    ).to.emit(ServiceAgreementV1, 'ServiceAgreementV1UpdateRewardRaised');

    expect(await ServiceAgreementStorageProxy.getAgreementTokenAmount(agreementId)).to.equal(
      oldUpdateTokenAmount.add(additionalUpdateTokenAmount),
    );
  });
});
