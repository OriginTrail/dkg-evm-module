import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isMigration = hre.helpers.contractDeployments.contracts['ShardingTable']?.migration || false;

  if (
    hre.helpers.isDeployed('ShardingTable') &&
    (hre.helpers.contractDeployments.contracts['ShardingTable'].version === undefined ||
      hre.helpers.contractDeployments.contracts['ShardingTable'].version?.startsWith('1.')) &&
    !isMigration
  ) {
    return;
  }

  const oldShardingTableAddress = hre.helpers.contractDeployments.contracts['ShardingTable']?.evmAddress;

  console.log('Deploying ShardingTable V2...');

  if (isMigration) {
    console.log('And running migration of old ShardingTable...');
    delete hre.helpers.contractDeployments.contracts['ShardingTable'].migration;
    hre.helpers.contractDeployments.contracts['OldShardingTable'] =
      hre.helpers.contractDeployments.contracts['ShardingTable'];
  }

  const blockTimeNow = (await hre.ethers.provider.getBlock('latest')).timestamp;

  const newShardingTable = await hre.helpers.deploy({
    newContractName: 'ShardingTableV2',
    newContractNameInHub: 'ShardingTable',
    additionalArgs: [isMigration ? blockTimeNow + 86400 : blockTimeNow],
  });

  if (isMigration && hre.network.name.startsWith('otp')) {
    const { deployer } = await hre.getNamedAccounts();

    console.log(`Executing sharding table storage v1 to v2 migration`);
    const shardingTableStorageAddress = hre.helpers.contractDeployments.contracts['ShardingTableStorage'].evmAddress;

    console.log(
      `Old ShardingTable: ${oldShardingTableAddress}, New ShardingTable: ${newShardingTable.address}, ShardingTableStorage: ${shardingTableStorageAddress}`,
    );

    const oldShardingTable = await hre.ethers.getContractAt('ShardingTable', oldShardingTableAddress, deployer);

    const nodes = await oldShardingTable['getShardingTable()']();
    let identityId = nodes[0]?.identityId;
    console.log(`Found ${nodes.length} nodes in the old ShardingTable, starting identityId: ${identityId}`);
    console.log(`Full list of migrated nodes: ${JSON.stringify(nodes)}`);

    const numberOfNodesInBatch = 10;
    let iteration = 1;

    const oldShardingTableStorageAddress = await oldShardingTable.shardingTableStorage();
    const encodedDataArray = [];

    while (identityId) {
      console.log(
        `Migrating sharding table with starting identityId: ${identityId}, number of nodes in batch: ${numberOfNodesInBatch}, ShardingTableStorage: ${shardingTableStorageAddress}`,
      );

      encodedDataArray.push(
        newShardingTable.interface.encodeFunctionData('migrateOldShardingTable', [
          identityId,
          numberOfNodesInBatch,
          oldShardingTableStorageAddress,
        ]),
      );

      console.log(
        `Migration COMPLETED iteration: ${iteration} with starting identityId: ${identityId}, number of nodes in batch: ${numberOfNodesInBatch}, ShardingTableStorage: ${shardingTableStorageAddress}`,
      );

      identityId = nodes[iteration * numberOfNodesInBatch]?.identityId;
      iteration += 1;
    }

    hre.helpers.setParametersEncodedData.push(['ShardingTable', encodedDataArray]);
  }
};

export default func;
func.tags = ['ShardingTableV2', 'v2'];
func.dependencies = ['HubV2', 'ProfileStorage', 'ShardingTableStorageV2', 'StakingStorage'];
