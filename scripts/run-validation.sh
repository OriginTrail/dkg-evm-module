#!/bin/bash

echo "🔍 Running DKG V8.1 Simulation Validation..."
echo "=========================================="

# Check if hardhat network is running
if ! nc -z localhost 8545 2>/dev/null; then
    echo "❌ Error: Hardhat forked network is not running on port 8545"
    echo "   Please start the forked network first with:"
    echo "   ./scripts/start-forked-nodes.sh base"
    exit 1
fi

echo "✅ Hardhat forked network detected on port 8545"
echo ""

# Run the validation script
npx hardhat run scripts/validate-simulation-setup.ts --network localhost

echo ""
echo "🎯 Validation completed!"
echo "   Review the results above to ensure all contracts are working correctly."
echo "   Pay special attention to any FAILED tests or storage contracts with no data." 