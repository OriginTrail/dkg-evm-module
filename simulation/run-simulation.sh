#!/bin/bash

# This script runs the historical rewards simulation and logs the output to simulation.log

(npx hardhat run simulation/historical-rewards-simulation.ts --network localhost > simulation.log 2>&1) &
echo "PID $! running; follow with: tail -f simulation.log" 