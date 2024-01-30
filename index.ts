import AbstractAsset from './abi/AbstractAsset.json';
import Assertion from './abi/Assertion.json';
import AssertionStorage from './abi/AssertionStorage.json';
import CommitManagerV1 from './abi/CommitManagerV1.json';
import CommitManagerV1U1 from './abi/CommitManagerV1U1.json';
import CommitManagerV2 from './abi/CommitManagerV2.json';
import CommitManagerV2U1 from './abi/CommitManagerV2U1.json';
import ContentAsset from './abi/ContentAsset.json';
import ContentAssetStorage from './abi/ContentAssetStorage.json';
import ContentAssetStorageV2 from './abi/ContentAssetStorageV2.json';
import ContractStatus from './abi/ContractStatus.json';
import Guardian from './abi/Guardian.json';
import HashingProxy from './abi/HashingProxy.json';
import Hub from './abi/Hub.json';
import HubController from './abi/HubController.json';
import HubDependent from './abi/HubDependent.json';
import HubV2 from './abi/HubV2.json';
import ICustodian from './abi/ICustodian.json';
import Identity from './abi/Identity.json';
import IdentityStorage from './abi/IdentityStorage.json';
import IdentityStorageV2 from './abi/IdentityStorageV2.json';
import IHashFunction from './abi/IHashFunction.json';
import Indexable from './abi/Indexable.json';
import Initializable from './abi/Initializable.json';
import IProximityScoreFunctionsPair from './abi/IProximityScoreFunctionsPair.json';
import LinearSum from './abi/LinearSum.json';
import Log2PLDSF from './abi/Log2PLDSF.json';
import MultiSigWallet from './abi/MultiSigWallet.json';
import Named from './abi/Named.json';
import ParametersStorage from './abi/ParametersStorage.json';
import Profile from './abi/Profile.json';
import ProfileStorage from './abi/ProfileStorage.json';
import ProofManagerV1 from './abi/ProofManagerV1.json';
import ProofManagerV1U1 from './abi/ProofManagerV1U1.json';
import ProximityScoringProxy from './abi/ProximityScoringProxy.json';
import ServiceAgreementStorageProxy from './abi/ServiceAgreementStorageProxy.json';
import ServiceAgreementStorageV1 from './abi/ServiceAgreementStorageV1.json';
import ServiceAgreementStorageV1U1 from './abi/ServiceAgreementStorageV1U1.json';
import ServiceAgreementV1 from './abi/ServiceAgreementV1.json';
import SHA256 from './abi/SHA256.json';
import ShardingTable from './abi/ShardingTable.json';
import ShardingTableStorage from './abi/ShardingTableStorage.json';
import ShardingTableStorageV2 from './abi/ShardingTableStorageV2.json';
import ShardingTableV2 from './abi/ShardingTableV2.json';
import Staking from './abi/Staking.json';
import StakingStorage from './abi/StakingStorage.json';
import StakingV2 from './abi/StakingV2.json';
import Token from './abi/Token.json';
import UnfinalizedStateStorage from './abi/UnfinalizedStateStorage.json';
import Versioned from './abi/Versioned.json';
import WhitelistStorage from './abi/WhitelistStorage.json';

const ABIV1 = {
  Hub,
  HubController,
  ParametersStorage,
  HashingProxy,
  ScoringProxy: ProximityScoringProxy,
  SHA256,
  ShardingTableStorage,
  ShardingTable,
  AssertionStorage,
  Assertion,
  ServiceAgreementStorageV1,
  ServiceAgreementStorageV1U1,
  ServiceAgreementStorageProxy,
  ServiceAgreementV1,
  CommitManagerV1,
  CommitManagerV1U1,
  ProofManagerV1,
  ProofManagerV1U1,
  ContentAssetStorage,
  ContentAsset,
  Token,
  IdentityStorage,
  Identity,
  LinearSum,
  Log2PLDSF,
  ProfileStorage,
  Profile,
  StakingStorage,
  Staking,
  UnfinalizedStateStorage,
  WhitelistStorage,
  MultiSigWallet,
  AbstractAsset,
  HubDependent,
  ContractStatus,
  Guardian,
  ICustodian,
  IHashFunction,
  Indexable,
  Initializable,
  IScoreFunction: IProximityScoreFunctionsPair,
  Named,
  Versioned,
};

const ABIV2 = {
  HubV2,
  ContentAssetStorageV2,
  IdentityStorageV2,
  CommitManagerV2,
  CommitManagerV2U1,
  ShardingTableV2,
  ShardingTableStorageV2,
  StakingV2,
};

export {
  HubV2 as HubABI,
  HubController as HubControllerABI,
  ParametersStorage as ParametersStorageABI,
  HashingProxy as HashingProxyABI,
  ProximityScoringProxy as ScoringProxyABI,
  SHA256 as SHA256ABI,
  ShardingTableStorageV2 as ShardingTableStorageABI,
  ShardingTableV2 as ShardingTableABI,
  AssertionStorage as AssertionStorageABI,
  Assertion as AssertionABI,
  ServiceAgreementStorageV1 as ServiceAgreementStorageV1ABI,
  ServiceAgreementStorageV1U1 as ServiceAgreementStorageV1U1ABI,
  ServiceAgreementStorageProxy as ServiceAgreementStorageProxyABI,
  ServiceAgreementV1 as ServiceAgreementV1ABI,
  CommitManagerV2 as CommitManagerV1ABI,
  CommitManagerV2U1 as CommitManagerV1U1ABI,
  ProofManagerV1 as ProofManagerV1ABI,
  ProofManagerV1U1 as ProofManagerV1U1ABI,
  ContentAssetStorageV2 as ContentAssetStorageABI,
  ContentAsset as ContentAssetABI,
  Token as TokenABI,
  IdentityStorageV2 as IdentityStorageABI,
  Identity as IdentityABI,
  LinearSum as LinearSumABI,
  Log2PLDSF as Log2PLDSFABI,
  ProfileStorage as ProfileStorageABI,
  Profile as ProfileABI,
  StakingStorage as StakingStorageABI,
  StakingV2 as StakingABI,
  UnfinalizedStateStorage as UnfinalizedStateStorageABI,
  WhitelistStorage as WhitelistStorageABI,
  MultiSigWallet as MultiSigWalletABI,
  AbstractAsset as AbstractAssetABI,
  HubDependent as HubDependentABI,
  ContractStatus as ContractStatusABI,
  Guardian as GuardianABI,
  ICustodian as ICustodianABI,
  IHashFunction as IHashFunctionABI,
  Indexable as IndexableABI,
  Initializable as InitializableABI,
  IProximityScoreFunctionsPair as IScoreFunctionABI,
  Named as NamedABI,
  Versioned as VersionedABI,
  ABIV1,
  ABIV2,
};
