import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { ContentAssetStorage, Token, Hub, ParametersStorage, ServiceAgreementV1 } from '../typechain';

type ServiceAgreementV1Fixture = {
  accounts: SignerWithAddress[];
  ContentAssetStorage: ContentAssetStorage;
  ParametersStorage: ParametersStorage;
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
};

describe('ServiceAgreementV1 contract', function () {
  let accounts: SignerWithAddress[];
  let Hub: Hub;
  let ContentAssetStorage: ContentAssetStorage;
  let ParametersStorage: ParametersStorage;
  let ServiceAgreementV1: ServiceAgreementV1;
  let Token: Token;

  async function deployServiceAgreementV1Fixture(): Promise<ServiceAgreementV1Fixture> {
    await hre.deployments.fixture(['ServiceAgreementV1', 'ContentAssetStorage']);
    accounts = await hre.ethers.getSigners();
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    Token = await hre.ethers.getContract<Token>('Token');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    Hub = await hre.ethers.getContract<Hub>('Hub');
    ContentAssetStorage = await hre.ethers.getContract<ContentAssetStorage>('ContentAssetStorage');

    await Hub.setContractAddress('HubOwner', accounts[0].address);

    await ParametersStorage.setEpochLength(60 * 60); // 60 minutes
    await ParametersStorage.setCommitWindowDurationPerc(25); // 25% (15 minutes)
    await ParametersStorage.setMinProofWindowOffsetPerc(50); // range from 50%
    await ParametersStorage.setMaxProofWindowOffsetPerc(75); // range to 75%
    await ParametersStorage.setProofWindowDurationPerc(25); // 25% (15 minutes)

    return { accounts, ContentAssetStorage, ParametersStorage, ServiceAgreementV1, Token };
  }

  beforeEach(async () => {
    ({ accounts, ContentAssetStorage, ParametersStorage, ServiceAgreementV1, Token } = await loadFixture(
      deployServiceAgreementV1Fixture,
    ));
  });

  it('The contract is named "ServiceAgreementV1"', async function () {
    expect(await ServiceAgreementV1.name()).to.equal('ServiceAgreementV1');
  });

  it('The contract is version "1.1.0"', async function () {
    expect(await ServiceAgreementV1.version()).to.equal('1.1.0');
  });

  it('Create new SA with valid input args; await all parameters to be set up', async function () {
    const serviceAgreementInputArgs = {
      assetCreator: accounts[0].address,
      assetContract: ContentAssetStorage.address,
      tokenId: '1',
      keyword: '0x4121b8cb24ae9feb3a1c987c1ab5c5b6ba62ef4807b6d589f64455c9dba7f1fc',
      hashFunctionId: '1',
      epochsNumber: '10',
      tokenAmount: 100,
      scoreFunctionId: '1',
    };
    await Token.increaseAllowance(ServiceAgreementV1.address, serviceAgreementInputArgs.tokenAmount);

    const blockNumber = await hre.ethers.provider.getBlockNumber();

    await expect(await ServiceAgreementV1.createServiceAgreement(serviceAgreementInputArgs))
      .to.emit(ServiceAgreementV1, 'ServiceAgreementV1Created')
      .withArgs(
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        Number(serviceAgreementInputArgs.hashFunctionId),
        (await hre.ethers.provider.getBlock(blockNumber)).timestamp + 1,
        Number(serviceAgreementInputArgs.epochsNumber),
        await ParametersStorage.epochLength(),
        serviceAgreementInputArgs.tokenAmount,
      );
  });

  it.skip('Create new SA with 0x0 creator address, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with asset storage not in the hub, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with empty keyword, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with 0 epochs number, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with 0 tokens, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with non-existent score function, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with too low allowance, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA with too low balance, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA and terminate it, expect SA to be terminated', async () => {
    return;
  });

  it.skip('Create new SA and try terminating it with empty creator address, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA and try terminating it with asset storage not in the hub, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA and try terminating it with empty keyword, expect to be reverted', async () => {
    return;
  });

  it.skip('Create new SA and extend storing period, expect epochs number to be increased', async () => {
    return;
  });

  // if (!hub.isAssetStorage(assetContract))
  //           revert ServiceAgreementErrorsV1U1.AssetStorageNotInTheHub(assetContract);
  //       if (keccak256(keyword) == keccak256("")) revert ServiceAgreementErrorsV1U1.EmptyKeyword();
  //       if (epochsNumber == 0) revert ServiceAgreementErrorsV1U1.ZeroEpochsNumber();

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('Create new SA and add tokens, expect token amount to be increased', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });

  it.skip('', async () => {
    return;
  });
});
