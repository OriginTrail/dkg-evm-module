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

  const blockTimeNow = (await hre.ethers.provider.getBlock('latest')).timestamp;

  await hre.helpers.deploy({
    newContractName: 'ShardingTableV2',
    newContractNameInHub: 'ShardingTable',
    additionalArgs: [isMigration ? blockTimeNow + 3600 : blockTimeNow],
  });

  if (hre.helpers.contractDeployments.contracts['ShardingTable'].migration && hre.network.name.startsWith('otp')) {
    const { deployer } = await hre.getNamedAccounts();

    console.log(`Executing sharding table storage v1 to v2 migration`);
    const newShardingTableAddress = hre.helpers.contractDeployments.contracts['ShardingTable'].evmAddress;
    const shardingTableStorageAddress = hre.helpers.contractDeployments.contracts['ShardingTableStorage'].evmAddress;

    console.log(
      `Old ShardingTable: ${oldShardingTableAddress}, New ShardingTable: ${newShardingTableAddress}, ShardingTableStorage: ${shardingTableStorageAddress}`,
    );

    const oldShardingTable = await hre.ethers.getContractAt('ShardingTable', oldShardingTableAddress, deployer);
    const newShardingTable = await hre.ethers.getContractAt('ShardingTable', newShardingTableAddress, deployer);

    const nodes = await oldShardingTable.getShardingTable();
    let identityId = nodes[0]?.identityId;
    console.log(`Found ${nodes.length} nodes in the old ShardingTable, starting identityId: ${identityId}`);

    const numberOfNodesInBatch = 10;
    let iteration = 1;

    const encodedDataArray = [];

    while (identityId) {
      console.log(
        `Migrating sharding table with starting identityId: ${identityId}, number of nodes in batch: ${numberOfNodesInBatch}, ShardingTableStorage: ${shardingTableStorageAddress}`,
      );

      encodedDataArray.push(
        newShardingTable.interface.encodeFunctionData('migrateOldShardingTable', [
          identityId,
          numberOfNodesInBatch,
          oldShardingTableAddress,
        ]),
      );

      console.log(
        `Migration COMPLETED iteration: ${iteration} with starting identityId: ${identityId}, number of nodes in batch: ${numberOfNodesInBatch}, ShardingTableStorage: ${shardingTableStorageAddress}`,
      );
      iteration += 1;
      identityId = nodes[iteration * numberOfNodesInBatch]?.identityId;
    }

    for (let i = 0; i < encodedDataArray.length; i++) {
      hre.helpers.setParametersEncodedData.push(['ShardingTable', [encodedDataArray[i]]]);
    }
  }
};

export default func;
func.tags = ['ShardingTableV2', 'v2'];
func.dependencies = ['HubV2', 'ProfileStorage', 'ShardingTableStorageV2', 'StakingStorage'];
