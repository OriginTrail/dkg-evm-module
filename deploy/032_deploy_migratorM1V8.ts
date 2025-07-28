import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import {
  HUB_OWNERS,
  NETWORK_HUBS,
  OLD_HUB_ADDRESSES,
} from '../simulation/helpers/simulation-constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  let hubAddress: string;
  let chainName: string;

  console.log(
    '[000 DEPLOYMENT] Detecting forked chain by checking Hub addresses...',
  );

  for (const [address, chain] of Object.entries(NETWORK_HUBS)) {
    try {
      const testHub = await hre.ethers.getContractAt('Hub', address);
      const hubName = await testHub.name();
      if (hubName === 'Hub') {
        hubAddress = address;
        chainName = chain;
        console.log(
          `[000 DEPLOYMENT] Found active Hub at ${address} for ${chain}`,
        );
        break;
      }
    } catch {
      continue;
    }
  }

  if (!hubAddress! || !chainName!) {
    throw new Error(
      '[000 DEPLOYMENT] Could not detect which chain is being forked. No known Hub addresses responded.',
    );
  }

  const oldHubAddress =
    OLD_HUB_ADDRESSES[chainName as keyof typeof OLD_HUB_ADDRESSES];

  console.log(`Deploying MigratorM1V8 with:`);
  console.log(`  New Hub: ${hubAddress}`);
  console.log(`  Old Hub: ${oldHubAddress}`);

  const MigratorM1V8 = await hre.helpers.deploy({
    newContractName: 'MigratorM1V8',
    passHubInConstructor: false,
    additionalArgs: [hubAddress, oldHubAddress],
  });

  const hubOwner = HUB_OWNERS[hubAddress as keyof typeof HUB_OWNERS];
  if (!hubOwner) {
    throw new Error(`Hub owner not found for Hub address: ${hubAddress}`);
  }

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);
  const fundingAmount = hre.ethers.parseEther('1.0'); // 1 ETH should be enough

  await deployerSigner.sendTransaction({
    to: hubOwner,
    value: fundingAmount,
  });

  await hre.network.provider.send('hardhat_impersonateAccount', [hubOwner]);

  // Set up initialization calls for the migrator
  // These will be executed after deployment to connect to old and new contract systems
  hre.helpers.setParametersEncodedData.push({
    contractName: 'MigratorM1V8',
    encodedData: [
      MigratorM1V8.interface.encodeFunctionData('initializeOldContracts', []),
      MigratorM1V8.interface.encodeFunctionData('initializeNewContracts', []),
      MigratorM1V8.interface.encodeFunctionData(
        'initiateDelegatorsMigration',
        [],
      ),
    ],
  });

  await hre.network.provider.send('hardhat_stopImpersonatingAccount', [
    hubOwner,
  ]);

  console.log(`MigratorM1V8 deployed at: ${await MigratorM1V8.getAddress()}`);
};

export default func;
func.tags = ['MigratorM1V8'];
func.dependencies = [
  'Hub',
  'IdentityStorage',
  'ProfileStorage',
  'StakingStorage',
  'Ask',
];
