import fs from 'fs';

import hre from 'hardhat';

import { ShardingTableStructsV1 } from '../typechain/contracts/v2/ShardingTable.sol/ShardingTableV2';

async function main() {
  const ShardingTableContract = await hre.ethers.getContractAt(
    hre.helpers.getAbi('ShardingTableV2'),
    hre.helpers.contractDeployments.contracts['ShardingTable'].evmAddress,
  );
  const ProfileStorage = await hre.ethers.getContractAt(
    hre.helpers.getAbi('ProfileStorage'),
    hre.helpers.contractDeployments.contracts['ProfileStorage'].evmAddress,
  );

  const shardingTable = await ShardingTableContract['getShardingTable()']();
  const shardingTableMapped = await Promise.all(
    shardingTable.map(async (x: ShardingTableStructsV1.NodeInfoStructOutput) => {
      const identityId = Number(x.identityId.toString());
      const sharesTokenAddress = await ProfileStorage.getSharesContractAddress(identityId);

      const SharesToken = await hre.ethers.getContractAt(hre.helpers.getAbi('Token'), sharesTokenAddress);

      const sharesTokenName = await SharesToken.name();

      return {
        nodeId: hre.ethers.utils.toUtf8String(x.nodeId),
        sha256: hre.ethers.utils.sha256(x.nodeId),
        identityId,
        sharesTokenName,
        ask: hre.ethers.utils.formatEther(x.ask),
        stake: hre.ethers.utils.formatEther(x.stake),
      };
    }),
  );

  fs.writeFileSync(`${hre.network.name}.json`, JSON.stringify(shardingTableMapped, null, 4));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
