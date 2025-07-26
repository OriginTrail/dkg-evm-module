import * as fs from 'fs';
import * as path from 'path';

// Input data structures
type NodeData = {
  identityId: number;
  delegators: Array<{
    delegatorAddress: string;
    delegatorStakeBase: string;
  }>;
};

type UnmigratedDelegator = {
  stakerAddress: string;
  identityId: number;
  tracBalance: string;
};

// Output data structure
type NodeDelegators = {
  identity: number;
  delegators: string[];
};

/**
 * Extracts and groups delegators by node identity from two data sources:
 * 1. Current delegators from ALL_NODES file
 * 2. Unmigrated delegators from separate file
 *
 * Uses Sets for efficient deduplication, then converts to arrays for output.
 */
function extractDelegatorsByNode(
  allNodesFilePath: string,
  unmigratedDelegatorsFilePath: string,
  outputFilePath: string,
): void {
  try {
    console.log('📖 Reading input files...');

    // Read and parse input files
    const allNodesData: NodeData[] = JSON.parse(
      fs.readFileSync(allNodesFilePath, 'utf8'),
    );

    const unmigratedDelegators: UnmigratedDelegator[] = JSON.parse(
      fs.readFileSync(unmigratedDelegatorsFilePath, 'utf8'),
    );

    console.log(
      `📊 Processing ${allNodesData.length} nodes and ${unmigratedDelegators.length} unmigrated delegators...`,
    );

    // Use Map with Sets for efficient deduplication
    const delegatorSetsByIdentity = new Map<number, Set<string>>();

    // Step 1: Process current delegators from ALL_NODES file
    console.log('🔄 Processing current delegators...');
    processCurrentDelegators(allNodesData, delegatorSetsByIdentity);

    // Step 2: Process unmigrated delegators
    console.log('🔄 Processing unmigrated delegators...');
    processUnmigratedDelegators(unmigratedDelegators, delegatorSetsByIdentity);

    // Step 3: Convert Sets to sorted arrays and create final output
    console.log('🔄 Creating final output...');
    const finalOutput = createFinalOutput(delegatorSetsByIdentity);

    // Step 4: Save output file
    fs.writeFileSync(outputFilePath, JSON.stringify(finalOutput, null, 2));

    // Step 5: Display statistics
    displayStatistics(finalOutput, outputFilePath);
  } catch (error) {
    console.error('❌ Error processing files:', error);
    process.exit(1);
  }
}

/**
 * Processes current delegators from the ALL_NODES file
 */
function processCurrentDelegators(
  allNodesData: NodeData[],
  delegatorSetsByIdentity: Map<number, Set<string>>,
): void {
  allNodesData.forEach((node) => {
    const { identityId, delegators } = node;

    // Initialize Set for this identity if it doesn't exist
    if (!delegatorSetsByIdentity.has(identityId)) {
      delegatorSetsByIdentity.set(identityId, new Set<string>());
    }

    const delegatorSet = delegatorSetsByIdentity.get(identityId)!;

    // Add all current delegators (Set automatically handles deduplication)
    delegators.forEach((delegator) => {
      const normalizedAddress = delegator.delegatorAddress.toLowerCase();
      delegatorSet.add(normalizedAddress);
    });
  });
}

/**
 * Processes unmigrated delegators, adding only new ones not already present
 */
