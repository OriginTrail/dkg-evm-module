#!/bin/bash

# Process delegators for all chains
# Usage: ./scripts/process_all_chains_delegators.sh <input_directory> <output_directory>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <input_directory> <output_directory>"
    echo ""
    echo "Example:"
    echo "  ./scripts/process_all_chains_delegators.sh /path/to/delegators ./output"
    echo ""
    echo "Expected input files in directory:"
    echo "  - base_mainnet_ALL_NODES.json"
    echo "  - base_mainnet_unmigrated_delegators.json"
    echo "  - base-mainnet.txt"
    echo "  - gnosis_mainnet_ALL_NODES.json"
    echo "  - gnosis_mainnet_unmigrated_delegators.json"
    echo "  - gnosis-mainnet.txt"
    echo "  - neuroweb_mainnet_ALL_NODES.json"
    echo "  - neuroweb_mainnet_unmigrated_delegators.json"
    echo "  - neuroweb-mainnet.txt"
    exit 1
fi

INPUT_DIR="$1"
OUTPUT_DIR="$2"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Define chains
CHAINS=("base_mainnet" "gnosis_mainnet" "neuroweb_mainnet")

echo "🚀 Processing delegators for all chains..."
echo "📁 Input directory: $INPUT_DIR"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

for CHAIN in "${CHAINS[@]}"; do
    echo "⛓️  Processing $CHAIN..."
    
    ALL_NODES_FILE="$INPUT_DIR/${CHAIN}_ALL_NODES.json"
    UNMIGRATED_FILE="$INPUT_DIR/${CHAIN}_unmigrated_delegators.json"

    # Construct additional delegators filename (e.g., base_mainnet -> base-mainnet.txt)
    ADDITIONAL_DELEGATORS_FILENAME_BASE=$(echo "$CHAIN" | sed 's/_mainnet/-mainnet/')
    ADDITIONAL_DELEGATORS_FILE="$INPUT_DIR/${ADDITIONAL_DELEGATORS_FILENAME_BASE}.txt"

    OUTPUT_FILE="$OUTPUT_DIR/${CHAIN}_delegators.json"
    
    # Check if input files exist
    if [ ! -f "$ALL_NODES_FILE" ]; then
        echo "   ❌ Missing: $ALL_NODES_FILE"
        continue
    fi
    
    if [ ! -f "$UNMIGRATED_FILE" ]; then
        echo "   ❌ Missing: $UNMIGRATED_FILE"
        continue
    fi

    if [ ! -f "$ADDITIONAL_DELEGATORS_FILE" ]; then
        echo "   ❌ Missing: $ADDITIONAL_DELEGATORS_FILE"
        continue
    fi
    
    # Process the chain
    echo "   📖 Processing $CHAIN..."
    npx ts-node simulation/scripts/extract_delegators_by_node.ts "$ALL_NODES_FILE" "$UNMIGRATED_FILE" "$ADDITIONAL_DELEGATORS_FILE" "$OUTPUT_FILE"
    
    if [ $? -eq 0 ]; then
        echo "   ✅ $CHAIN completed successfully"
        echo "   💾 Output: $OUTPUT_FILE"
    else
        echo "   ❌ $CHAIN failed"
    fi
    
    echo ""
done

echo "🎉 All chains processed!"
echo ""
echo "📋 Summary of output files:"
for CHAIN in "${CHAINS[@]}"; do
    OUTPUT_FILE="$OUTPUT_DIR/${CHAIN}_delegators.json"
    if [ -f "$OUTPUT_FILE" ]; then
        echo "   ✅ $OUTPUT_FILE"
    else
        echo "   ❌ $OUTPUT_FILE (not created)"
    fi
done 