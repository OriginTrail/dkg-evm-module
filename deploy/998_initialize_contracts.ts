import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();

  const {
    newContracts,
    newAssetStorageContracts,
    contractsForReinitialization,
    setParametersEncodedData,
    newHashFunctions,
    newScoreFunctions,
  } = hre.helpers;

  const noChangesWereMade = [
    newContracts,
    newAssetStorageContracts,
    setParametersEncodedData,
    newHashFunctions,
    newScoreFunctions,
  ].every((arr) => arr.length === 0);

  if (!noChangesWereMade && hre.network.config.environment !== 'development') {
    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;

    console.log(`HubController: ${hubControllerAddress}`);

    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    console.log(`New or redeployed contracts: ${JSON.stringify(newContracts)}`);
    console.log(`New or redeployed Asset Storage contracts: ${JSON.stringify(newAssetStorageContracts)}`);
    console.log(`New or redeployed hash functions set in the proxy: ${JSON.stringify(newHashFunctions)}`);
    console.log(`New or redeployed score functions set in the proxy: ${JSON.stringify(newScoreFunctions)}`);
    console.log(`Initialized contracts: ${JSON.stringify(contractsForReinitialization)}`);
    console.log(`Encoded data for parameters settings: ${JSON.stringify(setParametersEncodedData)}`);

    const setAndReinitializeContractsTx = await HubController.setAndReinitializeContracts(
      newContracts,
      newAssetStorageContracts,
      newHashFunctions,
      newScoreFunctions,
      contractsForReinitialization,
      setParametersEncodedData,
    );
    await setAndReinitializeContractsTx.wait();

    // todo only if neuro call migration
    console.log(`Executing sharding table storage v1 to v2 migration`);
    const shardingTableV1Address = hre.helpers.contractDeployments.contracts['ShardingTableV1'].evmAddress;
    const shardingTableV2Address = hre.helpers.contractDeployments.contracts['ShardingTableV2'].evmAddress;
    const shardingTableStorageV1Address = hre.helpers.contractDeployments.contracts['ShardingTableStorage'].evmAddress;

    console.log(
      `Using: shardingTableV1Address: ${shardingTableV1Address}, shardingTableV2Address: ${shardingTableV2Address}, shardingTableStorageV1Address: ${shardingTableStorageV1Address}`,
    );

    const ShardingTableV1 = await hre.ethers.getContractAt('ShardingTableV1', shardingTableV2Address, deployer);
    const ShardingTableV2 = await hre.ethers.getContractAt('ShardingTableV2', shardingTableV2Address, deployer);

    const nodes = await ShardingTableV1.getShardingTable();
    let identityId = nodes[0]?.identityId;
    console.log(`Found ${nodes.length} nodes in sharding table v1, starting identity id: ${identityId}`);

    const numberOfNodesInBach = 10;
    const iteration = 1;

    while (identityId) {
      identityId = nodes[iteration * numberOfNodesInBach].identityId;
      console.log(
        `Migrating sharding table with starting identity id: ${identityId}, number of nodes in batch: ${numberOfNodesInBach}, sharding table storage v1 address: ${shardingTableStorageV1Address}`,
      );
      await ShardingTableV2.migrateOldShardingTable(identityId, numberOfNodesInBach, shardingTableStorageV1Address);
      console.log(
        `Migration COMPLETED with starting identity id: ${identityId}, number of nodes in batch: ${numberOfNodesInBach}, sharding table storage v1 address: ${shardingTableStorageV1Address}`,
      );
    }

    const newShardingTable = await ShardingTableV2.getShardingTable();
    // todo add additional validation for all nodes
    console.log(`Number of nodes in new sharding table after migration: ${newShardingTable.length}`);
  }
};

export default func;
func.tags = ['v1', 'v2'];
func.runAtTheEnd = true;
