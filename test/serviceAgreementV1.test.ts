import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { ContentAssetStorage, Token, Hub, ParametersStorage, ServiceAgreementV1 } from '../typechain';

type ServiceAgreementV1Fixture = {
  accounts: SignerWithAddress[];
  ServiceAgreementV1: ServiceAgreementV1;
  Token: Token;
  ContentAssetStorage: ContentAssetStorage;
};

describe('ServiceAgreementV1 contract', function () {
  let accounts: SignerWithAddress[];
  let ServiceAgreementV1: ServiceAgreementV1;
  let Token: Token;
  let ContentAssetStorage: ContentAssetStorage;

  async function deployServiceAgreementV1Fixture(): Promise<ServiceAgreementV1Fixture> {
    await hre.deployments.fixture(['ServiceAgreementV1']);
    const accounts = await hre.ethers.getSigners();
    const ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    const Token = await hre.ethers.getContract<Token>('Token');
    const ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    const Hub = await hre.ethers.getContract<Hub>('Hub');
    await Hub.setContractAddress('HubOwner', accounts[0].address);
    const ContentAssetContract = await hre.ethers.getContractFactory('ContentAssetStorage');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const ContentAssetStorage: ContentAssetStorage = await ContentAssetContract.deploy(Hub.address);
    await ContentAssetStorage.deployed();
    await Hub.setAssetStorageAddress('ContentAssetStorage', ContentAssetStorage.address);

    await ParametersStorage.setEpochLength(60 * 60); // 60 minutes
    await ParametersStorage.setCommitWindowDurationPerc(25); // 25% (15 minutes)
    await ParametersStorage.setMinProofWindowOffsetPerc(50); // range from 50%
    await ParametersStorage.setMaxProofWindowOffsetPerc(75); // range to 75%
    await ParametersStorage.setProofWindowDurationPerc(25); // 25% (15 minutes)

    return { accounts, ContentAssetStorage, ServiceAgreementV1, Token };
  }

  beforeEach(async () => {
    ({ accounts, ContentAssetStorage, ServiceAgreementV1, Token } = await loadFixture(deployServiceAgreementV1Fixture));
  });

  it('The contract is named "ServiceAgreementV1"', async function () {
    expect(await ServiceAgreementV1.name()).to.equal('ServiceAgreementV1');
  });

  it('The contract is version "1.1.0"', async function () {
    expect(await ServiceAgreementV1.version()).to.equal('1.1.0');
  });

  it('Create new service agreement with valid input args; await all parameters to be set up', async function () {
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
    await Token.mint(serviceAgreementInputArgs.assetCreator, serviceAgreementInputArgs.tokenAmount);
    await Token.increaseAllowance(ServiceAgreementV1.address, serviceAgreementInputArgs.tokenAmount);

    const blockNumber = await hre.ethers.provider.getBlockNumber();
    const epochLength = 60 * 60;

    await expect(await ServiceAgreementV1.createServiceAgreement(serviceAgreementInputArgs))
      .to.emit(ServiceAgreementV1, 'ServiceAgreementV1Created')
      .withArgs(
        serviceAgreementInputArgs.assetContract,
        serviceAgreementInputArgs.tokenId,
        serviceAgreementInputArgs.keyword,
        Number(serviceAgreementInputArgs.hashFunctionId),
        (await hre.ethers.provider.getBlock(blockNumber)).timestamp + 1,
        Number(serviceAgreementInputArgs.epochsNumber),
        epochLength,
        serviceAgreementInputArgs.tokenAmount,
      );
  });
});
