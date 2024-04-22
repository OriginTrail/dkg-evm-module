import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ShardingTableStructsV1 } from '../typechain/contracts/v2/ShardingTable.sol/ShardingTableV2';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const isDeployed = hre.helpers.isDeployed('NodeOperatorFeesStorage');

  if (isDeployed) {
    return;
  }

  const oldOperatorFees = [];
  const timestampNow = (await hre.ethers.provider.getBlock('latest')).timestamp;

  const { deployer } = await hre.getNamedAccounts();

  const shardingTableAddress = hre.helpers.contractDeployments.contracts['ShardingTable'].evmAddress;
  const ShardingTable = await hre.ethers.getContractAt('ShardingTable', shardingTableAddress, deployer);

  const stakingStorageAddress = hre.helpers.contractDeployments.contracts['StakingStorage'].evmAddress;
  const StakingStorage = await hre.ethers.getContractAt('StakingStorage', stakingStorageAddress, deployer);

  const nofcsAddress = hre.helpers.contractDeployments.contracts['NodeOperatorFeeChangesStorage']?.evmAddress;
  let nofcs = null;
  if (nofcsAddress) {
    const abi = hre.helpers.getAbi('LegacyNodeOperatorFeeChangesStorage');
    nofcs = await hre.ethers.getContractAt(abi, nofcsAddress, deployer);
  }

  const nodes: ShardingTableStructsV1.NodeInfoStructOutput[] = await ShardingTable['getShardingTable()']();
  const identityIds = nodes.map((node) => node.identityId);

  console.log(`Starting migration of the old operator fees...`);
  for (const identityId of identityIds) {
    console.log(`--------------------------------------------------------`);
    console.log(`IdentityId: ${identityId}`);

    const operatorFees = [];

    const activeOperatorFeePercentage = await StakingStorage.operatorFees(identityId);

    console.log(`Active operatorFee in the StakingStorage: ${activeOperatorFeePercentage.toString()}%`);

    if (!activeOperatorFeePercentage.eq(0)) {
      operatorFees.push({
        feePercentage: activeOperatorFeePercentage,
        effectiveDate: timestampNow,
      });
    }

    if (nofcs !== null) {
      const pendingOperatorFee = await nofcs.operatorFeeChangeRequests(identityId);

      console.log(`Pending operatorFee in the NodeOperatorFeeChangesStorage: ${pendingOperatorFee.newFee.toString()}%`);

      if (!pendingOperatorFee.timestamp.eq(0)) {
        if (pendingOperatorFee.timestamp < operatorFees[0].effectiveDate) {
          operatorFees[0].effectiveDate = pendingOperatorFee.timestamp - 1;
        }

        operatorFees.push({
          feePercentage: pendingOperatorFee.newFee,
          effectiveDate: pendingOperatorFee.timestamp,
        });
      }
    }

    console.log(`--------------------------------------------------------`);

    if (operatorFees.length > 0) {
      oldOperatorFees.push({
        identityId,
        fees: operatorFees,
      });
    }
  }

  delete hre.helpers.contractDeployments.contracts['NodeOperatorFeeChangesStorage'];

  const NodeOperatorFeesStorage = await hre.helpers.deploy({
    newContractName: 'NodeOperatorFeesStorage',
    additionalArgs: [timestampNow + 300],
  });

  const chunkSize = 10;
  const encodedDataArray: string[] = oldOperatorFees.reduce<string[]>((acc, currentValue, currentIndex, array) => {
    if (currentIndex % chunkSize === 0) {
      // Encode and push the function data for a slice of the array
      acc.push(
        NodeOperatorFeesStorage.interface.encodeFunctionData('migrateOldOperatorFees', [
          array.slice(currentIndex, currentIndex + chunkSize),
        ]),
      );
    }
    return acc;
  }, []);

  if (hre.network.config.environment === 'development') {
    const { deployer } = await hre.getNamedAccounts();

    const hubControllerAddress = hre.helpers.contractDeployments.contracts['HubController'].evmAddress;
    const HubController = await hre.ethers.getContractAt('HubController', hubControllerAddress, deployer);

    for (let i = 0; i < encodedDataArray.length; i++) {
      const migrateOldOperatorFeesTx = await HubController.forwardCall(
        NodeOperatorFeesStorage.address,
        encodedDataArray[i],
      );
      await migrateOldOperatorFeesTx.wait();
    }
  } else {
    for (let i = 0; i < encodedDataArray.length; i++) {
      hre.helpers.setParametersEncodedData.push(['NodeOperatorFeesStorage', [encodedDataArray[i]]]);
    }
  }
};

export default func;
func.tags = ['NodeOperatorFeesStorage', 'v2'];
func.dependencies = ['HubV2', 'StakingStorage', 'ShardingTableV2'];
