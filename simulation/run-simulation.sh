#!/bin/bash

# This script runs the historical rewards simulation and logs the output to simulation.log

npx hardhat run simulation/historical-rewards-simulation.ts --network localhost 2>&1 | tee simulation.log 