import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

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
  ParanetIncentivesPool,
  Token,
  ServiceAgreementV1,
} from '../../../typechain';
import {} from '../../helpers/constants';

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

  it('The contract is version "2.0.0"', async () => {
    expect(await Paranet.version()).to.equal('2.0.0');
  });

  it('should register paranet', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 1);

    const paranetExists = await ParanetsRegistry.paranetExists(paranetId);

    expect(paranetExists).to.equal(true);
  });

  it('should not register paranet that is already registered', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 1);

    const paranetExists = await ParanetsRegistry.paranetExists(paranetId);

    expect(paranetExists).to.equal(true);

    await expect(registerParanet(accounts, Paranet, 1)).to.be.revertedWithCustomError(
      Paranet,
      'ParanetHasAlreadyBeenRegistered',
    );
  });

  it('should register paranet emit ParanetRegistered event', async () => {
    expect(await registerParanet(accounts, Paranet, 1)).to.emit(Paranet, 'ParanetRegistered');
  });

  it('should register paranet will correctly intitalized incentives pool', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 1);

    const incentivesPoolAddress = await ParanetsRegistry.getIncentivesPoolAddress(paranetId);
    const incentivesPoolABI = hre.helpers.getAbi('ParanetIncentivesPool');
    const incentivesPool = await hre.ethers.getContractAt<ParanetIncentivesPool>(
      incentivesPoolABI,
      incentivesPoolAddress,
    );

    expect(await incentivesPool.callStatic.parentParanetId()).to.be.equal(paranetId);
    expect(await incentivesPool.callStatic.tracToNeuroRatio()).to.be.equal(5);
    expect(await incentivesPool.callStatic.tracTarget()).to.be.equal(10_000);
    expect(await incentivesPool.callStatic.operatorRewardPercentage()).to.be.equal(5);
  });

  it('should update paranet name with opertor wallet', async () => {
    const paranetId1 = await registerParanet(accounts, Paranet, 1);

    await Paranet.connect(accounts[101]).updateParanetName(
      accounts[1].address,
      getHashFromNumber(1),
      'Net Test Paranet Name',
    );

    const newName = await ParanetsRegistry.getName(paranetId1);

    expect(newName).to.be.equal('Net Test Paranet Name');
  });

  it('should update paranet name emit event', async () => {
    const paranetId1 = await registerParanet(accounts, Paranet, 1);

    expect(
      await Paranet.connect(accounts[101]).updateParanetName(
        accounts[1].address,
        getHashFromNumber(1),
        'Net Test Paranet Name',
      ),
    ).to.emit(Paranet, 'ParanetNameUpdated');

    const newName = await ParanetsRegistry.getName(paranetId1);

    expect(newName).to.be.equal('Net Test Paranet Name');
  });

  it('should rewert update of paranet name with non opertor wallet', async () => {
    await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetDescription(
        accounts[1].address,
        getHashFromNumber(1),
        'Net Test Paranet Description',
      ),
    ).to.be.revertedWith('Fn can only be used by operator');
  });

  it('should update paranet description with opertor wallet', async () => {
    const paranetId1 = await registerParanet(accounts, Paranet, 1);

    await Paranet.connect(accounts[101]).updateParanetDescription(
      accounts[1].address,
      getHashFromNumber(1),
      'New Test Paranet Description',
    );

    const newDescription = await ParanetsRegistry.getDescription(paranetId1);

    expect(newDescription).to.be.equal('New Test Paranet Description');
  });

  it('should update paranet description emit event', async () => {
    await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[101]).updateParanetDescription(
        accounts[1].address,
        getHashFromNumber(1),
        'Net Test Paranet Description',
      ),
    ).to.emit(Paranet, 'ParanetDescriptionUpdated');
  });

  it('should rewert update of paranet description with non opertor wallet', async () => {
    await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetDescription(
        accounts[1].address,
        getHashFromNumber(1),
        'Net Test Paranet Description',
      ),
    ).to.be.revertedWith('Fn can only be used by operator');
  });
  it('should transfer paranet ownership with opertor wallet', async () => {
    const paranetId1 = await registerParanet(accounts, Paranet, 1);

    await Paranet.connect(accounts[101]).transferParanetOwnership(
      accounts[1].address,
      getHashFromNumber(1),
      accounts[102].address,
    );

    const newOperator = await ParanetsRegistry.getOperatorAddress(paranetId1);

    expect(newOperator).to.be.equal(accounts[102].address);
  });

  it('should transfer paranet ownership operator emit event', async () => {
    await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[101]).transferParanetOwnership(
        accounts[1].address,
        getHashFromNumber(1),
        accounts[102].address,
      ),
    ).to.emit(Paranet, 'ParanetOwnershipTransferred');
  });

  it('should rewert transfer of paranet ownership with non opertor wallet', async () => {
    await registerParanet(accounts, Paranet, 1);

    await expect(
      Paranet.connect(accounts[201]).updateParanetDescription(
        accounts[1].address,
        getHashFromNumber(1),
        accounts[102].address,
      ),
    ).to.be.revertedWith('Fn can only be used by operator');
  });

  it('should register paranet service', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    const paranetServiceId = getId(accounts[50].address, 50);
    const paranetServiceObject = await ParanetServicesRegistry.getParanetServiceObject(paranetServiceId);

    expect(paranetServiceObject.paranetServiceKAStorageContract).to.equal(accounts[50].address);
    expect(paranetServiceObject.paranetServiceKATokenId).to.equal(getHashFromNumber(50));
    expect(paranetServiceObject.operator).to.equal(accounts[5].address);
    expect(paranetServiceObject.worker).to.equal(accounts[51].address);
    expect(paranetServiceObject.name).to.equal('Test Paranet Servic Name');
    expect(paranetServiceObject.description).to.equal('Test Paranet Servic Description');
  });

  it('should register paranet service emit event', async () => {
    await expect(
      Paranet.connect(accounts[5]).registerParanetService(
        accounts[50].address,
        getHashFromNumber(50),
        'Test Paranet Servic Name',
        'Test Paranet Servic Description',
        accounts[51].address,
      ),
    ).to.emit(Paranet, 'ParanetServiceRegistered');
  });

  it('should transfer paranet service ownership operator wiht operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    Paranet.connect(accounts[5]).transferParanetServiceOwnership(
      accounts[50].address,
      getHashFromNumber(50),
      accounts[500].address,
    );

    const paranetServiceId = getId(accounts[50].address, 50);
    const newOperator = await ParanetServicesRegistry.getOperatorAddress(paranetServiceId);

    expect(newOperator).to.be.equal(accounts[500].address);
  });

  it('should transfer paranet service ownership operator emit event', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    await expect(
      Paranet.connect(accounts[5]).transferParanetServiceOwnership(
        accounts[50].address,
        getHashFromNumber(50),
        accounts[500].address,
      ),
    ).to.emit(Paranet, 'ParanetServiceOwnershipTransferred');
  });

  it('should revert transfer paranet service ownership operator with non operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    await expect(
      Paranet.connect(accounts[6]).transferParanetServiceOwnership(
        accounts[50].address,
        getHashFromNumber(50),
        accounts[500].address,
      ),
    ).to.be.revertedWith('Fn can only be used by operator');
  });

  it('should update paranet service name operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    await Paranet.connect(accounts[5]).updateParanetServiceName(
      accounts[50].address,
      getHashFromNumber(50),
      'New Test Paranet Servic Name',
    );
    const paranetServiceId = getId(accounts[50].address, 50);
    const newParanetServiceName = await ParanetServicesRegistry.getName(paranetServiceId);

    expect(newParanetServiceName).to.equal('New Test Paranet Servic Name');
  });
  it('should update paranet service name emit event', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceName(
        accounts[50].address,
        getHashFromNumber(50),
        'New Test Paranet Servic Name',
      ),
    ).to.revertedWith('Fn can only be used by operator');
  });

  it('should revert update paranet name with non operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceName(
        accounts[50].address,
        getHashFromNumber(50),
        'New Test Paranet Servic Name',
      ),
    ).to.emit(Paranet, 'ParanetServiceNameUpdated');
  });

  it('should update paranet service description operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    await Paranet.connect(accounts[5]).updateParanetServiceDescription(
      accounts[50].address,
      getHashFromNumber(50),
      'New Test Paranet Servic Description',
    );
    const paranetServiceId = getId(accounts[50].address, 50);
    const newParanetServiceDescription = await ParanetServicesRegistry.getDescription(paranetServiceId);

    expect(newParanetServiceDescription).to.equal('New Test Paranet Servic Description');
  });

  it('should update paranet service description emit event', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceDescription(
        accounts[50].address,
        getHashFromNumber(50),
        'New Test Paranet Servic Description',
      ),
    ).to.revertedWith('Fn can only be used by operator');
  });

  it('should revert update paranet description with non operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceDescription(
        accounts[50].address,
        getHashFromNumber(50),
        'New Test Paranet Servic Description',
      ),
    ).to.emit(Paranet, 'ParanetServiceDescriptionUpdated');
  });

  it('should update paranet service worker operator wallet', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    await Paranet.connect(accounts[5]).updateParanetServiceWorker(
      accounts[50].address,
      getHashFromNumber(50),
      accounts[49].address,
    );
    const paranetServiceId = getId(accounts[50].address, 50);
    const newParanetServiceWorker = await ParanetServicesRegistry.getWorkerAddress(paranetServiceId);
    expect(newParanetServiceWorker).to.equal(accounts[49].address);
  });

  it('should update paranet service worker emit event', async () => {
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    expect(
      await Paranet.connect(accounts[5]).updateParanetServiceWorker(
        accounts[50].address,
        getHashFromNumber(50),
        accounts[49].address,
      ),
    ).to.revertedWith('Fn can only be used by operator');
  });

  it('should add paranet service to paranet with paranet operator wallet', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    const paranetServiceId = getId(accounts[50].address, 50);

    await Paranet.connect(accounts[103]).addParanetService(
      accounts[3].address,
      getHashFromNumber(3),
      accounts[50].address,
      getHashFromNumber(50),
    );

    const isServiceImplemented = await ParanetsRegistry.isServiceImplemented(paranetId, paranetServiceId);

    expect(isServiceImplemented).to.be.equal(true);

    const services = await ParanetsRegistry.getServices(paranetId);

    expect(services.length).to.be.equal(1);
    expect(services[0]).to.be.equal(paranetServiceId);
    expect(await ParanetsRegistry.getServicesCount(paranetId)).to.be.equal(1);
  });
  it('should revert on add paranet service to paranet with not paranet operator wallet', async () => {
    await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    await expect(
      Paranet.connect(accounts[153]).addParanetService(
        accounts[3].address,
        getHashFromNumber(3),
        accounts[50].address,
        getHashFromNumber(50),
      ),
    ).to.be.revertedWith('Fn can only be used by operator');
  });
  it('should revert on add paranet service that was already added to paranet', async () => {
    await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[103]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );

    Paranet.connect(accounts[103]).addParanetService(
      accounts[3].address,
      getHashFromNumber(3),
      accounts[50].address,
      getHashFromNumber(50),
    );

    await expect(
      Paranet.connect(accounts[103]).addParanetService(
        accounts[3].address,
        getHashFromNumber(3),
        accounts[50].address,
        getHashFromNumber(50),
      ),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceHasAlreadyBeenAdded');
  });
  it('should revert on add non existing paranet service to paranet with paranet operator wallet', async () => {
    await registerParanet(accounts, Paranet, 3);
    await expect(
      Paranet.connect(accounts[103]).addParanetService(
        accounts[3].address,
        getHashFromNumber(3),
        accounts[50].address,
        getHashFromNumber(50),
      ),
    ).to.be.revertedWithCustomError(Paranet, 'ParanetServiceDoesntExist');
  });
  it('should add paranet service to paranet emit event', async () => {
    await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name',
      'Test Paranet Servic Description',
      accounts[51].address,
    );
    await expect(
      Paranet.connect(accounts[103]).addParanetService(
        accounts[3].address,
        getHashFromNumber(3),
        accounts[50].address,
        getHashFromNumber(50),
      ),
    ).to.emit(Paranet, 'ParanetServiceAdded');
  });

  it('should add paranet services to paranet with paranet operator wallet', async () => {
    const paranetId = await registerParanet(accounts, Paranet, 3);
    await Paranet.connect(accounts[5]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(50),
      'Test Paranet Servic Name 0',
      'Test Paranet Servic Description 0',
      accounts[51].address,
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      accounts[51].address,
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
      accounts[51].address,
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      accounts[51].address,
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
    ).to.revertedWith('Fn can only be used by operator');

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
      accounts[51].address,
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      accounts[51].address,
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
      accounts[51].address,
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
      accounts[51].address,
    );
    await Paranet.connect(accounts[6]).registerParanetService(
      accounts[50].address,
      getHashFromNumber(56),
      'Test Paranet Servic Name 1',
      'Test Paranet Servic Description 1',
      accounts[51].address,
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
    const paranetId0 = await registerParanet(accounts, Paranet, 3);
    const paranetId1 = await registerParanet(accounts, Paranet, 4);
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

    await Paranet.connect(accounts[5]).mintKnowledgeAsset(accounts[3].address, getHashFromNumber(3), assetInputArgs0);
    await Paranet.connect(accounts[5]).mintKnowledgeAsset(accounts[3].address, getHashFromNumber(3), assetInputArgs1);
    await Paranet.connect(accounts[5]).mintKnowledgeAsset(accounts[4].address, getHashFromNumber(4), assetInputArgs2);

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
    const paranetKAStorageContract = accounts[number].address;
    const paranetKATokenId = getHashFromNumber(number);
    const paranetName = 'Test paranet 1';
    const paranetDescription = 'Description of Test Paranet';
    // Make test that test different values for this
    const tracToNeuroRatio = 5;
    const tracTarget = 10_000;
    const operatorRewardPercentage = 5;

    const accSignerParanet = Paranet.connect(accounts[100 + number]);

    await accSignerParanet.registerParanet(
      paranetKAStorageContract,
      paranetKATokenId,
      paranetName,
      paranetDescription,
      tracToNeuroRatio,
      tracTarget,
      operatorRewardPercentage,
    );

    return hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'uint256'], [paranetKAStorageContract, paranetKATokenId]),
    );
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
