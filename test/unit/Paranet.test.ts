import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

import {
  Hub,
  Paranet,
  ParanetsRegistry,
  ParanetServicesRegistry,
  ParanetKnowledgeMinersRegistry,
  ParanetKnowledgeCollectionsRegistry,
  ProfileStorage,
  IdentityStorage,
  KnowledgeCollectionStorage,
} from '../../typechain';

type ParanetFixture = {
  accounts: SignerWithAddress[];
  Paranet: Paranet;
  ParanetsRegistry: ParanetsRegistry;
  ParanetServicesRegistry: ParanetServicesRegistry;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  ProfileStorage: ProfileStorage;
  IdentityStorage: IdentityStorage;
  KnowledgeCollectionStorage: KnowledgeCollectionStorage;
};

describe('@unit Paranet contract', function () {
  let accounts: SignerWithAddress[];
  let Paranet: Paranet;
  let ParanetsRegistry: ParanetsRegistry;
  let ParanetServicesRegistry: ParanetServicesRegistry;
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let ParanetKnowledgeCollectionsRegistry: ParanetKnowledgeCollectionsRegistry;
  let ProfileStorage: ProfileStorage;
  let IdentityStorage: IdentityStorage;
  let KnowledgeCollectionStorage: KnowledgeCollectionStorage;

  async function deployParanetFixture(): Promise<ParanetFixture> {
    // Deploy all required contracts
    await hre.deployments.fixture(
      [
        'Hub',
        'KnowledgeCollectionStorage',
        'ProfileStorage',
        'IdentityStorage',
        'ParanetsRegistry',
        'ParanetServicesRegistry',
        'ParanetKnowledgeMinersRegistry',
        'ParanetKnowledgeCollectionsRegistry',
        'Paranet',
      ],
      {
        keepExistingDeployments: false, // This ensures a fresh deployment each time
      },
    );

    accounts = await hre.ethers.getSigners();
    const Hub = await hre.ethers.getContract<Hub>('Hub');

    // Get contract instances
    Paranet = await hre.ethers.getContract<Paranet>('Paranet');
    ParanetsRegistry =
      await hre.ethers.getContract<ParanetsRegistry>('ParanetsRegistry');
    ParanetServicesRegistry =
      await hre.ethers.getContract<ParanetServicesRegistry>(
        'ParanetServicesRegistry',
      );
    ParanetKnowledgeMinersRegistry =
      await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
        'ParanetKnowledgeMinersRegistry',
      );
    ParanetKnowledgeCollectionsRegistry =
      await hre.ethers.getContract<ParanetKnowledgeCollectionsRegistry>(
        'ParanetKnowledgeCollectionsRegistry',
      );
    ProfileStorage =
      await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    IdentityStorage =
      await hre.ethers.getContract<IdentityStorage>('IdentityStorage');
    KnowledgeCollectionStorage =
      await hre.ethers.getContract<KnowledgeCollectionStorage>(
        'KnowledgeCollectionStorage',
      );

    // Set up Hub contract
    await Hub.setContractAddress('HubOwner', accounts[0].address);

    // Initialize Paranet contract
    await Paranet.initialize();

    return {
      accounts,
      Paranet,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
      ProfileStorage,
      IdentityStorage,
      KnowledgeCollectionStorage,
    };
  }

  beforeEach(async () => {
    ({
      accounts,
      Paranet,
      ParanetsRegistry,
      ParanetServicesRegistry,
      ParanetKnowledgeMinersRegistry,
      ParanetKnowledgeCollectionsRegistry,
      ProfileStorage,
      IdentityStorage,
      KnowledgeCollectionStorage,
    } = await loadFixture(deployParanetFixture));
  });

  it('Should have correct name and version', async () => {
    expect(await Paranet.name()).to.equal('Paranet');
    expect(await Paranet.version()).to.equal('1.0.0');
  });

  describe('Paranet Registration', () => {
    it('Should register a new paranet successfully', async () => {
      const paranetKCStorageContract =
        await KnowledgeCollectionStorage.getAddress();
      const paranetKCTokenId = 1;
      const paranetKATokenId = 1;
      const paranetName = 'Test Paranet';
      const paranetDescription = 'Test Description';

      await expect(
        Paranet.registerParanet(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          paranetName,
          paranetDescription,
          0, // OPEN nodes access policy
          0, // OPEN miners access policy
        ),
      )
        .to.emit(Paranet, 'ParanetRegistered')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          paranetName,
          paranetDescription,
          0, // NodesAccessPolicy.OPEN
          0, // MinersAccessPolicy.OPEN
          0, // KnowledgeCollectionsAccessPolicy.OPEN
        );
    });

    it('Should not allow registering same paranet twice', async () => {
      const paranetKCStorageContract =
        await KnowledgeCollectionStorage.getAddress();
      const paranetKCTokenId = 1;
      const paranetKATokenId = 1;

      await Paranet.registerParanet(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        'Test Paranet',
        'Test Description',
        0,
        0,
      );

      await expect(
        Paranet.registerParanet(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          'Test Paranet 2',
          'Test Description 2',
          0,
          0,
        ),
      ).to.be.revertedWithCustomError(
        Paranet,
        'ParanetHasAlreadyBeenRegistered',
      );
    });
  });

  describe('Paranet Services', async () => {
    // let paranetId: string;
    const paranetKCStorageContract =
      await KnowledgeCollectionStorage.getAddress();
    const paranetKCTokenId = 1;
    const paranetKATokenId = 1;

    beforeEach(async () => {
      await Paranet.registerParanet(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        'Test Paranet',
        'Test Description',
        0,
        0,
      );

      //   paranetId = hre.ethers.keccak256(
      //     hre.ethers.solidityPacked(
      //       ['address', 'uint256', 'uint256'],
      //       [paranetKCStorageContract, paranetKCTokenId, paranetKATokenId]
      //     )
      //   );
    });

    it('Should register paranet service successfully', async () => {
      const serviceName = 'Test Service';
      const serviceDescription = 'Test Service Description';
      const serviceAddresses = [accounts[1].address];

      await expect(
        Paranet.registerParanetService(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          serviceName,
          serviceDescription,
          serviceAddresses,
        ),
      )
        .to.emit(Paranet, 'ParanetServiceRegistered')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          serviceName,
          serviceDescription,
          serviceAddresses,
        );
    });

    it('Should update paranet service metadata successfully', async () => {
      const serviceName = 'Test Service';
      const serviceDescription = 'Test Service Description';
      const serviceAddresses = [accounts[1].address];

      await Paranet.registerParanetService(
        paranetKCStorageContract,
        paranetKCTokenId,
        paranetKATokenId,
        serviceName,
        serviceDescription,
        serviceAddresses,
      );

      const newServiceName = 'Updated Service';
      const newServiceDescription = 'Updated Description';
      const newServiceAddresses = [accounts[2].address];

      await expect(
        Paranet.updateParanetServiceMetadata(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          newServiceName,
          newServiceDescription,
          newServiceAddresses,
        ),
      )
        .to.emit(Paranet, 'ParanetServiceMetadataUpdated')
        .withArgs(
          paranetKCStorageContract,
          paranetKCTokenId,
          paranetKATokenId,
          newServiceName,
          newServiceDescription,
          newServiceAddresses,
        );
    });
  });
});
