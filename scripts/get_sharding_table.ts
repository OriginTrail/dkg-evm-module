import fs from 'fs';

import hre from 'hardhat';

import { ShardingTableLib } from '../typechain/contracts/ShardingTable';

async function main() {
  const ShardingTableContract = await hre.ethers.getContractAt(
    hre.helpers.getAbi('ShardingTable'),
    hre.helpers.contractDeployments.contracts['ShardingTable'].evmAddress,
  );

  const shardingTable = await ShardingTableContract['getShardingTable()']();
  const shardingTableMapped = await Promise.all(
    shardingTable.map(async (x: ShardingTableLib.NodeInfoStructOutput) => {
      const identityId = Number(x.identityId.toString());

      return {
        nodeId: hre.ethers.toUtf8String(x.nodeId),
        sha256: hre.ethers.sha256(x.nodeId),
        identityId,
        ask: hre.ethers.formatEther(x.ask),
        stake: hre.ethers.formatEther(x.stake),
      };
    }),
  );

  fs.writeFileSync(
    `${hre.network.name}.json`,
    JSON.stringify(shardingTableMapped, null, 4),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
