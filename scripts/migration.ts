import hre from 'hardhat';

async function main() {
  const oldShardingTableABI = hre.helpers.getAbi('ShardingTable');
  const oldShardingTableStorageAddress = '0x1312025F46E120faC11322090e896c6AD613e29b';
  const OldShardingTableStorage = await hre.ethers.getContractAt(oldShardingTableABI, oldShardingTableStorageAddress);

  const newShardingTableABI = hre.helpers.getAbi('ShardingTableV2');
  const newShardingTableStorageAddress = '0xF1932C7f8282C750A46Db5F8c9BA49D7d869732e';
  const NewShardingTableStorage = await hre.ethers.getContractAt(newShardingTableABI, newShardingTableStorageAddress);

  const oldNodes = await OldShardingTableStorage['getShardingTable()']();
  const newNodes = await NewShardingTableStorage['getShardingTable()']();

  const newNodesMap = new Map();
  for (const node of newNodes) {
    newNodesMap.set(node.identityId.toString(), node);
  }

  // Iterating through oldNodes to find and compare with corresponding newNodes
  for (const oldNode of oldNodes) {
    const newNode = newNodesMap.get(oldNode.identityId.toString());

    if (newNode) {
      // Assuming you want to compare all fields except identityId
      // Extract keys from oldNode for comparison, filtering out 'identityId'
      const keys = Object.keys(oldNode).filter((key) => key !== 'identityId');

      // Check each key for equality
      const differences = [];
      for (const key of keys) {
        if (JSON.stringify(oldNode[key]) !== JSON.stringify(newNode[key])) {
          differences.push({ key, old: oldNode[key], new: newNode[key] });
        }
      }

      if (differences.length > 0) {
        console.log(`Differences found for identityId ${oldNode.identityId.toString()}:`, differences);
      } else {
        console.log(`No differences for identityId ${oldNode.identityId.toString()}.`);
      }
    } else {
      console.log(`No matching node found in newNodes for identityId ${oldNode.identityId.toString()}.`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
