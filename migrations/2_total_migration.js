var BN = require('bn.js');

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
var ContentAsset = artifacts.require('ContentAsset');
var ERC20Token = artifacts.require('ERC20Token');
var IdentityStorage = artifacts.require('IdentityStorage');
var IdentityContract = artifacts.require('Identity');
var ProfileStorage = artifacts.require('ProfileStorage');
var ProfileContract = artifacts.require('Profile');
var StakingStorage = artifacts.require('StakingStorage');
var StakingContract = artifacts.require('Staking');

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
        serviceAgreementStorageV1, serviceAgreementContractV1, contentAsset,
        erc20Token, identityStorage, identityContract, profileStorage,
        profileContract, stakingStorage, stakingContract;

    switch (network) {
        case 'development':
        case 'ganache':
        case 'rinkeby':
        case 'test':
        case 'mumbai':
            await deployer.deploy(Hub, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    hub = result;
                });
            await hub.setContractAddress('Owner', accounts[0]);

            /* ---------------------------------------ERC20------------------------------------------ */
            await deployer.deploy(ERC20Token, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    erc20Token = result;
                });
            await hub.setContractAddress('Token', erc20Token.address);

            await erc20Token.setupRole(accounts[0]);

            const amountToMint = (new BN(5)).mul((new BN(10)).pow(new BN(30)));

            if (network !== 'mumbai') {
                accounts = accounts.concat(testAccounts);
            }
            for (let account of accounts) {
                console.log('Account', account, 'is funded with', amountToMint.toString());
                await erc20Token.mint(account, amountToMint);
            }
            /* -------------------------------------------------------------------------------------- */

            /* -------------------------------Parameters Storage------------------------------------- */
            await deployer.deploy(ParametersStorage, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    parametersStorage = result;
                });
            await hub.setContractAddress('ParametersStorage', parametersStorage.address);
            /* -------------------------------------------------------------------------------------- */

            /* ----------------------------------Hashing Proxy--------------------------------------- */
            await deployer.deploy(HashingProxy, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    hashingProxy = result;
                });
            await hub.setContractAddress('HashingProxy', hashingProxy.address);

            await deployer.deploy(SHA256, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    sha256Contract = result;
                });

            // 1 - sha256
            await hashingProxy.setContractAddress(1, sha256Contract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ----------------------------------Scoring Proxy----------------------------------------- */
            await deployer.deploy(ScoringProxy, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    scoringProxy = result;
                });
            await hub.setContractAddress('ScoringProxy', scoringProxy.address);

            await deployer.deploy(Log2PLDSF, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    log2pldsfContract = result;
                });

            // 1 - Log2PLDSF
            await scoringProxy.setContractAddress(1, log2pldsfContract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ---------------------------------Assertion Storage-------------------------------------- */
            await deployer.deploy(AssertionStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    assertionStorage = result;
                });
            await hub.setContractAddress('AssertionStorage', assertionStorage.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ---------------------------------Identity Storage--------------------------------------- */
            await deployer.deploy(IdentityStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    identityStorage = result;
                });
            await hub.setContractAddress('IdentityStorage', identityStorage.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ------------------------------Sharding Table Storage------------------------------------ */
            await deployer.deploy(ShardingTableStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    shardingTableStorage = result;
                });
            await hub.setContractAddress('ShardingTableStorage', shardingTableStorage.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ----------------------------------Staking Storage--------------------------------------- */
            await deployer.deploy(StakingStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    stakingStorage = result;
                });
            await hub.setContractAddress('StakingStorage', stakingStorage.address);
            /* ---------------------------------------------------------------------------------------- */

            /* -----------------------------------Profile Storage-------------------------------------- */
            await deployer.deploy(ProfileStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    profileStorage = result;
                });
            await hub.setContractAddress('ProfileStorage', profileStorage.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ------------------------------Service Agreement Storage--------------------------------- */
            await deployer.deploy(ServiceAgreementStorageV1, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    serviceAgreementStorageV1 = result;
                });
            await hub.setContractAddress('ServiceAgreementStorageV1', serviceAgreementStorageV1.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ------------------------------------Assertion------------------------------------------- */
            await deployer.deploy(AssertionContract, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    assertionContract = result;
                });
            await hub.setContractAddress('Assertion', assertionContract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* -------------------------------------Identity------------------------------------------- */
            await deployer.deploy(IdentityContract, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    identityContract = result;
                });
            await hub.setContractAddress('Identity', identityContract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* -----------------------------------Sharding Table--------------------------------------- */
            await deployer.deploy(ShardingTableContract, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    shardingTableContract = result;
                });
            await hub.setContractAddress('ShardingTable', shardingTableContract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ---------------------------------------Staking------------------------------------------ */
            await deployer.deploy(StakingContract, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    stakingContract = result;
                });
            await hub.setContractAddress('Staking', stakingContract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ----------------------------------------Profile----------------------------------------- */
            await deployer.deploy(ProfileContract, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    profileContract = result;
                });
            await hub.setContractAddress('Profile', profileContract.address);
            /* ---------------------------------------------------------------------------------------- */

            /* -----------------------------------Service Agreement------------------------------------ */
            await deployer.deploy(ServiceAgreementContractV1, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    serviceAgreementContractV1 = result;
                });
            await hub.setContractAddress('ServiceAgreement', serviceAgreementContractV1.address);
            /* ---------------------------------------------------------------------------------------- */

            /* ----------------------------------------Assets------------------------------------------ */
            await deployer.deploy(ContentAsset, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    contentAsset = result;
                });
            await hub.setAssetContractAddress('ContentAsset', contentAsset.address);
            /* ---------------------------------------------------------------------------------------- */

            console.log('\n\n \t Contract adresses on ganache:');
            console.log(`\t Hub address: ${hub.address}`);
            console.log(`\t Parameters Storage address: ${parametersStorage.address}`);
            console.log(`\t Hashing Proxy address: ${hashingProxy.address}`);
            console.log(`\t SHA256 address: ${sha256Contract.address}`);
            console.log(`\t Scoring Proxy address: ${scoringProxy.address}`);
            console.log(`\t Log2PLDSF address: ${log2pldsfContract.address}`);
            console.log(`\t Sharding Table storage: ${shardingTableStorage.address}`);
            console.log(`\t Sharding Table: ${shardingTableContract.address}`);
            console.log(`\t Assertion Storage address: ${assertionStorage.address}`);
            console.log(`\t Assertion address: ${assertionContract.address}`);
            console.log(`\t Service Agreement Storage (V1) address: ${serviceAgreementStorageV1.address}`);
            console.log(`\t Service Agreement (V1) address: ${serviceAgreementContractV1.address}`);
            console.log(`\t Content Asset address: ${contentAsset.address}`);
            console.log(`\t Token address: ${erc20Token.address}`);
            console.log(`\t Identity Storage address: ${identityStorage.address}`);
            console.log(`\t Identity address: ${identityContract.address}`);
            console.log(`\t Profile Storage address: ${profileStorage.address}`);
            console.log(`\t Profile address: ${profileContract.address}`);
            console.log(`\t Staking Storage address: ${stakingStorage.address}`);
            console.log(`\t Staking address: ${stakingContract.address}`);

            break;
        default:
            console.warn('Please use one of the following network identifiers: ganache');
            break;
    }
};
