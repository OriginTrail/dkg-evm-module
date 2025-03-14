import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  if (!hre.helpers.isDeployed('Paymaster')) {
    if (hre.network.config.environment === 'development') {
      hre.helpers.resetDeploymentsJson();
      console.log('Hardhat deployments config reset.');
    }

    const hub = await deployments.get('Hub');

    const paymasterDeploymentResult = await deployments.deploy('Paymaster', {
      contract: 'Paymaster',
      from: deployer,
      args: [hub.address, deployer],
      log: true,
    });

    await hre.helpers.updateDeploymentsJson(
      'Paymaster',
      paymasterDeploymentResult.address,
      paymasterDeploymentResult.receipt!.blockNumber,
    );
  }
};

export default func;
func.tags = ['Paymaster'];
func.dependencies = [
  'Hub',
];
