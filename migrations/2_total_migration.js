var ethers = require('ethers');
const fs = require('fs');
var Hub = artifacts.require('Hub');
var ParametersStorage = artifacts.require('ParametersStorage');
var HashingProxy = artifacts.require('HashingProxy');
var SHA256 = artifacts.require('SHA256');
var ScoringProxy = artifacts.require('ScoringProxy');
var Log2PLDSF = artifacts.require('Log2PLDSF');
var ShardingTableStorage = artifacts.require('ShardingTableStorage');
var ShardingTableContract = artifacts.require('ShardingTable');
var AssertionStorage = artifacts.require('AssertionStorage');
var AssertionContract = artifacts.require('Assertion');
var ServiceAgreementStorageV1 = artifacts.require('ServiceAgreementStorageV1');
var ServiceAgreementContractV1 = artifacts.require('ServiceAgreementV1');
var ContentAssetStorage = artifacts.require('ContentAssetStorage');
var ContentAsset = artifacts.require('ContentAsset');
var ERC20Token = artifacts.require('ERC20Token');
var IdentityStorage = artifacts.require('IdentityStorage');
var IdentityContract = artifacts.require('Identity');
var ProfileStorage = artifacts.require('ProfileStorage');
var ProfileContract = artifacts.require('Profile');
var StakingStorage = artifacts.require('StakingStorage');
var StakingContract = artifacts.require('Staking');
var WhitelistStorage = artifacts.require('WhitelistStorage');

const testAccounts = ["0xd6879C0A03aDD8cFc43825A42a3F3CF44DB7D2b9",
    "0x2f2697b2a7BB4555687EF76f8fb4C3DFB3028E57",
    "0xBCc7F04c73214D160AA6C892FcA6DB881fb3E0F5",
    "0xE4745cE633c2a809CDE80019D864538ba95201E3",
    "0x193a22749001fA75497fb8fcCE11235947a19b3d",
    "0xFFEE9a020c3DdDE30D0391254E05c8Fe8DC4a680",
    "0xBBC863B0776f5F8F816dD71e85AaA81449A87D9A",
    "0x64B592e8e9AF51Eb0DBa5d4c18b817C01e8e75a8",
    "0xb664cf668534FDE04cF43173e2187b7a9196bfC3",
    "0xCE81B24feDb116FaC5A887ED7706B05A46060079",
    "0xcF9c758Ae7C21D8048Fc1C3cb6164Ff37A5b205e",
    "0xC8b866F2dD57d2889a7cccB989cfb42dB4579411",
    "0xD242D54ed86A64909d0f990bCe608b065ed07559",
    "0x3368d4DBeC10220D7Ba73c3FC65977ED215C62Fc",
    "0x9d2934024ccC3995056E7E067184B3B0bB8B66Ab",
    "0x73DF1C18F18AA54DB018b3273E44b1A4713c5fE2",
    "0xd2c714a04fEA61C599815ec57fAf25ba4F4d496B",
    "0xBA9d00b748217381674E277D2447fcaCB78bcAc7",
    "0x34734d828d39ce0B3C8ad22B8578Cd2E3236F277",
    "0xCF4d6f24Ca163D14389C38DD0C7e89718d17090a",
    "0xD15Eb6bF044ed36DfDd2e3a3b84aB81AaB15881D",
    "0x06FD6319da4199BD55AA283787b9fd802082191d",
    "0xc3C828F5B357638265cC09Dd479F60A8E1190801",
    "0x50d2af71026c60648c612190ce92e8257c69B419",
    "0x4e6c7afa684B54980aE15aEA191911E3D9B47aba",
    "0x4a68eD404bBd120a3bdab1748dc36EE43a5AE42d",
    "0xDdbc8EA86Ec762AA4a7aC985fF3c7E7087be9e3B",
    "0xf68B2609F1E240e501D78c78276D7314ba298025",
    "0xBaF76aC0d0ef9a2FFF76884d54C9D3e270290a43"];



