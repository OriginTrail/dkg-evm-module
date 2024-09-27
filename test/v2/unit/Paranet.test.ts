import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
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
  ParanetNeuroIncentivesPool,
  Token,
  ServiceAgreementV1,
  ParanetIncentivesPoolFactory,
  Profile,
  Staking,
} from '../../../typechain';
import { ParanetStructs } from '../../../typechain/contracts/v2/paranets/Paranet';

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
  ServiceAgreementV1: ServiceAgreementV1;
};

describe('@v2 @unit Paranet contract', function () {
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
  let ServiceAgreementV1: ServiceAgreementV1;
  let Profile: Profile;
  let Staking: Staking;

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
        'ServiceAgreementV1',
        'Profile',
      ],
      { keepExistingDeployments: false },
    );

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
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');

    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    Profile = await hre.ethers.getContract<Profile>('Profile');
    Staking = await hre.ethers.getContract<Staking>('Staking');

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
      ServiceAgreementV1,
    };
  }

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<number> {
    const OperationalProfile = Profile.connect(operational);

    const receipt = await (
      await OperationalProfile.createProfile(
        admin.address,
        [],
        '0x' + randomBytes(32).toString('hex'),
        randomBytes(3).toString('hex'),
        randomBytes(2).toString('hex'),
        0,
      )
    ).wait();
    const identityId = Number(receipt.logs[0].topics[1]);

    await OperationalProfile.setAsk(identityId, hre.ethers.utils.parseEther('0.25'));

    const stakeAmount = hre.ethers.utils.parseEther('50000');
    await Token.connect(admin).increaseAllowance(Staking.address, stakeAmount);
    await Staking.connect(admin)['addStake(uint72,uint96)'](identityId, stakeAmount);

    return identityId;
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Paranet, ParanetIncentivesPoolFactory } = await loadFixture(deployParanetFixture));
  });

  it('The contract is named "Paranet"', async () => {
    expect(await Paranet.name()).to.equal('Paranet');
  });

  it('The contract is version "2.2.0"', async () => {
    expect(await Paranet.version()).to.equal('2.2.0');
  });

  it('should register paranet', async () => {
    const { paranetId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    const paranetExists = await ParanetsRegistry.paranetExists(paranetId);

    expect(paranetExists).to.equal(true);
  });

  it('should not register paranet that is already registered', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    const paranetExists = await ParanetsRegistry.paranetExists(paranetId);

    expect(paranetExists).to.equal(true);

    const paranetName = 'Test paranet 1';
    const paranetDescription = 'Description of Test Paranet';

    await expect(
      Paranet.connect(accounts[101]).registerParanet(
        paranetKAStorageContract,
        paranetKATokenId,
        paranetName,
        paranetDescription,
        0,
        0,
      ),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetHasAlreadyBeenRegistered');
  });

  it('should register paranet emit ParanetRegistered event', async () => {
    expect(await registerParanet(accounts, Paranet, 0, 0, 1)).to.emit(Paranet, 'ParanetRegistered');
  });

  it('should register paranet will correctly intitalized incentives pool', async () => {
    const { paranetId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    const incentivesPoolAddress = await ParanetsRegistry.getIncentivesPoolAddress(paranetId, 'Neuroweb');
    const incentivesPoolABI = hre.helpers.getAbi('ParanetNeuroIncentivesPool');
    const incentivesPool = await hre.ethers.getContractAt<ParanetNeuroIncentivesPool>(
      incentivesPoolABI,
      incentivesPoolAddress,
    );

    expect(await incentivesPool.callStatic.parentParanetId()).to.be.equal(paranetId);
    expect(await incentivesPool.callStatic.neuroEmissionMultipliers(0)).to.be.deep.equal([
      hre.ethers.BigNumber.from(5),
      hre.ethers.BigNumber.from((await hre.ethers.provider.getBlock('latest')).timestamp),
      true,
    ]);
    expect(await incentivesPool.callStatic.paranetOperatorRewardPercentage()).to.be.equal(1_000);
    expect(await incentivesPool.callStatic.paranetIncentivizationProposalVotersRewardPercentage()).to.be.equal(500);
  });

  it('should update paranet name with opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    await Paranet.connect(accounts[101]).updateParanetMetadata(
      paranetKAStorageContract,
      paranetKATokenId,
      'Net Test Paranet Name',
      '',
    );

    const newName = await ParanetsRegistry.getName(paranetId);

    expect(newName).to.be.equal('Net Test Paranet Name');
  });

  it('should update paranet name emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    expect(
      await Paranet.connect(accounts[101]).updateParanetMetadata(
        paranetKAStorageContract,
        paranetKATokenId,
        'Net Test Paranet Name',
        '',
      ),
    ).to.emit(Paranet, 'ParanetMetadataUpdated');

    const newName = await ParanetsRegistry.getName(paranetId);

    expect(newName).to.be.equal('Net Test Paranet Name');
  });

  it('should revert update of paranet name with non opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetMetadata(
        paranetKAStorageContract,
        paranetKATokenId,
        '',
        'Net Test Paranet Description',
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should update paranet description with opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    await Paranet.connect(accounts[101]).updateParanetMetadata(
      paranetKAStorageContract,
      paranetKATokenId,
      '',
      'New Test Paranet Description',
    );

    const newDescription = await ParanetsRegistry.getDescription(paranetId);

    expect(newDescription).to.be.equal('New Test Paranet Description');
  });

  it('should update paranet description emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    await expect(
      Paranet.connect(accounts[101]).updateParanetMetadata(
        paranetKAStorageContract,
        paranetKATokenId,
        '',
        'Net Test Paranet Description',
      ),
    ).to.emit(Paranet, 'ParanetMetadataUpdated');
  });

  it('should revert update of paranet description with non opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetMetadata(
        paranetKAStorageContract,
        paranetKATokenId,
        '',
        'Net Test Paranet Description',
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should revert update of paranet description with non-operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetMetadata(
        paranetKAStorageContract,
        paranetKATokenId,
        '',
        accounts[102].address,
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should register paranet service', async () => {
    const { paranetServiceKATokenId, paranetServiceId } = await registerParanetService();
    const paranetServiceObject = await ParanetServicesRegistry.getParanetServiceMetadata(paranetServiceId);

    expect(paranetServiceObject.paranetServiceKAStorageContract).to.equal(ContentAssetStorageV2.address);
    expect(paranetServiceObject.paranetServiceKATokenId).to.equal(paranetServiceKATokenId);
    expect(paranetServiceObject.paranetServiceAddresses).to.deep.equal([accounts[51].address]);
    expect(paranetServiceObject.name).to.equal('Test Paranet Servic Name');
    expect(paranetServiceObject.description).to.equal('Test Paranet Servic Description');
  });

  it('should register paranet service emit event', async () => {
    const assetInputArgs = {
      assertionId: getHashFromNumber(1),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(accounts[103]).increaseAllowance(ServiceAgreementV1.address, assetInputArgs.tokenAmount);
    const tx = await ContentAssetV2.connect(accounts[103]).createAsset(assetInputArgs);
    const receipt = await tx.wait();

    const paranetServiceKAStorageContract = ContentAssetStorageV2.address;
    const paranetServiceKATokenId = Number(receipt.logs[0].topics[3]);

    await expect(
      Paranet.connect(accounts[103]).registerParanetService(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'Test Paranet Servic Name',
        'Test Paranet Servic Description',
        [accounts[51].address],
      ),
    ).to.emit(Paranet, 'ParanetServiceRegistered');
  });

  it('should update paranet service name operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();
    await Paranet.connect(accounts[103]).updateParanetServiceMetadata(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      'New Test Paranet Servic Name',
      '',
      [],
    );
    const newParanetServiceName = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(newParanetServiceName).to.equal('New Test Paranet Servic Name');
  });
  it('should revert paranet service name with non-operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    await expect(
      Paranet.connect(accounts[102]).updateParanetServiceMetadata(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'New Test Paranet Servic Name',
        '',
        [],
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should update paranet name with operator wallet emit event', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();
    expect(
      await Paranet.connect(accounts[103]).updateParanetServiceMetadata(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'New Test Paranet Servic Name',
        '',
        [],
      ),
    ).to.emit(Paranet, 'ParanetServiceMetadataUpdated');
  });

  it('should update paranet service description operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();
    await Paranet.connect(accounts[103]).updateParanetServiceMetadata(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      '',
      'New Test Paranet Servic Description',
      [],
    );
    const newParanetServiceDescription = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(newParanetServiceDescription).to.equal('New Test Paranet Servic Description');
  });

  it('should revert paranet service description update with non-operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    await expect(
      Paranet.connect(accounts[102]).updateParanetServiceMetadata(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        '',
        'New Test Paranet Servic Description',
        [],
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should update paranet description with operator wallet emit event', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();
    expect(
      await Paranet.connect(accounts[103]).updateParanetServiceMetadata(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        '',
        'New Test Paranet Servic Description',
        [],
      ),
    ).to.emit(Paranet, 'ParanetServiceMetadataUpdated');
  });

  it('should update paranet service addresses wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();
    await Paranet.connect(accounts[103]).updateParanetServiceMetadata(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      '',
      '',
      [accounts[49].address],
    );
    const newParanetServiceAddresses = await ParanetServicesRegistry.getParanetServiceAddresses(paranetServiceId);
    expect(newParanetServiceAddresses).to.deep.equal([accounts[49].address]);
  });

  it('should revert while updating paranet service addresses with non-operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    await expect(
      Paranet.connect(accounts[102]).updateParanetServiceMetadata(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        '',
        '',
        [accounts[49].address],
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should add paranet service to paranet with paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();

    const paranetServices: ParanetStructs.UniversalAssetLocatorStruct[] = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract,
        tokenId: paranetServiceKATokenId,
      },
    ];

    await Paranet.connect(accounts[103]).addParanetServices(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetServices,
    );

    const isServiceImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, paranetServiceId);

    expect(isServiceImplemented).to.be.equal(true);

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(1);
    expect(services[0]).to.be.equal(paranetServiceId);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(1);
  });
  it('should revert on add paranet service to paranet with not paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    const paranetServices: ParanetStructs.UniversalAssetLocatorStruct[] = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract,
        tokenId: paranetServiceKATokenId,
      },
    ];

    await expect(
      Paranet.connect(accounts[153]).addParanetServices(paranetKAStorageContract, paranetKATokenId, paranetServices),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });
  it('should revert on add paranet service that was already added to paranet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    const paranetServices: ParanetStructs.UniversalAssetLocatorStruct[] = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract,
        tokenId: paranetServiceKATokenId,
      },
    ];

    await Paranet.connect(accounts[103]).addParanetServices(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetServices,
    );

    await expect(
      Paranet.connect(accounts[103]).addParanetServices(paranetKAStorageContract, paranetKATokenId, paranetServices),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceHasAlreadyBeenAdded');
  });
  it('should revert on add non existing paranet service to paranet with paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3);

    const assetInputArgs = {
      assertionId: getHashFromNumber(1),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(accounts[103]).increaseAllowance(ServiceAgreementV1.address, assetInputArgs.tokenAmount);
    const tx = await ContentAssetV2.connect(accounts[103]).createAsset(assetInputArgs);
    const receipt = await tx.wait();

    const paranetServiceKAStorageContract = ContentAssetStorageV2.address;
    const paranetServiceKATokenId = Number(receipt.logs[0].topics[3]);

    const paranetServices: ParanetStructs.UniversalAssetLocatorStruct[] = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract,
        tokenId: paranetServiceKATokenId,
      },
    ];

    await expect(
      Paranet.connect(accounts[103]).addParanetServices(paranetKAStorageContract, paranetKATokenId, paranetServices),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceDoesntExist');
  });
  it('should add paranet service to paranet emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    const paranetServices: ParanetStructs.UniversalAssetLocatorStruct[] = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract,
        tokenId: paranetServiceKATokenId,
      },
    ];

    await expect(
      Paranet.connect(accounts[103]).addParanetServices(paranetKAStorageContract, paranetKATokenId, paranetServices),
    ).to.emit(Paranet, 'ParanetServiceAdded');
  });

  it('should add paranet services to paranet with paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract0,
      paranetServiceKATokenId: paranetServiceKATokenId0,
      paranetServiceId: paranetServiceId0,
    } = await registerParanetService(3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract1,
      paranetServiceKATokenId: paranetServiceKATokenId1,
      paranetServiceId: paranetServiceId1,
    } = await registerParanetService(3);

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract0,
        tokenId: paranetServiceKATokenId0,
      },
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract1,
        tokenId: paranetServiceKATokenId1,
      },
    ];
    await Paranet.connect(accounts[103]).addParanetServices(
      paranetKAStorageContract,
      paranetKATokenId,
      servicesToBeAdded,
    );

    const isService0Implemented = await ParanetsRegistry.isServiceImplemented(paranetId, paranetServiceId0);
    const isService1Implemented = await ParanetsRegistry.isServiceImplemented(paranetId, paranetServiceId1);

    expect(isService0Implemented).to.be.equal(true);
    expect(isService1Implemented).to.be.equal(true);

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(2);
    expect(services[0]).to.be.equal(paranetServiceId0);
    expect(services[1]).to.be.equal(paranetServiceId1);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(2);
  });

  it('should revert on add paranet services to paranet with not paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract0,
      paranetServiceKATokenId: paranetServiceKATokenId0,
    } = await registerParanetService(3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract1,
      paranetServiceKATokenId: paranetServiceKATokenId1,
    } = await registerParanetService(3);

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract0,
        tokenId: paranetServiceKATokenId0,
      },
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract1,
        tokenId: paranetServiceKATokenId1,
      },
    ];
    await expect(
      Paranet.connect(accounts[102]).addParanetServices(paranetKAStorageContract, paranetKATokenId, servicesToBeAdded),
    ).to.be.revertedWith("Caller isn't the owner of the KA");

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(0);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(0);
  });

  it('should revert on add paranet services that is already added to paranet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract0,
      paranetServiceKATokenId: paranetServiceKATokenId0,
    } = await registerParanetService(3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract1,
      paranetServiceKATokenId: paranetServiceKATokenId1,
    } = await registerParanetService(3);

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract0,
        tokenId: paranetServiceKATokenId0,
      },
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract1,
        tokenId: paranetServiceKATokenId1,
      },
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract0,
        tokenId: paranetServiceKATokenId0,
      },
    ];
    await expect(
      Paranet.connect(accounts[103]).addParanetServices(paranetKAStorageContract, paranetKATokenId, servicesToBeAdded),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceHasAlreadyBeenAdded');

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(0);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(0);
  });

  it('should revert on add non existing paranet services to paranet with paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract0,
      paranetServiceKATokenId: paranetServiceKATokenId0,
    } = await registerParanetService(3);

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract0,
        tokenId: paranetServiceKATokenId0,
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
    ];
    await expect(
      Paranet.connect(accounts[103]).addParanetServices(paranetKAStorageContract, paranetKATokenId, servicesToBeAdded),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceDoesntExist');

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(0);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(0);
  });
  it('should add paranet services to paranet emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract0,
      paranetServiceKATokenId: paranetServiceKATokenId0,
    } = await registerParanetService(3);
    const {
      paranetServiceKAStorageContract: paranetServiceKAStorageContract1,
      paranetServiceKATokenId: paranetServiceKATokenId1,
    } = await registerParanetService(3);

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract0,
        tokenId: paranetServiceKATokenId0,
      },
      {
        knowledgeAssetStorageContract: paranetServiceKAStorageContract1,
        tokenId: paranetServiceKATokenId1,
      },
    ];
    await expect(
      Paranet.connect(accounts[103]).addParanetServices(paranetKAStorageContract, paranetKATokenId, servicesToBeAdded),
    )
      .to.emit(Paranet, 'ParanetServiceAdded')
      .and.to.emit(Paranet, 'ParanetServiceAdded');
  });

  it('should mint knowledge asset & add it to paranet', async () => {
    await Token.connect(accounts[5]).increaseAllowance(ServiceAgreementV1.address, hre.ethers.utils.parseEther('315'));
    const {
      paranetKAStorageContract: paranetKAStorageContract0,
      paranetKATokenId: paranetKATokenId0,
      paranetId: paranetId0,
    } = await registerParanet(accounts, Paranet, 0, 0, 3);
    const {
      paranetKAStorageContract: paranetKAStorageContract1,
      paranetKATokenId: paranetKATokenId1,
      paranetId: paranetId1,
    } = await registerParanet(accounts, Paranet, 0, 0, 4);
    const assetInputArgs0 = {
      assertionId: getHashFromNumber(500),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };
    const assetInputArgs1 = {
      assertionId: getHashFromNumber(501),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };
    const assetInputArgs2 = {
      assertionId: getHashFromNumber(502),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    const tx1 = await Paranet.connect(accounts[5]).mintKnowledgeAsset(
      paranetKAStorageContract0,
      paranetKATokenId0,
      assetInputArgs0,
    );
    const receipt1 = await tx1.wait();
    const tokenId1 = Number(receipt1.logs[0].topics[3]);
    const tx2 = await Paranet.connect(accounts[5]).mintKnowledgeAsset(
      paranetKAStorageContract0,
      paranetKATokenId0,
      assetInputArgs1,
    );
    const receipt2 = await tx2.wait();
    const tokenId2 = Number(receipt2.logs[0].topics[3]);
    const tx3 = await Paranet.connect(accounts[5]).mintKnowledgeAsset(
      paranetKAStorageContract1,
      paranetKATokenId1,
      assetInputArgs2,
    );
    const receipt3 = await tx3.wait();
    const tokenId3 = Number(receipt3.logs[0].topics[3]);

    const knowledgeMinerMetadata = await ParanetKnowledgeMinersRegistry.getKnowledgeMinerMetadata(accounts[5].address);

    expect(knowledgeMinerMetadata.addr).to.be.equal(accounts[5].address);
    expect(knowledgeMinerMetadata.totalTracSpent).to.be.equal(hre.ethers.utils.parseEther('315'));
    expect(knowledgeMinerMetadata.totalSubmittedKnowledgeAssetsCount).to.be.equal(3);

    const submittedKnowledgeAsset0 = await ParanetKnowledgeMinersRegistry[
      'getSubmittedKnowledgeAssets(address,bytes32)'
    ](accounts[5].address, paranetId0);
    const submittedKnowledgeAsset1 = await ParanetKnowledgeMinersRegistry[
      'getSubmittedKnowledgeAssets(address,bytes32)'
    ](accounts[5].address, paranetId1);

    expect(submittedKnowledgeAsset0.length).to.be.equal(2);
    expect(submittedKnowledgeAsset1.length).to.be.equal(1);
    expect(submittedKnowledgeAsset0[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, tokenId1));
    expect(submittedKnowledgeAsset0[1]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, tokenId2));
    expect(submittedKnowledgeAsset1[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, tokenId3));

    const cumulativeTracSpent0 = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(
      accounts[5].address,
      paranetId0,
    );
    const cumulativeTracSpent1 = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(
      accounts[5].address,
      paranetId1,
    );

    expect(cumulativeTracSpent0).to.be.equal(hre.ethers.utils.parseEther('210'));
    expect(cumulativeTracSpent1).to.be.equal(hre.ethers.utils.parseEther('105'));

    const unrewardedTracSpent0 = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      accounts[5].address,
      paranetId0,
    );
    const unrewardedTracSpent1 = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      accounts[5].address,
      paranetId1,
    );

    expect(unrewardedTracSpent0).to.be.equal(hre.ethers.utils.parseEther('210'));
    expect(unrewardedTracSpent1).to.be.equal(hre.ethers.utils.parseEther('105'));

    const knowledgeAssets0 = await ParanetsRegistry.getKnowledgeAssets(paranetId0);
    const knowledgeAssets1 = await ParanetsRegistry.getKnowledgeAssets(paranetId1);

    expect(knowledgeAssets0.length).to.be.equal(2);
    expect(knowledgeAssets1.length).to.be.equal(1);
    expect(knowledgeAssets0[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, tokenId1));
    expect(knowledgeAssets0[1]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, tokenId2));
    expect(knowledgeAssets1[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, tokenId3));

    const cumulativeKnowledgeValue0 = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId0);
    const cumulativeKnowledgeValue1 = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId1);

    expect(cumulativeKnowledgeValue0).to.be.equal(hre.ethers.utils.parseEther('210'));
    expect(cumulativeKnowledgeValue1).to.be.equal(hre.ethers.utils.parseEther('105'));

    const isKnowledgeAssetRegistered1 = await ParanetsRegistry.isKnowledgeAssetRegistered(
      paranetId0,
      getknowledgeAssetId(ContentAssetStorageV2.address, tokenId1),
    );
    const isKnowledgeAssetRegistered2 = await ParanetsRegistry.isKnowledgeAssetRegistered(
      paranetId0,
      getknowledgeAssetId(ContentAssetStorageV2.address, tokenId2),
    );
    const isKnowledgeAssetRegistered3 = await ParanetsRegistry.isKnowledgeAssetRegistered(
      paranetId1,
      getknowledgeAssetId(ContentAssetStorageV2.address, tokenId3),
    );

    expect(isKnowledgeAssetRegistered1).to.be.equal(true);
    expect(isKnowledgeAssetRegistered2).to.be.equal(true);
    expect(isKnowledgeAssetRegistered3).to.be.equal(true);

    const knowledgeAssetsCount0 = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId0);
    const knowledgeAssetsCount1 = await ParanetsRegistry.getKnowledgeAssetsCount(paranetId1);

    expect(knowledgeAssetsCount0).to.be.equal(2);
    expect(knowledgeAssetsCount1).to.be.equal(1);

    const isKnowledgeMinerRegistered0 = await ParanetsRegistry.isKnowledgeMinerRegistered(
      paranetId0,
      accounts[5].address,
    );
    const isKnowledgeMinerRegistered1 = await ParanetsRegistry.isKnowledgeMinerRegistered(
      paranetId1,
      accounts[5].address,
    );

    expect(isKnowledgeMinerRegistered0).to.be.equal(true);
    expect(isKnowledgeMinerRegistered1).to.be.equal(true);

    expect(
      await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(
        getknowledgeAssetId(ContentAssetStorageV2.address, tokenId1),
      ),
    ).to.be.equal(true);
    expect(
      await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(
        getknowledgeAssetId(ContentAssetStorageV2.address, tokenId2),
      ),
    ).to.be.equal(true);
    expect(
      await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(
        getknowledgeAssetId(ContentAssetStorageV2.address, tokenId3),
      ),
    ).to.be.equal(true);
  });

  it("should revert mint knowledge asset & add it to paranet in paranet doesn't exist", async () => {
    const assetInputArgs0 = {
      assertionId: getHashFromNumber(500),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await expect(
      Paranet.connect(accounts[5]).mintKnowledgeAsset(accounts[3].address, getHashFromNumber(3), assetInputArgs0),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetDoesntExist');
  });

  it('should mint knowledge asset emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3);

    const assetInputArgs0 = {
      assertionId: getHashFromNumber(500),
      size: 3,
      triplesNumber: 1,
      chunksNumber: 1,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('105'),
      scoreFunctionId: 2,
      immutable_: false,
    };

    await Token.connect(accounts[103]).increaseAllowance(ServiceAgreementV1.address, assetInputArgs0.tokenAmount);

    await expect(
      Paranet.connect(accounts[103]).mintKnowledgeAsset(paranetKAStorageContract, paranetKATokenId, assetInputArgs0),
    )
      .to.emit(Paranet, 'KnowledgeAssetSubmittedToParanet')
      .and.to.emit(ContentAssetV2, 'AssetMinted')
      .and.to.emit(ServiceAgreementV1, 'ServiceAgreementV1Created');
  });

  it('should add and remove paranet curated nodes', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3);

    const identityId1 = await createProfile(accounts[11], accounts[1]);
    const identityId2 = await createProfile(accounts[12], accounts[1]);

    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [
        identityId1,
        identityId2,
      ]),
    )
      .to.emit(Paranet, 'ParanetCuratedNodeAdded')
      .withArgs(paranetKAStorageContract, paranetKATokenId, identityId1);

    const curatedNodesCount = await ParanetsRegistry.getCuratedNodesCount(paranetId);
    expect(curatedNodesCount).to.be.equal(2);

    await expect(
      Paranet.connect(accounts[103]).removeParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [
        identityId1,
      ]),
    )
      .to.emit(Paranet, 'ParanetCuratedNodeRemoved')
      .withArgs(paranetKAStorageContract, paranetKATokenId, identityId1);

    const curatedNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
    expect(curatedNodes.length).to.be.equal(1);
    expect(curatedNodes[0].identityId).to.be.equal(identityId2);
  });

  it('Should revert when trying to add a curated node to or remove a curated node from a paranet with OPEN nodes access policy', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 1, 3); // 0 for OPEN nodes policy

    const identityId = await createProfile(accounts[1], accounts[2]);

    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [identityId]),
    )
      .to.be.revertedWithCustomError(Paranet, 'InvalidParanetNodesAccessPolicy')
      .withArgs([1], 0); // 1 for CURATED, 0 for OPEN

    await expect(
      Paranet.connect(accounts[103]).removeParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [
        identityId,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'InvalidParanetNodesAccessPolicy')
      .withArgs([1], 0); // 1 for CURATED, 0 for OPEN
  });

  it('should revert when trying to add a curated node with a non-existent profile', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED nodes policy

    const nonExistentIdentityId = 999999; // Assuming this ID doesn't exist

    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [
        nonExistentIdentityId,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'ProfileDoesntExist')
      .withArgs(nonExistentIdentityId);
  });

  it('should revert when trying to add a curated node that has already been added', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED nodes policy

    const identityId = await createProfile(accounts[1], accounts[2]);

    // Add the node for the first time
    await Paranet.connect(accounts[103]).addParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [
      identityId,
    ]);

    // Try to add the same node again
    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [identityId]),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeHasAlreadyBeenAdded')
      .withArgs(paranetId, identityId);
  });

  it('should revert when trying to remove a non-existent curated node', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED nodes policy

    const nonExistentIdentityId = 999999; // Assuming this ID doesn't exist

    await expect(
      Paranet.connect(accounts[103]).removeParanetCuratedNodes(paranetKAStorageContract, paranetKATokenId, [
        nonExistentIdentityId,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeDoesntExist')
      .withArgs(paranetId, nonExistentIdentityId);
  });

  it('should request curated node access, approve and reject', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3);

    const identityId1 = await createProfile(accounts[11], accounts[1]);
    const identityId2 = await createProfile(accounts[12], accounts[1]);

    // node1 - request curated node access
    await expect(
      Paranet.connect(accounts[11]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId),
    )
      .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestCreated')
      .withArgs(paranetKAStorageContract, paranetKATokenId, identityId1);

    // approve curated node request for node1
    await expect(
      Paranet.connect(accounts[103]).approveCuratedNode(paranetKAStorageContract, paranetKATokenId, identityId1),
    )
      .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestAccepted')
      .withArgs(paranetKAStorageContract, paranetKATokenId, identityId1)
      .and.to.emit(Paranet, 'ParanetCuratedNodeAdded')
      .withArgs(paranetKAStorageContract, paranetKATokenId, identityId1);

    let curatedNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
    expect(curatedNodes.length).to.be.equal(1);
    expect(curatedNodes[0].identityId).to.be.equal(identityId1);

    // node2 - request curated node access
    await Paranet.connect(accounts[12]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId);

    // node2 - reject curated node request
    await expect(
      Paranet.connect(accounts[103]).rejectCuratedNode(paranetKAStorageContract, paranetKATokenId, identityId2),
    )
      .to.emit(Paranet, 'ParanetCuratedNodeJoinRequestRejected')
      .withArgs(paranetKAStorageContract, paranetKATokenId, identityId2);

    curatedNodes = await ParanetsRegistry.getCuratedNodes(paranetId);
    expect(curatedNodes.length).to.be.equal(1);
  });

  it('should revert when requesting curated node access for a paranet with OPEN nodes policy', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 0, 0, 3); // 0 for OPEN nodes policy

    await expect(
      Paranet.connect(accounts[1]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId),
    )
      .to.be.revertedWithCustomError(Paranet, 'InvalidParanetNodesAccessPolicy')
      .withArgs([1], 0); // 1 for CURATED, 0 for OPEN
  });

  it('should revert when requesting curated node access without a profile', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 1 for CURATED nodes policy

    await expect(
      Paranet.connect(accounts[99]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId),
    ).to.be.revertedWithCustomError(Paranet, 'ProfileDoesntExist');
  });

  it('should revert when requesting curated node access with a pending request', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 1 for CURATED nodes policy

    const nodeIdentityId = await createProfile(accounts[1], accounts[2]);

    await Paranet.connect(accounts[1]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId);

    await expect(
      Paranet.connect(accounts[1]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeJoinRequestInvalidStatus')
      .withArgs(paranetId, nodeIdentityId, 1); // 1 for PENDING status
  });

  it('should revert when approving a non-existent curated node join request', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 1 for CURATED nodes policy

    const nodeIdentityId = await createProfile(accounts[1], accounts[2]);

    await expect(
      Paranet.connect(accounts[103]).approveCuratedNode(paranetKAStorageContract, paranetKATokenId, nodeIdentityId),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeJoinRequestDoesntExist')
      .withArgs(paranetId, nodeIdentityId);
  });

  it('should revert when approving a curated node join request with invalid status', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 1 for CURATED nodes policy

    const nodeIdentityId = await createProfile(accounts[1], accounts[2]);

    await Paranet.connect(accounts[1]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId);

    await Paranet.connect(accounts[103]).approveCuratedNode(paranetKAStorageContract, paranetKATokenId, nodeIdentityId);

    await expect(
      Paranet.connect(accounts[103]).approveCuratedNode(paranetKAStorageContract, paranetKATokenId, nodeIdentityId),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeJoinRequestInvalidStatus')
      .withArgs(paranetId, nodeIdentityId, 2); // 2 for APPROVED status
  });

  it('should revert when rejecting a non-existent curated node join request', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 1 for CURATED nodes policy

    const nonExistentIdentityId = 999999; // Assuming this ID doesn't exist

    await expect(
      Paranet.connect(accounts[103]).rejectCuratedNode(
        paranetKAStorageContract,
        paranetKATokenId,
        nonExistentIdentityId,
      ),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeJoinRequestDoesntExist')
      .withArgs(paranetId, nonExistentIdentityId);
  });

  it('should revert when rejecting a curated node join request with invalid status', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 1 for CURATED nodes policy

    const nodeIdentityId = await createProfile(accounts[1], accounts[2]);

    await Paranet.connect(accounts[1]).requestParanetCuratedNodeAccess(paranetKAStorageContract, paranetKATokenId);

    await Paranet.connect(accounts[103]).rejectCuratedNode(paranetKAStorageContract, paranetKATokenId, nodeIdentityId);

    await expect(
      Paranet.connect(accounts[103]).rejectCuratedNode(paranetKAStorageContract, paranetKATokenId, nodeIdentityId),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedNodeJoinRequestInvalidStatus')
      .withArgs(paranetId, nodeIdentityId, 3); // 3 for REJECTED status
  });

  it('should add and remove paranet curated miners', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3);

    const miner1 = accounts[1];
    const miner2 = accounts[2];

    await Paranet.connect(accounts[103]).addParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
      miner1.address,
      miner2.address,
    ]);

    let knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);
    expect(knowledgeMiners.length).to.be.equal(2);
    expect(knowledgeMiners[0]).to.be.equal(miner1.address);

    await Paranet.connect(accounts[103]).removeParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
      miner1.address,
    ]);

    knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);
    expect(knowledgeMiners.length).to.be.equal(1);
    expect(knowledgeMiners[0]).to.be.equal(miner2.address);
  });

  it('should emit events when adding and removing a curated miner', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const minerAddress = accounts[3].address;

    // Test adding a curated miner
    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
        minerAddress,
      ]),
    )
      .to.emit(Paranet, 'ParanetCuratedMinerAdded')
      .withArgs(paranetKAStorageContract, paranetKATokenId, minerAddress);

    // Test removing a curated miner
    await expect(
      Paranet.connect(accounts[103]).removeParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
        minerAddress,
      ]),
    )
      .to.emit(Paranet, 'ParanetCuratedMinerRemoved')
      .withArgs(paranetKAStorageContract, paranetKATokenId, minerAddress);
  });

  it('Should revert when trying to add a curated miner to or remove a curated miner from a paranet with OPEN miners access policy', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 0 for OPEN miners policy

    const minerAddress = accounts[3].address;

    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
        minerAddress,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'InvalidParanetMinersAccessPolicy')
      .withArgs([1], 0); // 1 for CURATED, 0 for OPEN

    await expect(
      Paranet.connect(accounts[103]).removeParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
        minerAddress,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'InvalidParanetMinersAccessPolicy')
      .withArgs([1], 0); // 1 for CURATED, 0 for OPEN
  });

  it('should revert when trying to add a curated miner that has already been added', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const minerAddress = accounts[3].address;

    // Add the miner for the first time
    await Paranet.connect(accounts[103]).addParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
      minerAddress,
    ]);

    // Try to add the same miner again
    await expect(
      Paranet.connect(accounts[103]).addParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
        minerAddress,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerHasAlreadyBeenAdded')
      .withArgs(paranetId, minerAddress);
  });

  it('should revert when trying to remove a non-existent curated miner', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const nonExistentMinerAddress = accounts[99].address; // Assuming this address is not registered

    await expect(
      Paranet.connect(accounts[103]).removeParanetCuratedMiners(paranetKAStorageContract, paranetKATokenId, [
        nonExistentMinerAddress,
      ]),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerDoesntExist')
      .withArgs(paranetId, nonExistentMinerAddress);
  });

  it('should request curated miner access, approve and reject', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3);

    const miner1 = accounts[1];
    const miner2 = accounts[2];

    await expect(Paranet.connect(miner1).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId))
      .to.emit(Paranet, 'ParanetCuratedMinerAccessRequestCreated')
      .withArgs(paranetKAStorageContract, paranetKATokenId, miner1.address);

    // approve curated miner request for miner1
    await expect(
      Paranet.connect(accounts[103]).approveCuratedMiner(paranetKAStorageContract, paranetKATokenId, miner1.address),
    )
      .to.emit(Paranet, 'ParanetCuratedMinerAccessRequestAccepted')
      .withArgs(paranetKAStorageContract, paranetKATokenId, miner1.address)
      .and.to.emit(Paranet, 'ParanetCuratedMinerAdded')
      .withArgs(paranetKAStorageContract, paranetKATokenId, miner1.address);

    let knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);
    expect(knowledgeMiners.length).to.be.equal(1);
    expect(knowledgeMiners[0]).to.be.equal(miner1.address);

    // miner2 - request curated miner access
    await Paranet.connect(miner2).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId);

    // miner2 - reject curated miner request
    await expect(
      Paranet.connect(accounts[103]).rejectCuratedMiner(paranetKAStorageContract, paranetKATokenId, miner2.address),
    )
      .to.emit(Paranet, 'ParanetCuratedMinerAccessRequestRejected')
      .withArgs(paranetKAStorageContract, paranetKATokenId, miner2.address);

    knowledgeMiners = await ParanetsRegistry.getKnowledgeMiners(paranetId);
    expect(knowledgeMiners.length).to.be.equal(1);
  });

  // HERE
  it('should revert when requesting curated miner access for a paranet with OPEN miners policy', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1, 0, 3); // 0 for OPEN miners policy

    await expect(
      Paranet.connect(accounts[1]).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId),
    )
      .to.be.revertedWithCustomError(Paranet, 'InvalidParanetMinersAccessPolicy')
      .withArgs([1], 0); // 1 for CURATED, 0 for OPEN
  });

  it('should revert when requesting curated miner access with a pending request', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const miner = accounts[1];

    await Paranet.connect(miner).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId);

    await expect(Paranet.connect(miner).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId))
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerAccessRequestInvalidStatus')
      .withArgs(paranetId, miner.address, 1); // 1 for PENDING status
  });

  it('should revert when approving a non-existent curated miner access request', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const nonExistentMiner = accounts[99];

    await expect(
      Paranet.connect(accounts[103]).approveCuratedMiner(
        paranetKAStorageContract,
        paranetKATokenId,
        nonExistentMiner.address,
      ),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerAccessRequestDoesntExist')
      .withArgs(paranetId, nonExistentMiner.address);
  });

  it('should revert when approving a curated miner access request with invalid status', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const miner = accounts[1];

    await Paranet.connect(miner).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId);

    await Paranet.connect(accounts[103]).approveCuratedMiner(paranetKAStorageContract, paranetKATokenId, miner.address);

    await expect(
      Paranet.connect(accounts[103]).approveCuratedMiner(paranetKAStorageContract, paranetKATokenId, miner.address),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerAccessRequestInvalidStatus')
      .withArgs(paranetId, miner.address, 2); // 2 for APPROVED status
  });

  it('should revert when rejecting a non-existent curated miner access request', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const nonExistentMiner = accounts[99];

    await expect(
      Paranet.connect(accounts[103]).rejectCuratedMiner(
        paranetKAStorageContract,
        paranetKATokenId,
        nonExistentMiner.address,
      ),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerAccessRequestDoesntExist')
      .withArgs(paranetId, nonExistentMiner.address);
  });

  it('should revert when rejecting a curated miner access request with invalid status', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1, 1, 3); // 1 for CURATED miners policy

    const miner = accounts[1];

    await Paranet.connect(miner).requestParanetCuratedMinerAccess(paranetKAStorageContract, paranetKATokenId);

    await Paranet.connect(accounts[103]).rejectCuratedMiner(paranetKAStorageContract, paranetKATokenId, miner.address);

    await expect(
      Paranet.connect(accounts[103]).rejectCuratedMiner(paranetKAStorageContract, paranetKATokenId, miner.address),
    )
      .to.be.revertedWithCustomError(Paranet, 'ParanetCuratedMinerAccessRequestInvalidStatus')
      .withArgs(paranetId, miner.address, 3); // 3 for REJECTED status
  });

  async function registerParanet(
    accounts: SignerWithAddress[],
    Paranet: Paranet,
    nodesPolicy: number,
    minersPolicy: number,
    number: number,
  ) {
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
    // Make test that test different values for this
    const tracToNeuroEmissionMultiplier = 5;
    const paranetOperatorRewardPercentage = 1_000; // 10%
    const paranetIncentivizationProposalVotersRewardPercentage = 500; // 5%

    await Paranet.connect(accounts[100 + number]).registerParanet(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetName,
      paranetDescription,
      nodesPolicy,
      minersPolicy,
    );
    await ParanetIncentivesPoolFactory.connect(accounts[100 + number]).deployNeuroIncentivesPool(
      paranetKAStorageContract,
      paranetKATokenId,
      tracToNeuroEmissionMultiplier,
      paranetOperatorRewardPercentage,
      paranetIncentivizationProposalVotersRewardPercentage,
    );

    return {
      paranetKAStorageContract,
      paranetKATokenId,
      paranetId: hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['address', 'uint256'], [paranetKAStorageContract, paranetKATokenId]),
      ),
    };
  }

  async function registerParanetService(number = 3) {
    const assetInputArgs = {
      assertionId: getHashFromNumber(1),
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

    const paranetServiceKAStorageContract = ContentAssetStorageV2.address;
    const paranetServiceKATokenId = Number(receipt.logs[0].topics[3]);

    await Paranet.connect(accounts[100 + number]).registerParanetService(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      [accounts[51].address],
    );

    return {
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      paranetServiceId: hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(
          ['address', 'uint256'],
          [paranetServiceKAStorageContract, paranetServiceKATokenId],
        ),
      ),
    };
  }

  function getHashFromNumber(number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
  }

  function getknowledgeAssetId(address: string, number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['address', 'uint256'], [address, number]));
  }
});
