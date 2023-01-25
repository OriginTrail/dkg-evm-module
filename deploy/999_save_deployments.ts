import * as fs from 'fs';

import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.name.startsWith('otp')) {
    return;
  }

  hre.helpers.contractDeployments.deployedTimestamp = Date.now();

  fs.writeFileSync(
    `deployments/${hre.network.name}_contracts.json`,
    JSON.stringify(hre.helpers.contractDeployments, null, 4),
  );
};

export default func;
func.runAtTheEnd = true;
