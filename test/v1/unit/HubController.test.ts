import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { Hub, HubController, Profile, Token } from '../../../typechain';
import { GeneralStructs } from '../../../typechain/contracts/v1/HubController';

type HubControllerFixture = {
  accounts: SignerWithAddress[];
  HubController: HubController;
  Profile: Profile;
};

describe('@v1 @unit HubController contract', function () {
  let accounts: SignerWithAddress[];
  let HubController: HubController;
  let Profile: Profile;

  async function deployHubControllerFixture(): Promise<HubControllerFixture> {
    await hre.deployments.fixture(['Profile', 'HashingProxy', 'ScoringProxy']);
    HubController = await hre.ethers.getContract<HubController>('HubController');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    accounts = await hre.ethers.getSigners();

    return { accounts, HubController, Profile };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, HubController } = await loadFixture(deployHubControllerFixture));
  });

  it('Should deploy successfully with correct initial parameters', async function () {
    expect(await HubController.name()).to.equal('HubController');
    expect(await HubController.version()).to.equal('1.0.2');
  });

  it('New Profile contract set in the Hub through the HubController; Expect status for old Profile to be false, status for the new Profile to be true', async function () {
    expect(await Profile.status()).to.be.true;

    const newProfile = await hre.helpers.deploy({
      newContractName: 'Profile',
      setContractInHub: false,
      setAssetStorageInHub: false,
      deterministicDeployment: true,
    });

    const newProfileStruct: GeneralStructs.ContractStruct = {
      name: 'Profile',
      addr: newProfile.address,
    };
    await HubController.setAndReinitializeContracts([newProfileStruct], [], [], [], [newProfile.address], []);

    expect(await Profile.status()).to.be.false;
    expect(await newProfile.status()).to.be.true;
  });

  it('Set new HashProxy/ScoringProxy and hash/score functions in the Hub using HubController; Expect to be successful', async () => {
    await hre.deployments.fixture(['Hub', 'ParametersStorage']);

    const Hub = await hre.ethers.getContract<Hub>('Hub');
    HubController = await hre.ethers.getContract<HubController>('HubController');

    const HashingProxy = await hre.helpers.deploy({
      newContractName: 'HashingProxy',
      setContractInHub: false,
    });
    const ScoringProxy = await hre.helpers.deploy({
      newContractName: 'ScoringProxy',
      setContractInHub: false,
    });

    const SHA256 = await hre.helpers.deploy({
      newContractName: 'SHA256',
      passHubInConstructor: false,
      setContractInHub: false,
    });
    const Log2PLDSF = await hre.helpers.deploy({
      newContractName: 'Log2PLDSF',
      setContractInHub: false,
    });

    const newHashingProxyStruct: GeneralStructs.ContractStruct = {
      name: 'HashingProxy',
      addr: HashingProxy.address,
    };
    const newScoringProxyStruct: GeneralStructs.ContractStruct = {
      name: 'ScoringProxy',
      addr: ScoringProxy.address,
    };

    const tx = HubController.setAndReinitializeContracts(
      [newHashingProxyStruct, newScoringProxyStruct],
      [],
      [SHA256.address],
      [Log2PLDSF.address],
      [Log2PLDSF.address],
      [],
    );

    await expect(tx).to.not.be.reverted;
    await expect(tx)
      .to.emit(Hub, 'NewContract')
      .withArgs('HashingProxy', HashingProxy.address)
      .to.emit(Hub, 'NewContract')
      .withArgs('ScoringProxy', ScoringProxy.address)
      .to.emit(HashingProxy, 'NewHashFunctionContract')
      .withArgs(1, SHA256.address)
      .to.emit(ScoringProxy, 'NewScoringFunctionContract')
      .withArgs(1, Log2PLDSF.address);
  });

  it('Deploy full set of contracts and set new contract in Hub using HubController; Expect to be successful', async () => {
    await hre.deployments.fixture(['Hub', 'Token']);

    HubController = await hre.ethers.getContract<HubController>('HubController');
    const Token = await hre.ethers.getContract<Token>('Token');

    const ParametersStorage = await hre.helpers.deploy({ newContractName: 'ParametersStorage' });
    const WhitelistStorage = await hre.helpers.deploy({ newContractName: 'WhitelistStorage' });
    const HashingProxy = await hre.helpers.deploy({ newContractName: 'HashingProxy' });
    const SHA256 = await hre.helpers.deploy({
      newContractName: 'SHA256',
      passHubInConstructor: false,
    });
    const ScoringProxy = await hre.helpers.deploy({ newContractName: 'ScoringProxy' });
    const Log2PLDSF = await hre.helpers.deploy({ newContractName: 'Log2PLDSF' });
    const AssertionStorage = await hre.helpers.deploy({ newContractName: 'AssertionStorage' });
    const IdentityStorage = await hre.helpers.deploy({ newContractName: 'IdentityStorage' });
    const ShardingTableStorage = await hre.helpers.deploy({ newContractName: 'ShardingTableStorage' });
    const StakingStorage = await hre.helpers.deploy({ newContractName: 'StakingStorage' });
    const ProfileStorage = await hre.helpers.deploy({ newContractName: 'ProfileStorage' });
    const ServiceAgreementStorageV1 = await hre.helpers.deploy({ newContractName: 'ServiceAgreementStorageV1' });
    const ServiceAgreementStorageV1U1 = await hre.helpers.deploy({ newContractName: 'ServiceAgreementStorageV1U1' });
    const ServiceAgreementStorageProxy = await hre.helpers.deploy({ newContractName: 'ServiceAgreementStorageProxy' });
    const ContentAssetStorage = await hre.helpers.deploy({
      newContractName: 'ContentAssetStorage',
      passHubInConstructor: true,
      setContractInHub: false,
      setAssetStorageInHub: true,
    });
    const UnfinalizedStateStorage = await hre.helpers.deploy({ newContractName: 'UnfinalizedStateStorage' });
    const NodeOperatorFeesStorage = await hre.helpers.deploy({
      newContractName: 'NodeOperatorFeesStorage',
      additionalArgs: [(await hre.ethers.provider.getBlock('latest')).timestamp + 86400],
    });
    const Assertion = await hre.helpers.deploy({ newContractName: 'Assertion' });
    const Identity = await hre.helpers.deploy({ newContractName: 'Identity' });
    const ShardingTable = await hre.helpers.deploy({ newContractName: 'ShardingTable' });
    const Staking = await hre.helpers.deploy({ newContractName: 'Staking' });
    const Profile = await hre.helpers.deploy({ newContractName: 'Profile' });
    const CommitManagerV1 = await hre.helpers.deploy({ newContractName: 'CommitManagerV1' });
    const ProofManagerV1 = await hre.helpers.deploy({ newContractName: 'ProofManagerV1' });
    const CommitManagerV1U1 = await hre.helpers.deploy({ newContractName: 'CommitManagerV1U1' });
    const ProofManagerV1U1 = await hre.helpers.deploy({ newContractName: 'ProofManagerV1U1' });
    const ServiceAgreementV1 = await hre.helpers.deploy({ newContractName: 'ServiceAgreementV1' });
    const ContentAsset = await hre.helpers.deploy({ newContractName: 'ContentAsset' });

    const newContracts = [
      { name: 'Token', addr: Token.address },
      { name: 'ParametersStorage', addr: ParametersStorage.address },
      { name: 'WhitelistStorage', addr: WhitelistStorage.address },
      { name: 'HashingProxy', addr: HashingProxy.address },
      { name: 'SHA256', addr: SHA256.address },
      { name: 'ScoringProxy', addr: ScoringProxy.address },
      { name: 'Log2PLDSF', addr: Log2PLDSF.address },
      { name: 'AssertionStorage', addr: AssertionStorage.address },
      { name: 'IdentityStorage', addr: IdentityStorage.address },
      { name: 'ShardingTableStorage', addr: ShardingTableStorage.address },
      { name: 'StakingStorage', addr: StakingStorage.address },
      { name: 'ProfileStorage', addr: ProfileStorage.address },
      { name: 'ServiceAgreementStorageV1', addr: ServiceAgreementStorageV1.address },
      { name: 'ServiceAgreementStorageV1U1', addr: ServiceAgreementStorageV1U1.address },
      { name: 'ServiceAgreementStorageProxy', addr: ServiceAgreementStorageProxy.address },
      { name: 'UnfinalizedStateStorage', addr: UnfinalizedStateStorage.address },
      { name: 'NodeOperatorFeesStorage', addr: NodeOperatorFeesStorage.address },
      { name: 'Assertion', addr: Assertion.address },
      { name: 'Identity', addr: Identity.address },
      { name: 'ShardingTable', addr: ShardingTable.address },
      { name: 'Staking', addr: Staking.address },
      { name: 'Profile', addr: Profile.address },
      { name: 'CommitManagerV1', addr: CommitManagerV1.address },
      { name: 'ProofManagerV1', addr: ProofManagerV1.address },
      { name: 'CommitManagerV1U1', addr: CommitManagerV1U1.address },
      { name: 'ProofManagerV1U1', addr: ProofManagerV1U1.address },
      { name: 'ServiceAgreementV1', addr: ServiceAgreementV1.address },
      { name: 'ContentAsset', addr: ContentAsset.address },
    ];
    const newAssetStorageContracts = [{ name: 'ContentAssetStorage', addr: ContentAssetStorage.address }];
    const newHashFunctions = [SHA256.address];
    const newScoreFunctions = [Log2PLDSF.address];
    const contractsForReinitialization = [
      Log2PLDSF.address,
      StakingStorage.address,
      ProfileStorage.address,
      ServiceAgreementStorageV1.address,
      ServiceAgreementStorageV1U1.address,
      ServiceAgreementStorageProxy.address,
      Assertion.address,
      Identity.address,
      ShardingTable.address,
      Staking.address,
      Profile.address,
      CommitManagerV1.address,
      ProofManagerV1.address,
      CommitManagerV1U1.address,
      ProofManagerV1U1.address,
      ServiceAgreementV1.address,
      ContentAsset.address,
    ];
    const setParametersEncodedData = [
      {
        contractName: 'ParametersStorage',
        encodedData: [
          '0x0d8d840b0000000000000000000000000000000000000000000000000000000000000e10',
          '0x51ce6d3e0000000000000000000000000000000000000000000000000000000000000258',
        ],
      },
      {
        contractName: 'CommitManagerV1',
        encodedData: [
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001',
        ],
      },
      {
        contractName: 'ProofManagerV1',
        encodedData: [
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001',
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001',
        ],
      },
      {
        contractName: 'CommitManagerV1U1',
        encodedData: [
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001',
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001',
        ],
      },
      {
        contractName: 'ProofManagerV1U1',
        encodedData: [
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001',
          '0x7ea63c6e00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001',
        ],
      },
    ];

    const setAndReinitializeContractsTx = await HubController.setAndReinitializeContracts(
      newContracts,
      newAssetStorageContracts,
      newHashFunctions,
      newScoreFunctions,
      contractsForReinitialization,
      setParametersEncodedData,
    );

    await expect(setAndReinitializeContractsTx).to.not.be.reverted;
  });
});