module.exports = async (deployer, network, accounts) => {
    let hub, parametersStorage, hashingProxy, sha256Contract, scoringProxy,
        log2pldsfContract, shardingTableStorage, shardingTableContract,
        serviceAgreementStorageV1, serviceAgreementContractV1, contentAssetStorage,
        contentAsset, erc20Token, identityStorage, identityContract, profileStorage,
        profileContract, stakingStorage, stakingContract, withdrawalStorage;

    const filePath = `reports/${network}_contracts.json`;

    const deployContract = async (Contract, account, passHubInConstructor, retryCount = 0) => {
        return new Promise(async (accept, reject) => {
            try {
                if (passHubInConstructor) {
                    await deployer.deploy(Contract, hub.address, {gas: 6000000, from: account}).then((result) => {
                        accept(result);
                    });
                } else {
                    await deployer.deploy(Contract, {gas: 6000000, from: account}).then((result) => {
                        accept(result);
                    });
                }

            } catch (error) {
                console.log(`Error while deploying contract. Error: ${error}`);
                reject(error);
            }
        });

    };

    const saveReport = (deployedContracts) => {
        if (network !== 'test') {
            // save deployed contracts report
            deployedContracts.deployedTimestamp = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(deployedContracts, null, 4));
        }
    }

    const initializeContract = async (deployedContracts, contractName, ContractObject, deployerAddress, passHubInConstructor = false, setContractInHub = true, setAssetInHub = false) => {
        let contractInstance;
        if (!deployedContracts.contracts[contractName]?.deployed) {
            console.log(`Deploying ${contractName} contract`);
            contractInstance = await deployContract(ContractObject, deployerAddress, passHubInConstructor);

            if (setContractInHub) {
                await hub.setContractAddress(contractName, contractInstance.address);
            }
            if (setAssetInHub) {
                await hub.setAssetStorageAddress(contractName, contractInstance.address);
            }
            deployedContracts.contracts[contractName] = {
                evmAddress: contractInstance.address,
                deployed: true
            }
            saveReport(deployedContracts);
        } else {
            console.log(`${contractName} contract already deployed at address: ${deployedContracts.contracts[contractName].evmAddress}`, );
            contractInstance = await ContractObject.at(deployedContracts.contracts[contractName].evmAddress);
        }
        return contractInstance;
    }
    const deployerAddress = accounts[0];
    console.log('==========================');
    console.log(`Using deployer address: ${deployerAddress}`);
    console.log(`DEPLOYING TO: ${network} `);
    console.log('==========================');

    switch (network) {
        case 'development':
        case 'ganache':
        case 'rinkeby':
        case 'test':
            // initFile = {};
            // initFile.contracts = {};
            // fs.writeFileSync(filePath, JSON.stringify(initFile, null, 4));
        case 'otp_devnet':
        case 'otp_testnet':
        case 'otp_mainnet':
        case 'mumbai':
            let deployedContracts = {
                contracts: {}
            }
            if (fs.existsSync(`./reports/${network}_contracts.json`)) {
                deployedContracts = require(`./../reports/${network}_contracts.json`);
            }
            try {
                // hub contract
               if (!deployedContracts.contracts.hub?.deployed) {
                    console.log('Deploying hub contract');
                    hub = await deployContract(Hub, deployerAddress)
                    await hub.setContractAddress('Owner', deployerAddress);
                    deployedContracts.contracts.hub = {
                        evmAddress: hub.address,
                        deployed: true
                    }
                    saveReport(deployedContracts);
                } else {
                    console.log('Hub contract already deployed at address: ', deployedContracts.contracts.hub.evmAddress);
                    hub = await Hub.at(deployedContracts.contracts.hub.evmAddress);
                }
                /* ---------------------------------------ERC20-------------------------------------------- */
                if (deployedContracts.contracts.TokenContract?.evmAddress) {
                    await hub.setContractAddress('Token', deployedContracts.contracts.TokenContract?.evmAddress);
                } else {
                    erc20Token = await initializeContract(
                        deployedContracts,
                        'Token',
                        ERC20Token,
                        deployerAddress,
                        true
                    );
                    await erc20Token.setupRole(deployerAddress);
                    const amountToMint = ethers.utils.parseEther(`${5 * (10 ** 12)}`);

                    if (network !== 'mumbai') {
                        accounts = accounts.concat(testAccounts);
                    }
                    for (let account of accounts) {
                        await erc20Token.mint(account, amountToMint);
                    }
                }
                /* ---------------------------------------------------------------------------------------- */

                /* ----------------------------------Parameters Storage------------------------------------ */
                parametersStorage = await initializeContract(
                    deployedContracts,
                    'ParametersStorage',
                    ParametersStorage,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* -----------------------------------Whitelist Storage------------------------------------ */
                whitelistStorage = await initializeContract(
                    deployedContracts,
                    'WhitelistStorage',
                    WhitelistStorage,
                    deployerAddress,
                    true,
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ------------------------------------Hashing Proxy--------------------------------------- */
                hashingProxy = await initializeContract(
                    deployedContracts,
                    'HashingProxy',
                    HashingProxy,
                    deployerAddress,
                    true
                );
                sha256Contract = await initializeContract(
                    deployedContracts,
                    'sha256Contract',
                    SHA256,
                    deployerAddress,
                    false,
                    false
                );
                await hashingProxy.setContractAddress(1, sha256Contract.address);
                /* ---------------------------------------------------------------------------------------- */

                /* -----------------------------------Scoring Proxy---------------------------------------- */
                scoringProxy = await initializeContract(
                    deployedContracts,
                    'ScoringProxy',
                    ScoringProxy,
                    deployerAddress,
                    true
                );

                log2pldsfContract = await initializeContract(
                    deployedContracts,
                    'log2pldsfContract',
                    Log2PLDSF,
                    deployerAddress,
                    true,
                    false
                );
                await scoringProxy.setContractAddress(1, log2pldsfContract.address);
                /* ---------------------------------------------------------------------------------------- */

                /* ----------------------------------Assertion Storage------------------------------------- */
                assertionStorage = await initializeContract(
                    deployedContracts,
                    'AssertionStorage',
                    AssertionStorage,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* -----------------------------------Identity Storage------------------------------------- */
                identityStorage = await initializeContract(
                    deployedContracts,
                    'IdentityStorage',
                    IdentityStorage,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* --------------------------------Sharding Table Storage---------------------------------- */
                shardingTableStorage = await initializeContract(
                    deployedContracts,
                    'ShardingTableStorage',
                    ShardingTableStorage,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ------------------------------------Staking Storage------------------------------------- */
                stakingStorage = await initializeContract(
                    deployedContracts,
                    'StakingStorage',
                    StakingStorage,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ------------------------------------Profile Storage------------------------------------- */
                profileStorage = await initializeContract(
                    deployedContracts,
                    'ProfileStorage',
                    ProfileStorage,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* --------------------------------Service Agreement Storage------------------------------- */
                serviceAgreementStorageV1 = await initializeContract(
                    deployedContracts,
                    'ServiceAgreementStorageV1',
                    ServiceAgreementStorageV1,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ----------------------------------Content Asset Storage--------------------------------- */
                contentAssetStorage = await initializeContract(
                    deployedContracts,
                    'ContentAssetStorage',
                    ContentAssetStorage,
                    deployerAddress,
                    true,
                    false,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* -------------------------------------Assertion------------------------------------------ */
                assertionContract = await initializeContract(
                    deployedContracts,
                    'Assertion',
                    AssertionContract,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* --------------------------------------Identity------------------------------------------ */
                identityContract = await initializeContract(
                    deployedContracts,
                    'Identity',
                    IdentityContract,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ------------------------------------Sharding Table-------------------------------------- */
                shardingTableContract = await initializeContract(
                    deployedContracts,
                    'ShardingTable',
                    ShardingTableContract,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ----------------------------------------Staking----------------------------------------- */
                stakingContract = await initializeContract(
                    deployedContracts,
                    'Staking',
                    StakingContract,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ----------------------------------------Profile----------------------------------------- */
                profileContract = await initializeContract(
                    deployedContracts,
                    'Profile',
                    ProfileContract,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ------------------------------------Service Agreement----------------------------------- */
                serviceAgreementContractV1 = await initializeContract(
                    deployedContracts,
                    'ServiceAgreementV1',
                    ServiceAgreementContractV1,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                /* ----------------------------------------Assets------------------------------------------ */
                contentAsset = await initializeContract(
                    deployedContracts,
                    'ContentAsset',
                    ContentAsset,
                    deployerAddress,
                    true
                );
                /* ---------------------------------------------------------------------------------------- */

                console.log('Contracts deployed, report can be found in file: ', filePath);
            } catch (error) {
                console.log(error);
            }
            break;
        default:
            console.warn('Please use one of the following network identifiers: ganache');
            break;
    }
};
