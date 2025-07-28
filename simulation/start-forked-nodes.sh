#!/bin/bash

# DKG V8.0 to V8.1 Simulation - Start Forked Nodes
# This script helps start forked nodes for all three chains

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting DKG V8.0 to V8.1 Simulation Forked Nodes${NC}"
echo ""

# Load environment variables from .env file
if [ -f .env ]; then
    echo -e "${GREEN}📝 Loading environment variables from .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
    echo ""
else
    echo -e "${YELLOW}⚠️  No .env file found, using existing environment variables${NC}"
    echo ""
fi

# Check if RPC endpoints are configured
if [ -z "$RPC_BASE_MAINNET" ]; then
    echo -e "${RED}❌ Error: RPC_BASE_MAINNET environment variable not set${NC}"
    echo "Please set your Base mainnet RPC endpoint in .env file"
    exit 1
fi

if [ -z "$RPC_NEUROWEB_MAINNET" ]; then
    echo -e "${RED}❌ Error: RPC_NEUROWEB_MAINNET environment variable not set${NC}"
    echo "Please set your Neuroweb mainnet RPC endpoint in .env file"
    exit 1
fi

if [ -z "$RPC_GNOSIS_MAINNET" ]; then
    echo -e "${RED}❌ Error: RPC_GNOSIS_MAINNET environment variable not set${NC}"
    echo "Please set your Gnosis mainnet RPC endpoint in .env file"
    exit 1
fi

# Function to start a forked node
start_forked_node() {
    local chain_name=$1
    local rpc_url=$2
    local fork_block=$3
    local port=$4
    
    echo -e "${YELLOW}🔧 Starting $chain_name forked node...${NC}"
    echo "   RPC: $rpc_url"
    echo "   Fork Block: $fork_block"
    echo "   Port: $port"
    echo "   Note: Will deploy fresh V8.1. contracts"
    echo ""

    local log="hardhat-${chain_name// /_}.log"

    (npx hardhat node --fork $rpc_url --fork-block-number $fork_block --config hardhat.simulation.config.ts --port $port > $log 2>&1) &
    echo "PID $! running; follow with: tail -f $log"
}

# Parse command line argument  
if [ "$1" = "base" ]; then
    echo -e "${GREEN}Starting Base mainnet fork only${NC}"
    start_forked_node "Base Mainnet" "$RPC_BASE_MAINNET" "24277327" "8545"
elif [ "$1" = "neuroweb" ]; then
    echo -e "${GREEN}Starting Neuroweb mainnet fork only${NC}"
    start_forked_node "Neuroweb Mainnet" "$RPC_NEUROWEB_MAINNET" "7266256" "8546"
elif [ "$1" = "gnosis" ]; then
    echo -e "${GREEN}Starting Gnosis mainnet fork only${NC}"
    start_forked_node "Gnosis Mainnet" "$RPC_GNOSIS_MAINNET" "37746315" "8547"
else
    echo -e "${YELLOW}Usage: $0 [base|neuroweb|gnosis]${NC}"
    echo ""
    echo "Examples:"
    echo "  $0 base      # Start Base mainnet fork on port 8545"
    echo "  $0 neuroweb  # Start Neuroweb mainnet fork on port 8546"
    echo "  $0 gnosis    # Start Gnosis mainnet fork on port 8547"
    echo ""
    echo "Or run manually:"
    echo "  HARDHAT_FORK_URL=\$RPC_BASE_MAINNET HARDHAT_FORK_BLOCK=24277327 npx hardhat node --config hardhat.simulation.config.ts --port 8545"
    echo ""
fi 