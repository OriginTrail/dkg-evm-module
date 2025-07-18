import * as fs from 'fs';

import { Contract } from 'ethers';
import hre from 'hardhat';

type ValidationResult = {
  contract: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

class ContractValidator {
  private results: ValidationResult[] = [];
  private contracts: Record<string, Contract> = {};

  async loadContracts() {
    console.log('🔍 Loading deployed contracts...');

    // Detect which simulation contracts file to use
    let simulationFile: string | null = null;

    // Check for different simulation files
    const possibleFiles = [
      'base_mainnet_simulation_contracts.json',
      'neuroweb_mainnet_simulation_contracts.json',
      'gnosis_mainnet_simulation_contracts.json',
    ];

    for (const filename of possibleFiles) {
      const filepath = `./deployments/${filename}`;
      if (fs.existsSync(filepath)) {
        simulationFile = filepath;
        console.log(`📄 Found simulation contracts file: ${filename}`);
        break;
      }
    }

    if (!simulationFile) {
      throw new Error(
        'No simulation contracts file found! Make sure deployment completed successfully.',
      );
    }

    // Load contracts from our custom JSON format
    const simulationData = JSON.parse(fs.readFileSync(simulationFile, 'utf-8'));
    const deployedContracts = simulationData.contracts;

    console.log(
      `📋 Loading ${Object.keys(deployedContracts).length} contracts from simulation file...`,
    );

    // Contract name mappings for ABI loading
    const contractAbiMap: Record<string, string> = {
      EpochStorageV8: 'EpochStorage',
      EpochStorageV6: 'EpochStorage',
    };

    for (const [contractName, contractData] of Object.entries(
      deployedContracts,
    )) {
      try {
        const address = (contractData as any).evmAddress; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!address) {
          console.log(`   ⚠️  ${contractName}: No address found`);
          continue;
        }

        // Determine ABI name (handle special cases)
        const abiName = contractAbiMap[contractName] || contractName;

        // Load contract instance
        this.contracts[contractName] = await hre.ethers.getContractAt(
          abiName,
          address,
        );
        console.log(`   ✅ ${contractName}: ${address}`);
      } catch (error) {
        console.log(
          `   ⚠️  ${contractName}: Failed to load (${error instanceof Error ? error.message : 'Unknown error'})`,
        );
      }
    }

    console.log(
      `\n✅ Successfully loaded ${Object.keys(this.contracts).length} contracts`,
    );
  }

  private addResult(
    contract: string,
    status: 'PASS' | 'FAIL' | 'WARNING',
    message: string,
    details?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ) {
    this.results.push({ contract, status, message, details });
  }

  async validateHub() {
    console.log('\n🏢 Validating Hub...');
    const hub = this.contracts.Hub;
    if (!hub) {
      this.addResult('Hub', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Test basic functionality
      const name = await hub.name();
      const version = await hub.version();
      this.addResult('Hub', 'PASS', `Basic info: ${name} v${version}`);

      // Check all registered contracts
      const allContracts = await hub.getAllContracts();
      const allAssetStorages = await hub.getAllAssetStorages();

      this.addResult(
        'Hub',
        'PASS',
        `Registry contains ${allContracts.length} contracts and ${allAssetStorages.length} asset storages`,
        {
          contracts: allContracts.length,
          assetStorages: allAssetStorages.length,
        },
      );

      // Verify key contracts are registered
      const keyContracts = [
        'Token',
        'IdentityStorage',
        'StakingStorage',
        'ProfileStorage',
      ];
      for (const contractName of keyContracts) {
        try {
          const address = await hub.getContractAddress(contractName);
          this.addResult(
            'Hub',
            'PASS',
            `${contractName} registered at ${address}`,
          );
        } catch {
          this.addResult(
            'Hub',
            'FAIL',
            `${contractName} not registered in Hub`,
          );
        }
      }
    } catch (error) {
      this.addResult('Hub', 'FAIL', `Error validating Hub: ${error}`);
    }
  }

  async validateToken() {
    console.log('\n💰 Validating Token...');
    const token = this.contracts.Token;
    if (!token) {
      this.addResult('Token', 'FAIL', 'Contract not found');
      return;
    }

    try {
      const name = await token.name();
      const symbol = await token.symbol();
      const totalSupply = await token.totalSupply();
      const decimals = await token.decimals();

      this.addResult(
        'Token',
        'PASS',
        `${name} (${symbol}) - ${hre.ethers.formatUnits(totalSupply, decimals)} total supply`,
      );

      // Check if there are any holders with balances
      const hubAddress = this.contracts.Hub
        ? await this.contracts.Hub.getAddress()
        : null;
      if (hubAddress) {
        const hubBalance = await token.balanceOf(hubAddress);
        this.addResult(
          'Token',
          'PASS',
          `Hub balance: ${hre.ethers.formatUnits(hubBalance, decimals)} ${symbol}`,
        );
      }
    } catch (error) {
      this.addResult('Token', 'FAIL', `Error validating Token: ${error}`);
    }
  }

  async validateStakingStorage() {
    console.log('\n🏦 Validating StakingStorage...');
    const stakingStorage = this.contracts.StakingStorage;
    if (!stakingStorage) {
      this.addResult('StakingStorage', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Check total staked amount
      const totalStake = await stakingStorage.getTotalStake();
      this.addResult(
        'StakingStorage',
        totalStake > 0 ? 'PASS' : 'WARNING',
        `Total staked: ${hre.ethers.formatEther(totalStake)} TRAC`,
        { totalStake: totalStake.toString() },
      );

      // Check node data using available functions
      try {
        // Check if we can get data for some node identities
        let nodesWithStake = 0;
        for (let identityId = 1; identityId <= 30; identityId++) {
          try {
            const nodeStake = await stakingStorage.getNodeStake(identityId);
            if (nodeStake > 0) {
              nodesWithStake++;
              this.addResult(
                'StakingStorage',
                'PASS',
                `Identity ${identityId}: ${hre.ethers.formatEther(nodeStake)} TRAC staked`,
              );
              if (nodesWithStake >= 3) break; // Only show first 3
            }
          } catch {
            // Continue checking other identities
          }
        }

        this.addResult(
          'StakingStorage',
          nodesWithStake > 0 ? 'PASS' : 'WARNING',
          `Found ${nodesWithStake} identities with stake`,
        );
      } catch {
        this.addResult(
          'StakingStorage',
          'WARNING',
          'Could not retrieve node stake data',
        );
      }

      // Check delegation info
      try {
        const delegationEnabled = await stakingStorage.delegationEnabled();
        this.addResult(
          'StakingStorage',
          'PASS',
          `Delegation enabled: ${delegationEnabled}`,
        );
      } catch {
        this.addResult(
          'StakingStorage',
          'WARNING',
          'Could not check delegation status',
        );
      }
    } catch (error) {
      this.addResult(
        'StakingStorage',
        'FAIL',
        `Error validating StakingStorage: ${error}`,
      );
    }
  }

  async validateIdentityStorage() {
    console.log('\n🆔 Validating IdentityStorage...');
    const identityStorage = this.contracts.IdentityStorage;
    if (!identityStorage) {
      this.addResult('IdentityStorage', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Check basic contract info
      const name = await identityStorage.name();
      const version = await identityStorage.version();
      this.addResult(
        'IdentityStorage',
        'PASS',
        `${name} v${version} - Contract accessible`,
      );

      // Check last identity ID
      const lastIdentityId = await identityStorage.lastIdentityId();
      this.addResult(
        'IdentityStorage',
        lastIdentityId > 0 ? 'PASS' : 'WARNING',
        `Last identity ID: ${lastIdentityId}`,
        { lastIdentityId: lastIdentityId.toString() },
      );

      // Check if we can get identity data using available functions
      if (lastIdentityId > 0) {
        let validIdentities = 0;
        for (let i = 1; i <= Number(lastIdentityId); i++) {
          try {
            // Try to get operational keys for this identity (purpose 1 is operational)
            const operationalKeys = await identityStorage.getKeysByPurpose(
              i,
              1,
            );
            if (operationalKeys && operationalKeys.length > 0) {
              validIdentities++;
              this.addResult(
                'IdentityStorage',
                'PASS',
                `Identity ${i}: Has ${operationalKeys.length} operational key(s)`,
              );
            }
          } catch {
            // Continue checking other identities
          }
        }

        this.addResult(
          'IdentityStorage',
          validIdentities > 0 ? 'PASS' : 'WARNING',
          `Found ${validIdentities} identities with operational keys`,
        );
      }
    } catch (error) {
      this.addResult(
        'IdentityStorage',
        'FAIL',
        `Error validating IdentityStorage: ${error}`,
      );
    }
  }

  async validateProfileStorage() {
    console.log('\n👤 Validating ProfileStorage...');
    const profileStorage = this.contracts.ProfileStorage;
    if (!profileStorage) {
      this.addResult('ProfileStorage', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Check if there are any profiles
      let profilesFound = 0;

      const lastIdentityId =
        await this.contracts.IdentityStorage.lastIdentityId();

      // Try to check a few identity IDs for profiles
      for (let i = 1; i <= Number(lastIdentityId); i++) {
        try {
          const hasProfile = await profileStorage.profileExists(i);
          if (hasProfile) {
            profilesFound++;

            // Get profile details
            const nodeId = await profileStorage.getNodeId(i);
            const ask = await profileStorage.getAsk(i);
            const stake = await profileStorage.getStake(i);

            this.addResult(
              'ProfileStorage',
              'PASS',
              `Identity ${i} profile: NodeId=${nodeId}, Ask=${hre.ethers.formatEther(ask)} TRAC, Stake=${hre.ethers.formatEther(stake)} TRAC`,
            );

            if (profilesFound >= 3) break; // Only show first 3 profiles
          }
        } catch {
          // Continue checking other profiles
        }
      }

      this.addResult(
        'ProfileStorage',
        profilesFound > 0 ? 'PASS' : 'WARNING',
        `Found ${profilesFound} profiles`,
      );
    } catch (error) {
      this.addResult(
        'ProfileStorage',
        'FAIL',
        `Error validating ProfileStorage: ${error}`,
      );
    }
  }

  async validateShardingTableStorage() {
    console.log('\n🔗 Validating ShardingTableStorage...');
    const shardingTableStorage = this.contracts.ShardingTableStorage;
    if (!shardingTableStorage) {
      this.addResult('ShardingTableStorage', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Check total number of nodes
      const nodesCount = await shardingTableStorage.nodesCount();
      this.addResult(
        'ShardingTableStorage',
        nodesCount > 0 ? 'PASS' : 'WARNING',
        `Sharding table contains ${nodesCount} nodes`,
        { nodesCount: nodesCount.toString() },
      );

      // Check some nodes in the sharding table
      if (nodesCount > 0) {
        let validNodes = 0;
        for (let i = 0; i < Math.min(5, Number(nodesCount)); i++) {
          try {
            const nodeData = await shardingTableStorage.getNodeByIndex(i);
            validNodes++;
            // nodeId is bytes, convert to hex string for display
            const nodeIdHex =
              hre.ethers.hexlify(nodeData.nodeId).slice(0, 12) + '...';
            this.addResult(
              'ShardingTableStorage',
              'PASS',
              `Node ${i}: IdentityId=${nodeData.identityId}, NodeId=${nodeIdHex}, Index=${nodeData.index}, HashRingPos=${nodeData.hashRingPosition}`,
            );
          } catch (error) {
            this.addResult(
              'ShardingTableStorage',
              'WARNING',
              `Could not get node ${i} data: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        }

        this.addResult(
          'ShardingTableStorage',
          validNodes > 0 ? 'PASS' : 'WARNING',
          `Successfully retrieved ${validNodes} node details from sharding table`,
        );
      }
    } catch (error) {
      this.addResult(
        'ShardingTableStorage',
        'FAIL',
        `Error validating ShardingTableStorage: ${error}`,
      );
    }
  }

  async validateChronos() {
    console.log('\n⏰ Validating Chronos...');
    const chronos = this.contracts.Chronos;
    if (!chronos) {
      this.addResult('Chronos', 'FAIL', 'Contract not found');
      return;
    }

    try {
      const currentEpoch = await chronos.getCurrentEpoch();
      const epochLength = await chronos.epochLength();
      const currentBlock = await hre.ethers.provider.getBlockNumber();

      this.addResult(
        'Chronos',
        'PASS',
        `Current epoch: ${currentEpoch}, Epoch length: ${epochLength} blocks, Current block: ${currentBlock}`,
      );
    } catch (error) {
      this.addResult('Chronos', 'FAIL', `Error validating Chronos: ${error}`);
    }
  }

  async validateEpochStorage() {
    console.log('\n📊 Validating EpochStorage...');
    const epochStorage =
      this.contracts.EpochStorageV8 || this.contracts.EpochStorage;
    if (!epochStorage) {
      this.addResult('EpochStorage', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Check current epoch data
      const currentEpochKnowledgeValue =
        await epochStorage.getCurrentEpochProducedKnowledgeValue();
      const previousEpochKnowledgeValue =
        await epochStorage.getPreviousEpochProducedKnowledgeValue();

      this.addResult(
        'EpochStorage',
        'PASS',
        `Current epoch knowledge value: ${currentEpochKnowledgeValue}, Previous: ${previousEpochKnowledgeValue}`,
      );

      // Check epoch pool for shard 0
      const currentEpochPool = await epochStorage.getCurrentEpochPool(0);
      const previousEpochPool = await epochStorage.getPreviousEpochPool(0);

      this.addResult(
        'EpochStorage',
        'PASS',
        `Shard 0 - Current epoch pool: ${hre.ethers.formatEther(currentEpochPool)} TRAC, Previous: ${hre.ethers.formatEther(previousEpochPool)} TRAC`,
      );
    } catch (error) {
      this.addResult(
        'EpochStorage',
        'FAIL',
        `Error validating EpochStorage: ${error}`,
      );
    }
  }

  async validateKnowledgeCollection() {
    console.log('\n📚 Validating KnowledgeCollection...');
    const knowledgeCollection = this.contracts.KnowledgeCollection;
    const knowledgeCollectionStorage =
      this.contracts.KnowledgeCollectionStorage;

    if (!knowledgeCollection || !knowledgeCollectionStorage) {
      this.addResult('KnowledgeCollection', 'FAIL', 'Contract(s) not found');
      return;
    }

    try {
      // Check latest knowledge collection ID
      const latestId =
        await knowledgeCollectionStorage.getLatestKnowledgeCollectionId();
      this.addResult(
        'KnowledgeCollection',
        latestId > 0 ? 'PASS' : 'WARNING',
        `Latest knowledge collection ID: ${latestId}`,
      );

      // Check a few collections if they exist
      if (latestId > 0) {
        for (let i = 1; i <= Math.min(3, Number(latestId)); i++) {
          try {
            const exists =
              await knowledgeCollectionStorage.knowledgeCollectionExists(i);
            if (exists) {
              const owner = await knowledgeCollection.ownerOf(i);
              this.addResult(
                'KnowledgeCollection',
                'PASS',
                `Knowledge Collection ${i}: Owner=${owner}`,
              );
            }
          } catch {
            // Continue to next collection
          }
        }
      }
    } catch (error) {
      this.addResult(
        'KnowledgeCollection',
        'FAIL',
        `Error validating KnowledgeCollection: ${error}`,
      );
    }
  }

  async validateAskStorage() {
    console.log('\n❓ Validating AskStorage...');
    const askStorage = this.contracts.AskStorage;
    if (!askStorage) {
      this.addResult('AskStorage', 'FAIL', 'Contract not found');
      return;
    }

    try {
      // Check ask data using available functions
      const name = await askStorage.name();
      const version = await askStorage.version();
      this.addResult(
        'AskStorage',
        'PASS',
        `${name} v${version} - Contract accessible`,
      );

      // Check weighted ask data
      const weightedActiveAskSum = await askStorage.weightedActiveAskSum();
      const prevWeightedActiveAskSum =
        await askStorage.prevWeightedActiveAskSum();

      this.addResult(
        'AskStorage',
        'PASS',
        `Current weighted ask sum: ${hre.ethers.formatEther(weightedActiveAskSum)} TRAC, Previous: ${hre.ethers.formatEther(prevWeightedActiveAskSum)} TRAC`,
      );

      // Check stake weighted average ask
      try {
        const avgAsk = await askStorage.getStakeWeightedAverageAsk();
        this.addResult(
          'AskStorage',
          'PASS',
          `Current stake weighted average ask: ${hre.ethers.formatEther(avgAsk)} TRAC/KB`,
        );
      } catch {
        this.addResult(
          'AskStorage',
          'WARNING',
          'Could not get weighted average ask',
        );
      }
    } catch (error) {
      this.addResult(
        'AskStorage',
        'FAIL',
        `Error validating AskStorage: ${error}`,
      );
    }
  }

  async printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 VALIDATION RESULTS SUMMARY');
    console.log('='.repeat(80));

    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const warnings = this.results.filter((r) => r.status === 'WARNING').length;

    console.log(
      `\n✅ PASSED: ${passed} | ❌ FAILED: ${failed} | ⚠️  WARNINGS: ${warnings}\n`,
    );

    // Group results by contract
    const byContract = this.results.reduce(
      (acc, result) => {
        if (!acc[result.contract]) acc[result.contract] = [];
        acc[result.contract].push(result);
        return acc;
      },
      {} as Record<string, ValidationResult[]>,
    );

    for (const [contract, results] of Object.entries(byContract)) {
      const hasFailures = results.some((r) => r.status === 'FAIL');
      const hasWarnings = results.some((r) => r.status === 'WARNING');

      let icon = '✅';
      if (hasFailures) icon = '❌';
      else if (hasWarnings) icon = '⚠️';

      console.log(`${icon} ${contract}:`);

      for (const result of results) {
        const statusIcon =
          result.status === 'PASS'
            ? '  ✅'
            : result.status === 'FAIL'
              ? '  ❌'
              : '  ⚠️';
        console.log(`${statusIcon} ${result.message}`);
      }
      console.log();
    }

    // Critical issues summary
    const criticalIssues = this.results.filter((r) => r.status === 'FAIL');
    if (criticalIssues.length > 0) {
      console.log('🚨 CRITICAL ISSUES FOUND:');
      for (const issue of criticalIssues) {
        console.log(`   • ${issue.contract}: ${issue.message}`);
      }
      console.log();
    }

    // Data availability summary
    const storageContracts = [
      'StakingStorage',
      'IdentityStorage',
      'ProfileStorage',
      'ShardingTableStorage',
    ];
    const storageResults = this.results.filter((r) =>
      storageContracts.includes(r.contract),
    );
    const emptyStorage = storageResults.filter(
      (r) => r.message.includes('0') || r.status === 'WARNING',
    );

    if (emptyStorage.length > 0) {
      console.log('📊 MIGRATION DATA STATUS:');
      console.log('   Some storage contracts appear to have limited data.');
      console.log(
        "   This might be expected if migrations haven't run yet or if",
      );
      console.log(
        '   the fork block was before significant on-chain activity.',
      );
      console.log();
    } else {
      console.log('🎉 MIGRATION DATA STATUS:');
      console.log(
        '   All storage contracts appear to have data from previous migrations!',
      );
      console.log();
    }
  }

  async runValidation() {
    console.log('🚀 Starting DKG V8.1 Simulation Validation...\n');

    await this.loadContracts();

    // Run all validations
    await this.validateHub();
    await this.validateToken();
    await this.validateStakingStorage();
    await this.validateIdentityStorage();
    await this.validateProfileStorage();
    await this.validateShardingTableStorage();
    await this.validateChronos();
    await this.validateEpochStorage();
    await this.validateKnowledgeCollection();
    await this.validateAskStorage();

    await this.printResults();
  }
}

async function main() {
  const validator = new ContractValidator();
  await validator.runValidation();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
