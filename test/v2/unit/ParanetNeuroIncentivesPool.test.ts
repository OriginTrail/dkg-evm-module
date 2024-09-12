/* eslint-disable @typescript-eslint/no-unused-vars */
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumberish } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  HubController,
  Paranet,
  ContentAssetStorageV2,
  ContentAssetV2,
  ParanetsRegistry,
  ParanetServicesRegistry,
  ParanetKnowledgeMinersRegistry,
  ParanetKnowledgeAssetsRegistry,
  HashingProxy,
  ServiceAgreementStorageProxy,
  Token,
  ServiceAgreementV1,
  ParanetIncentivesPoolFactory,
  Hub,
} from '../../../typechain';

type deployParanetFixture = {
  accounts: SignerWithAddress[];
  Paranet: Paranet;
  HubController: HubController;
  ContentAssetV2: ContentAssetV2;
  ContentAssetStorageV2: ContentAssetStorageV2;
  ParanetsRegistry: ParanetsRegistry;
  ParanetServicesRegistry: ParanetServicesRegistry;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;
  ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  HashingProxy: HashingProxy;
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  Token: Token;
  NeuroERC20: Token;
  ServiceAgreementV1: ServiceAgreementV1;
};

type IncentivizationPoolParameters = {
  paranetKAStorageContract: string;
  paranetKATokenId: BigNumberish;
  tracToNeuroEmissionMultiplier: BigNumberish;
  paranetOperatorRewardPercentage: BigNumberish;
  paranetIncentivizationProposalVotersRewardPercentage: BigNumberish;
};

