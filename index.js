const hub = require("./build/contracts/Hub.json");
const parametersStorage = require("./build/contracts/ParametersStorage.json");
const hashingProxy = require("./build/contracts/HashingProxy.json");
const sha256Contract = require("./build/contracts/SHA256.json");
const scoringProxy = require("./build/contracts/ScoringProxy.json");
const log2pldsfContract = require("./build/contracts/Log2PLDSF.json");
const shardingTableStorage = require("./build/contracts/ShardingTableStorage.json");
const shardingTableContract = require("./build/contracts/ShardingTable.json");
const assertionStorage = require("./build/contracts/AssertionStorage.json");
const assertionContract = require("./build/contracts/Assertion.json");
const serviceAgreementStorageV1 = require("./build/contracts/ServiceAgreementStorageV1.json");
const serviceAgreementContractV1 = require("./build/contracts/ServiceAgreementV1.json");
const contentAsset = require("./build/contracts/ContentAsset.json");
const erc20Token = require("./build/contracts/ERC20Token.json");
const identityStorage = require("./build/contracts/IdentityStorage.json");
const identityContract = require("./build/contracts/Identity.json");
const profileStorage = require("./build/contracts/ProfileStorage.json");
const profileContract = require("./build/contracts/Profile.json");
const stakingStorage = require("./build/contracts/StakingStorage.json");
const stakingContract = require("./build/contracts/Staking.json");
const whitelistStorage = require("./build/contracts/WhitelistStorage.json");

module.exports = {
  hub,
  parametersStorage,
  hashingProxy,
  sha256Contract,
  scoringProxy,
  log2pldsfContract,
  shardingTableStorage,
  shardingTableContract,
  assertionStorage,
  assertionContract,
  serviceAgreementStorageV1,
  serviceAgreementContractV1,
  contentAsset,
  erc20Token,
  identityStorage,
  identityContract,
  profileStorage,
  profileContract,
  stakingStorage,
  stakingContract,
  whitelistStorage
};
