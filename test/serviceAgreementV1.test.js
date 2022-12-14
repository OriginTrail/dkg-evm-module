const { expect } = require('chai');
const {
  expectEvent, // Assertions for emitted events
} = require('@openzeppelin/test-helpers');
const { ethers } = require('ethers');
const timeMachine = require('ganache-time-traveler');

const Hub = artifacts.require('Hub');
const ParametersStorage = artifacts.require('ParametersStorage');
const ContentAssetStorage = artifacts.require('ContentAssetStorage');
const ServiceAgreementV1 = artifacts.require('ServiceAgreementV1');
const ERC20Token = artifacts.require('ERC20Token');

// Contracts used in test
let hub;
let parametersStorage;
let contentAssetStorage;
let serviceAgreementV1;
let erc20Token;

let fakeAssetContract;
let serviceAgreementInputArgs;

let snapshotId;

contract('DKG v6 Service Agreement V1 contract', async (accounts) => {
  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot.result;
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    hub = await Hub.deployed();
    parametersStorage = await ParametersStorage.deployed();
    contentAssetStorage = await ContentAssetStorage.deployed();
    serviceAgreementV1 = await ServiceAgreementV1.deployed();
    erc20Token = await ERC20Token.deployed();

    fakeAssetContract = accounts[0];
    await hub.setContractAddress('FakeAsset', fakeAssetContract);

    serviceAgreementInputArgs = {
      assetCreator: accounts[0],
      assetContract: contentAssetStorage.address,
      tokenId: '1',
      keyword: ethers.utils.hexlify(ethers.utils.toUtf8Bytes('12345')),
      hashFunctionId: '1',
      epochsNumber: '10',
      tokenAmount: ethers.utils.parseEther('10').toString(),
      scoreFunctionId: '1',
    };

    await parametersStorage.setEpochLength(60 * 60); // 60 minutes
    await parametersStorage.setCommitWindowDurationPerc(25); // 25% (15 minutes)
    await parametersStorage.setMinProofWindowOffsetPerc(50); // range from 50%
    await parametersStorage.setMaxProofWindowOffsetPerc(75); // range to 75%
    await parametersStorage.setProofWindowDurationPerc(25); // 25% (15 minutes)

    const promises = [];
    const tokenAmount = 1000000;

    for (let i = 1; i < accounts.length; i += 1) {
      promises.push(erc20Token.mint(
        accounts[i],
        tokenAmount,
        { from: accounts[0] },
      ));
    }
    await Promise.all(promises);
  });

  it('the contract is named "ServiceAgreementV1"', async () => {
    // Expect that the contract's name is "Hub"
    expect(await serviceAgreementV1.name()).to.equal('ServiceAgreementV1');
  });

  it('the contract is version "1.0.0"', async () => {
    // Expect that the contract's version is "1.0.0"
    expect(await serviceAgreementV1.version()).to.equal('1.0.0');
  });

  it('create new service agreement with valid input args; await all parameters to be set up', async () => {
    await erc20Token.increaseAllowance(
      serviceAgreementV1.address,
      serviceAgreementInputArgs.tokenAmount,
      { from: fakeAssetContract },
    );

    const receipt = await serviceAgreementV1.createServiceAgreement(
      serviceAgreementInputArgs,
      { from: fakeAssetContract },
    );

    expectEvent(receipt, 'ServiceAgreementV1Created', {
      assetContract: serviceAgreementInputArgs.assetContract,
      tokenId: serviceAgreementInputArgs.tokenId,
      keyword: serviceAgreementInputArgs.keyword,
      hashFunctionId: serviceAgreementInputArgs.hashFunctionId,
      startTime: (await web3.eth.getBlock('latest')).timestamp.toString(),
      epochsNumber: serviceAgreementInputArgs.epochsNumber,
      epochLength: (await parametersStorage.epochLength()),
      tokenAmount: serviceAgreementInputArgs.tokenAmount,
    });
  });
});