function processUnmigratedDelegators(
  unmigratedDelegators: UnmigratedDelegator[],
  delegatorSetsByIdentity: Map<number, Set<string>>,
): void {
  let duplicatesFound = 0;
  let newDelegatorsAdded = 0;

  unmigratedDelegators.forEach((delegator) => {
    const { stakerAddress, identityId } = delegator;
    const normalizedAddress = stakerAddress.toLowerCase();

    // Initialize Set for this identity if it doesn't exist
    if (!delegatorSetsByIdentity.has(identityId)) {
      delegatorSetsByIdentity.set(identityId, new Set<string>());
    }

    const delegatorSet = delegatorSetsByIdentity.get(identityId)!;
    const sizeBefore = delegatorSet.size;

    // Try to add the delegator (Set will ignore if already exists)
    delegatorSet.add(normalizedAddress);

    // Check if it was actually added (new) or ignored (duplicate)
    if (delegatorSet.size > sizeBefore) {
      newDelegatorsAdded++;
    } else {
      duplicatesFound++;
      console.log(
        `⚠️  Delegator ${stakerAddress} already exists for identity ${identityId} in current data`,
      );
    }
  });

  console.log(`   ✅ Added ${newDelegatorsAdded} new unmigrated delegators`);
  console.log(`   ⚠️  Found ${duplicatesFound} duplicates (ignored)`);
}

/**
 * Converts Sets to sorted arrays and creates the final output structure
 */
function createFinalOutput(
  delegatorSetsByIdentity: Map<number, Set<string>>,
): NodeDelegators[] {
  const output: NodeDelegators[] = Array.from(delegatorSetsByIdentity.entries())
    .map(([identityId, delegatorSet]) => ({
      identity: identityId,
      delegators: Array.from(delegatorSet).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.identity - b.identity);

  return output;
}

/**
 * Displays processing statistics and save confirmation
 */
function displayStatistics(
  output: NodeDelegators[],
  outputFilePath: string,
): void {
  let totalDelegators = 0;
  let nodesWithDelegators = 0;

  output.forEach((node) => {
    totalDelegators += node.delegators.length;

    if (node.delegators.length > 0) {
      nodesWithDelegators++;
      console.log(
        `✅ Identity ${node.identity}: ${node.delegators.length} delegators`,
      );
    }
  });

  console.log('\n📈 Summary:');
  console.log(`   Total nodes processed: ${output.length}`);
  console.log(`   Nodes with delegators: ${nodesWithDelegators}`);
  console.log(`   Total unique delegators: ${totalDelegators}`);
  console.log(`\n💾 Output saved to: ${outputFilePath}`);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length !== 3) {
    console.log('📋 Delegator Extraction Script');
    console.log('===============================');
    console.log('');
    console.log(
      'Usage: npx ts-node scripts/extract_delegators_by_node.ts <all_nodes_file> <unmigrated_delegators_file> <output_file>',
    );
    console.log('');
    console.log('Parameters:');
    console.log(
      '  all_nodes_file              Path to the ALL_NODES.json file',
    );
    console.log(
      '  unmigrated_delegators_file  Path to the unmigrated_delegators.json file',
    );
    console.log('  output_file                 Path for the output JSON file');
    console.log('');
    console.log('Example:');
    console.log('  npx ts-node scripts/extract_delegators_by_node.ts \\');
    console.log('    /path/to/base_mainnet_ALL_NODES.json \\');
    console.log('    /path/to/base_mainnet_unmigrated_delegators.json \\');
    console.log('    ./output/base_mainnet_delegators_by_node.json');
    console.log('');
    console.log('Output format:');
    console.log(
      '  [{ "identity": 1, "delegators": ["0x123...", "0x456..."] }]',
    );
    process.exit(1);
  }

  const [allNodesFilePath, unmigratedDelegatorsFilePath, outputFilePath] = args;

  // Validate input files exist
  console.log('🔍 Validating input files...');

  if (!fs.existsSync(allNodesFilePath)) {
    console.error(`❌ All nodes file not found: ${allNodesFilePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(unmigratedDelegatorsFilePath)) {
    console.error(
      `❌ Unmigrated delegators file not found: ${unmigratedDelegatorsFilePath}`,
    );
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDir)) {
    console.log(`📁 Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('🚀 Starting delegator extraction...');
  console.log('');

  extractDelegatorsByNode(
    allNodesFilePath,
    unmigratedDelegatorsFilePath,
    outputFilePath,
  );
}

export { extractDelegatorsByNode };
