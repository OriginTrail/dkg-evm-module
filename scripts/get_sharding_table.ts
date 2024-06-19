import fs from 'fs';

import hre from 'hardhat';

import { ShardingTableStructsV1 } from '../typechain/contracts/v2/ShardingTable.sol/ShardingTableV2';

async function main() {
  const ShardingTableContract = await hre.ethers.getContractAt(
    hre.helpers.getAbi('ShardingTableV2'),
    hre.helpers.contractDeployments.contracts['ShardingTable'].evmAddress,
  );
  const shardingTable = await ShardingTableContract['getShardingTable()']();
  const shardingTableMapped = shardingTable.map((x: ShardingTableStructsV1.NodeInfoStructOutput) => ({
    nodeId: hre.ethers.utils.toUtf8String(x.nodeId),
    sha256: hre.ethers.utils.sha256(x.nodeId),
    identityId: Number(x.identityId.toString()),
    ask: hre.ethers.utils.formatEther(x.ask),
    stake: hre.ethers.utils.formatEther(x.stake),
  }));

  fs.writeFileSync(`${hre.network.name}.json`, JSON.stringify(shardingTableMapped, null, 4));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