describe('@v2 @unit ParanetNeuroIncentivesPool contract', function () {
  let accounts: SignerWithAddress[];
  let Paranet: Paranet;
  let HubController: HubController;
  let ContentAssetV2: ContentAssetV2;
  let ContentAssetStorageV2: ContentAssetStorageV2;
  let ParanetsRegistry: ParanetsRegistry;
  let ParanetServicesRegistry: ParanetServicesRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;
  let ParanetIncentivesPoolFactory: ParanetIncentivesPoolFactory;
  let HashingProxy: HashingProxy;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let Token: Token;
  let NeuroERC20: Token;
  let ServiceAgreementV1: ServiceAgreementV1;

  async function deployParanetFixture(): Promise<deployParanetFixture> {
    await hre.deployments.fixture(
      [
        'HubV2',
        'HubController',
        'Paranet',
        'ContentAssetStorageV2',
        'ContentAssetV2',
        'ParanetsRegistry',
        'ParanetServicesRegistry',
        'ParanetKnowledgeMinersRegistry',
        'ParanetKnowledgeAssetsRegistry',
        'ParanetIncentivesPoolFactory',
        'HashingProxy',
        'ServiceAgreementStorageProxy',
        'Token',
        'Neuro',
        'ServiceAgreementV1',
      ],
      { keepExistingDeployments: false },
    );

    const Hub = await hre.ethers.getContract<Hub>('Hub');
    HubController = await hre.ethers.getContract<HubController>('HubController');
    Paranet = await hre.ethers.getContract<Paranet>('Paranet');
    ContentAssetV2 = await hre.ethers.getContract<ContentAssetV2>('ContentAsset');
    ContentAssetStorageV2 = await hre.ethers.getContract<ContentAssetStorageV2>('ContentAssetStorage');
    ParanetsRegistry = await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    ParanetServicesRegistry = await hre.ethers.getContract<ParanetServicesRegistry>('ParanetServicesRegistry');
    ParanetKnowledgeMinersRegistry = await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
      'ParanetKnowledgeMinersRegistry',
    );
    ParanetKnowledgeAssetsRegistry = await hre.ethers.getContract<ParanetKnowledgeAssetsRegistry>(
      'ParanetKnowledgeAssetsRegistry',
    );
    ParanetIncentivesPoolFactory = await hre.ethers.getContract<ParanetIncentivesPoolFactory>(
      'ParanetIncentivesPoolFactory',
    );
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    HashingProxy = await hre.ethers.getContract<HashingProxy>('HashingProxy');
    Token = await hre.ethers.getContract<Token>('Token');
    const neuroERC20Address = await Hub.getContractAddress('NeurowebERC20');
    NeuroERC20 = await hre.ethers.getContractAt<Token>('Token', neuroERC20Address);
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');

    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return {
      accounts,
      Paranet,
      HubController,
      ContentAssetV2,
      ContentAssetStorageV2,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeAssetsRegistry,
      ParanetIncentivesPoolFactory,
      HashingProxy,
      ServiceAgreementStorageProxy,
      Token,
      NeuroERC20,
      ServiceAgreementV1,
    };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Paranet, ParanetIncentivesPoolFactory } = await loadFixture(deployParanetFixture));
  });

  it('The contract is named "ParanetNeuroIncentivesPool"', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);
    expect(await IncentivesPool.name()).to.equal('ParanetNeuroIncentivesPool');
  });

  it('The contract is version "2.2.0"', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);
    expect(await IncentivesPool.version()).to.equal('2.2.0');
  });

  it('Should accept ERC20 Neuro and update the balance', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolParams = {
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier: hre.ethers.utils.parseEther('1'),
      paranetOperatorRewardPercentage: 1_000,
      paranetIncentivizationProposalVotersRewardPercentage: 1_000,
    };
    const IncentivesPool = await deployERC20NeuroIncentivesPool(accounts, incentivesPoolParams, 1);

    const neuroAmount = hre.ethers.utils.parseEther('100000');
    await NeuroERC20.transfer(IncentivesPool.address, neuroAmount);

    expect(await IncentivesPool.getNeuroBalance()).to.be.equal(neuroAmount);
  });

  async function registerParanet(accounts: SignerWithAddress[], Paranet: Paranet, number: number) {
    const assetInputArgs = {
      assertionId: getHashFromNumber(number),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(accounts[100 + number]).increaseAllowance(
      ServiceAgreementV1.address,
      assetInputArgs.tokenAmount,
    );
    const tx = await ContentAssetV2.connect(accounts[100 + number]).createAsset(assetInputArgs);
    const receipt = await tx.wait();

    const paranetKAStorageContract = ContentAssetStorageV2.address;
    const paranetKATokenId = Number(receipt.logs[0].topics[3]);
    const paranetName = 'Test paranet 1';
    const paranetDescription = 'Description of Test Paranet';

    await Paranet.connect(accounts[100 + number]).registerParanet(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetName,
      paranetDescription,
    );

    return {
      paranetKAStorageContract,
      paranetKATokenId,
      paranetId: hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['address', 'uint256'], [paranetKAStorageContract, paranetKATokenId]),
      ),
    };
  }

  async function deployERC20NeuroIncentivesPool(
    accounts: SignerWithAddress[],
    incentivesPoolParams: IncentivizationPoolParameters,
    number: number,
  ) {
    const tx = await ParanetIncentivesPoolFactory.connect(accounts[100 + number]).deployNeuroIncentivesPool(
      false,
      incentivesPoolParams.paranetKAStorageContract,
      incentivesPoolParams.paranetKATokenId,
      incentivesPoolParams.tracToNeuroEmissionMultiplier,
      incentivesPoolParams.paranetOperatorRewardPercentage,
      incentivesPoolParams.paranetIncentivizationProposalVotersRewardPercentage,
    );
    const receipt = await tx.wait();

    const IncentivesPool = await hre.ethers.getContractAt(
      'ParanetNeuroIncentivesPool',
      receipt.events?.[0].args?.incentivesPool.addr,
    );

    return IncentivesPool;
  }

  async function createParanetKnowledgeAsset(
    paranetKAStorageContract: string,
    paranetKATokenId: number,
    number: number,
    tokenAmount: string,
  ) {
    const assetInputArgs = {
      assertionId: getHashFromNumber(number),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther(tokenAmount),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(accounts[100 + number]).increaseAllowance(
      ServiceAgreementV1.address,
      assetInputArgs.tokenAmount,
    );

    await Paranet.connect(accounts[100 + number]).mintKnowledgeAsset(
      paranetKAStorageContract,
      paranetKATokenId,
      assetInputArgs,
    );
  }

  function getHashFromNumber(number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
  }

  function getknowledgeAssetId(address: string, number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['address', 'uint256'], [address, number]));
  }
});
