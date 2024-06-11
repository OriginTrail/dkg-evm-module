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
  HashingProxy: HashingProxy;
  ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  Token: Token;
  ServiceAgreementV1: ServiceAgreementV1;
};

describe('@v2 @unit ParanetKnowledgeMinersRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let Paranet: Paranet;
  let HubController: HubController;
  let ContentAssetV2: ContentAssetV2;
  let ContentAssetStorageV2: ContentAssetStorageV2;
  let ParanetsRegistry: ParanetsRegistry;
  let ParanetServicesRegistry: ParanetServicesRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;
  let HashingProxy: HashingProxy;
  let ServiceAgreementStorageProxy: ServiceAgreementStorageProxy;
  let Token: Token;
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
        'HashingProxy',
        'ServiceAgreementStorageProxy',
        'Token',
        'ServiceAgreementV1',
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
    ServiceAgreementStorageProxy = await hre.ethers.getContract<ServiceAgreementStorageProxy>(
      'ServiceAgreementStorageProxy',
    );
    HashingProxy = await hre.ethers.getContract<HashingProxy>('HashingProxy');
    Token = await hre.ethers.getContract<Token>('Token');
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
      HashingProxy,
      ServiceAgreementStorageProxy,
      Token,
      ServiceAgreementV1,
    };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Paranet } = await loadFixture(deployParanetFixture));
  });

  it('The contract is named "Paranet"', async () => {
    expect(await Paranet.name()).to.equal('Paranet');
  });

  it('The contract is version "2.1.0"', async () => {
    expect(await Paranet.version()).to.equal('2.1.0');
  });

  it('should register paranet', async () => {
    const { paranetId } = await registerParanet(accounts, Paranet, 1);

    const paranetExists = await ParanetsRegistry.paranetExists(paranetId);

    expect(paranetExists).to.equal(true);
  });

  it('should not register paranet that is already registered', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    const paranetExists = await ParanetsRegistry.paranetExists(paranetId);

    expect(paranetExists).to.equal(true);

    const paranetName = 'Test paranet 1';
    const paranetDescription = 'Description of Test Paranet';
    const tracToNeuroEmissionMultiplier = 5;
    const paranetOperatorRewardPercentage = 1_000; // 10%
    const paranetIncentivizationProposalVotersRewardPercentage = 500; // 5%

    await expect(
      Paranet.connect(accounts[101]).registerParanet(
        paranetKAStorageContract,
        paranetKATokenId,
        paranetName,
        paranetDescription,
        tracToNeuroEmissionMultiplier,
        paranetOperatorRewardPercentage,
        paranetIncentivizationProposalVotersRewardPercentage,
      ),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetHasAlreadyBeenRegistered');
  });

  it('should register paranet emit ParanetRegistered event', async () => {
    expect(await registerParanet(accounts, Paranet, 1)).to.emit(Paranet, 'ParanetRegistered');
  });

  it('should register paranet will correctly intitalized incentives pool', async () => {
    const { paranetId } = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolAddress = await ParanetsRegistry.getIncentivesPoolAddress(paranetId, 'Neuroweb');
    const incentivesPoolABI = hre.helpers.getAbi('ParanetNeuroIncentivesPool');
    const incentivesPool = await hre.ethers.getContractAt<ParanetNeuroIncentivesPool>(
      incentivesPoolABI,
      incentivesPoolAddress,
    );

    expect(await incentivesPool.callStatic.parentParanetId()).to.be.equal(paranetId);
    expect(await incentivesPool.callStatic.neuroEmissionMultipliers(0)).to.be.deep.equal([
      5,
      (await hre.ethers.provider.getBlock('latest')).timestamp,
      true,
    ]);
    expect(await incentivesPool.callStatic.paranetOperatorRewardPercentage()).to.be.equal(1_000);
    expect(await incentivesPool.callStatic.paranetIncentivizationProposalVotersRewardPercentage()).to.be.equal(500);
  });

  it('should update paranet name with opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    await Paranet.connect(accounts[101]).updateParanetName(
      paranetKAStorageContract,
      paranetKATokenId,
      'Net Test Paranet Name',
    );

    const newName = await ParanetsRegistry.getName(paranetId);

    expect(newName).to.be.equal('Net Test Paranet Name');
  });

  it('should update paranet name emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    expect(
      await Paranet.connect(accounts[101]).updateParanetName(
        paranetKAStorageContract,
        paranetKATokenId,
        'Net Test Paranet Name',
      ),
    ).to.emit(Paranet, 'ParanetNameUpdated');

    const newName = await ParanetsRegistry.getName(paranetId);

    expect(newName).to.be.equal('Net Test Paranet Name');
  });

  it('should revert update of paranet name with non opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetDescription(
        paranetKAStorageContract,
        paranetKATokenId,
        'Net Test Paranet Description',
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should update paranet description with opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 1);

    await Paranet.connect(accounts[101]).updateParanetDescription(
      paranetKAStorageContract,
      paranetKATokenId,
      'New Test Paranet Description',
    );

    const newDescription = await ParanetsRegistry.getDescription(paranetId);

    expect(newDescription).to.be.equal('New Test Paranet Description');
  });

  it('should update paranet description emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[101]).updateParanetDescription(
        paranetKAStorageContract,
        paranetKATokenId,
        'Net Test Paranet Description',
      ),
    ).to.emit(Paranet, 'ParanetDescriptionUpdated');
  });

  it('should revert update of paranet description with non opertor wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetDescription(
        paranetKAStorageContract,
        paranetKATokenId,
        'Net Test Paranet Description',
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should revert update of paranet description with non-operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetDescription(
        paranetKAStorageContract,
        paranetKATokenId,
        accounts[102].address,
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });

  it('should register paranet service', async () => {
    const { paranetServiceId } = await registerParanetService();
    const paranetServiceObject = await ParanetServicesRegistry.getParanetServiceMetadata(paranetServiceId);

    expect(paranetServiceObject.paranetServiceKAStorageContract).to.equal(accounts[50].address);
    expect(paranetServiceObject.paranetServiceKATokenId).to.equal(getHashFromNumber(50));
    expect(paranetServiceObject.paranetServiceAddresses).to.deep.equal([accounts[51].address]);
    expect(paranetServiceObject.name).to.equal('Test Paranet Servic Name');
    expect(paranetServiceObject.description).to.equal('Test Paranet Servic Description');
  });

  it('should register paranet service emit event', async () => {
    await expect(registerParanetService()).to.emit(Paranet, 'ParanetServiceRegistered');
  });

  it('should update paranet service name operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();
    await Paranet.connect(accounts[5]).updateParanetServiceName(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      'New Test Paranet Servic Name',
    );
    const newParanetServiceName = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(newParanetServiceName).to.equal('New Test Paranet Servic Name');
  });
  it('should update paranet service name emit event', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceName(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'New Test Paranet Servic Name',
      ),
    ).to.revertedWith("Caller isn't the owner of the KA");
  });

  it('should revert update paranet name with non operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();
    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceName(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'New Test Paranet Servic Name',
      ),
    ).to.emit(Paranet, 'ParanetServiceNameUpdated');
  });

  it('should update paranet service description operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();
    await Paranet.connect(accounts[5]).updateParanetServiceDescription(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      'New Test Paranet Servic Description',
    );
    const newParanetServiceDescription = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(newParanetServiceDescription).to.equal('New Test Paranet Servic Description');
  });

  it('should update paranet service description emit event', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceDescription(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'New Test Paranet Servic Description',
      ),
    ).to.revertedWith("Caller isn't the owner of the KA");
  });

  it('should revert update paranet description with non operator wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();
    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceDescription(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        'New Test Paranet Servic Description',
      ),
    ).to.emit(Paranet, 'ParanetServiceDescriptionUpdated');
  });

  it('should update paranet service addresses wallet', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();
    await Paranet.connect(accounts[5]).updateParanetServiceAddresses(
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
      [accounts[49].address],
    );
    const newParanetServiceAddresses = await ParanetServicesRegistry.getParanetServiceAddresses(paranetServiceId);
    expect(newParanetServiceAddresses).to.deep.equal([accounts[49].address]);
  });

  it('should update paranet service addresses emit event', async () => {
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceAddresses(
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
        [accounts[49].address],
      ),
    ).to.revertedWith("Caller isn't the owner of the KA");
  });

  it('should add paranet service to paranet with paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId, paranetId } = await registerParanet(accounts, Paranet, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId, paranetServiceId } =
      await registerParanetService();

    await Paranet.connect(accounts[103]).addParanetService(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
    );

    const isServiceImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, paranetServiceId);

    expect(isServiceImplemented).to.be.equal(true);

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(1);
    expect(services[0]).to.be.equal(paranetServiceId);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(1);
  });
  it('should revert on add paranet service to paranet with not paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    await expect(
      Paranet.connect(accounts[153]).addParanetService(
        paranetKAStorageContract,
        paranetKATokenId,
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
      ),
    ).to.be.revertedWith("Caller isn't the owner of the KA");
  });
  it('should revert on add paranet service that was already added to paranet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();

    await Paranet.connect(accounts[103]).addParanetService(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetServiceKAStorageContract,
      paranetServiceKATokenId,
    );

    await expect(
      Paranet.connect(accounts[103]).addParanetService(
        paranetKAStorageContract,
        paranetKATokenId,
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
      ),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceHasAlreadyBeenAdded');
  });
  it('should revert on add non existing paranet service to paranet with paranet operator wallet', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 3);
    await expect(
      Paranet.connect(accounts[103]).addParanetService(
        paranetKAStorageContract,
        paranetKATokenId,
        accounts[50].address,
        getHashFromNumber(50),
      ),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceDoesntExist');
  });
  it('should add paranet service to paranet emit event', async () => {
    const { paranetKAStorageContract, paranetKATokenId } = await registerParanet(accounts, Paranet, 3);
    const { paranetServiceKAStorageContract, paranetServiceKATokenId } = await registerParanetService();
    await expect(
      Paranet.connect(accounts[103]).addParanetService(
        paranetKAStorageContract,
        paranetKATokenId,
        paranetServiceKAStorageContract,
        paranetServiceKATokenId,
      ),
    ).to.emit(Paranet, 'ParanetServiceAdded');
  });

  it('should add paranet services to paranet with paranet operator wallet', async () => {
    const { paranetId } = await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name 0',
      'Test Paranet Servic Description 0',
      [accounts[51].address],
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      [accounts[51].address],
    );
    const paranetServiceId0 = getId(accounts[50].address, 50);
    const paranetServiceId1 = getId(accounts[50].address, 56);

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(50),
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
    ];
    await Paranet.connect(accounts[103]).addParanetServices(
      accounts[3].address,
      getHashFromNumber(3),
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
    const paranetId = await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name 0',
      'Test Paranet Servic Description 0',
      [accounts[51].address],
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      [accounts[51].address],
    );

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(50),
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
    ];
    await expect(
      Paranet.connect(accounts[105]).addParanetServices(accounts[3].address, getHashFromNumber(3), servicesToBeAdded),
    ).to.revertedWith("Caller isn't the owner of the KA");

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(0);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(0);
  });

  it('should revert on add paranet services that is already added to paranet', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name 0',
      'Test Paranet Servic Description 0',
      [accounts[51].address],
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      [accounts[51].address],
    );

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(50),
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
    ];
    await expect(
      Paranet.connect(accounts[103]).addParanetServices(accounts[3].address, getHashFromNumber(3), servicesToBeAdded),
    ).to.revertedWithCustomError(Paranet, 'ParanetServiceHasAlreadyBeenAdded');

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(0);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(0);
  });

  it('should revert on add non existing paranet services to paranet with paranet operator wallet', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name 0',
      'Test Paranet Servic Description 0',
      [accounts[51].address],
    );

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(50),
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
    ];
    await expect(
      Paranet.connect(accounts[103]).addParanetServices(accounts[3].address, getHashFromNumber(3), servicesToBeAdded),
    ).to.revertedWithCustomError(Paranet, 'ParanetServiceDoesntExist');

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(0);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(0);
  });
  it('should add paranet services to paranet emit event', async () => {
    await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name 0',
      'Test Paranet Servic Description 0',
      [accounts[51].address],
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      [accounts[51].address],
    );

    const servicesToBeAdded = [
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(50),
      },
      {
        knowledgeAssetStorageContract: accounts[50].address,
        tokenId: getHashFromNumber(56),
      },
    ];
    await expect(
      Paranet.connect(accounts[103]).addParanetServices(accounts[3].address, getHashFromNumber(3), servicesToBeAdded),
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
    } = await registerParanet(accounts, Paranet, 3);
    const {
      paranetKAStorageContract: paranetKAStorageContract1,
      paranetKATokenId: paranetKATokenId1,
      paranetId: paranetId1,
    } = await registerParanet(accounts, Paranet, 4);
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

    await Paranet.connect(accounts[5]).mintKnowledgeAsset(
      paranetKAStorageContract0,
      paranetKATokenId0,
      assetInputArgs0,
    );
    await Paranet.connect(accounts[5]).mintKnowledgeAsset(
      paranetKAStorageContract0,
      paranetKATokenId0,
      assetInputArgs1,
    );
    await Paranet.connect(accounts[5]).mintKnowledgeAsset(
      paranetKAStorageContract1,
      paranetKATokenId1,
      assetInputArgs2,
    );

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
    expect(submittedKnowledgeAsset0[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, 1));
    expect(submittedKnowledgeAsset0[1]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, 2));
    expect(submittedKnowledgeAsset1[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, 3));

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
    expect(knowledgeAssets0[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, 1));
    expect(knowledgeAssets0[1]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, 2));
    expect(knowledgeAssets1[0]).to.be.equal(getknowledgeAssetId(ContentAssetStorageV2.address, 3));

    const cumulativeKnowledgeValue0 = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId0);
    const cumulativeKnowledgeValue1 = await ParanetsRegistry.getCumulativeKnowledgeValue(paranetId1);

    expect(cumulativeKnowledgeValue0).to.be.equal(hre.ethers.utils.parseEther('210'));
    expect(cumulativeKnowledgeValue1).to.be.equal(hre.ethers.utils.parseEther('105'));

    const isKnowledgeAssetRegistered1 = await ParanetsRegistry.isKnowledgeAssetRegistered(
      paranetId0,
      getknowledgeAssetId(ContentAssetStorageV2.address, 1),
    );
    const isKnowledgeAssetRegistered2 = await ParanetsRegistry.isKnowledgeAssetRegistered(
      paranetId0,
      getknowledgeAssetId(ContentAssetStorageV2.address, 2),
    );
    const isKnowledgeAssetRegistered3 = await ParanetsRegistry.isKnowledgeAssetRegistered(
      paranetId1,
      getknowledgeAssetId(ContentAssetStorageV2.address, 3),
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
        getknowledgeAssetId(ContentAssetStorageV2.address, 1),
      ),
    ).to.be.equal(true);
    expect(
      await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(
        getknowledgeAssetId(ContentAssetStorageV2.address, 2),
      ),
    ).to.be.equal(true);
    expect(
      await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(
        getknowledgeAssetId(ContentAssetStorageV2.address, 3),
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
    await Token.connect(accounts[5]).increaseAllowance(ServiceAgreementV1.address, hre.ethers.utils.parseEther('315'));
    await registerParanet(accounts, Paranet, 3);

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
    )
      .to.emit(Paranet, 'KnowledgeAssetSubmittedToParanet')
      .and.to.emit(ContentAssetV2, 'AssetMinted')
      .and.to.emit(ServiceAgreementV1, 'ServiceAgreementV1Created');
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
    // Make test that test different values for this
    const tracToNeuroEmissionMultiplier = 5;
    const paranetOperatorRewardPercentage = 1_000; // 10%
    const paranetIncentivizationProposalVotersRewardPercentage = 500; // 5%

    await Paranet.connect(accounts[100 + number]).registerParanet(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetName,
      paranetDescription,
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

  async function registerParanetService() {
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

    await Token.connect(accounts[101]).increaseAllowance(ServiceAgreementV1.address, assetInputArgs.tokenAmount);
    const tx = await ContentAssetV2.connect(accounts[101]).createAsset(assetInputArgs);
    const receipt = await tx.wait();

    const paranetServiceKAStorageContract = ContentAssetV2.address;
    const paranetServiceKATokenId = Number(receipt.logs[0].topics[3]);

    await Paranet.connect(accounts[101]).registerParanetService(
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

  function getId(address: string, number: number) {
    return hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [address, getHashFromNumber(number)]),
    );
  }
  function getknowledgeAssetId(address: string, number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['address', 'uint256'], [address, number]));
  }
});
