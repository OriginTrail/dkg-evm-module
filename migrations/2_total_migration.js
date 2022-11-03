var BN = require('bn.js');

var Hub = artifacts.require('Hub'); // eslint-disable-line no-undef
var ShardingTable = artifacts.require('ShardingTable'); // eslint-disable-line no-undef
var AssertionRegistry = artifacts.require('AssertionRegistry'); // eslint-disable-line no-undef
var UAIRegistry = artifacts.require('UAIRegistry'); // eslint-disable-line no-undef
var assetRegistry = artifacts.require('assetRegistry'); // eslint-disable-line no-undef
var ERC20Token = artifacts.require('ERC20Token'); // eslint-disable-line no-undef
var ProfileStorage = artifacts.require('ProfileStorage'); // eslint-disable-line no-undef
var Profile = artifacts.require('Profile'); // eslint-disable-line no-undef

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
    let assertionRegistry, erc721Registry, erc20Token, profileStorage, profile, hub, shardingTable;

    switch (network) {
        case 'development':
        case 'ganache':
            await deployer.deploy(Hub, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    hub = result;
                });
            await hub.setContractAddress('Owner', accounts[0]);

            await deployer.deploy(ShardingTable, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    shardingTable = result;
                });
            await hub.setContractAddress('ShardingTable', shardingTable.address);

            await deployer.deploy(AssertionRegistry, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    assertionRegistry = result;
                });
            await hub.setContractAddress('AssertionRegistry', assertionRegistry.address);

            await deployer.deploy(UAIRegistry, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    erc721Registry = result;
                });
            await hub.setContractAddress('UAIRegistry', erc721Registry.address);

            await deployer.deploy(assetRegistry, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    assetRegistry = result;
                });
            await hub.setContractAddress('AssetRegistry', assetRegistry.address);

            await erc721Registry.setupRole(assetRegistry.address);

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

            await deployer.deploy(ProfileStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    profileStorage = result;
                });
            await hub.setContractAddress('ProfileStorage', profileStorage.address);

            await deployer.deploy(Profile, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    profile = result;
                });
            await hub.setContractAddress('Profile', profile.address);

            console.log('\n\n \t Contract adresses on ganache:');
            console.log(`\t Hub address: ${hub.address}`);
            console.log(`\t Sharding table: ${shardingTable.address}`);
            console.log(`\t Assertion registry address: ${assertionRegistry.address}`);
            console.log(`\t Asset registry address: ${assetRegistry.address}`);
            console.log(`\t Token address: ${erc20Token.address}`);
            console.log(`\t Profile storage address: ${profileStorage.address}`);
            console.log(`\t Profile address: ${profile.address}`);

            break;
        case 'rinkeby':
        case 'test':
        case 'mumbai':
        case 'otp':
            await deployer.deploy(Hub, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    hub = result;
                });
            await hub.setContractAddress('Owner', accounts[0]);

            await deployer.deploy(ShardingTable, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    shardingTable = result;
                });
            await hub.setContractAddress('ShardingTable', shardingTable.address);

            await deployer.deploy(AssertionRegistry, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    assertionRegistry = result;
                });
            await hub.setContractAddress('AssertionRegistry', assertionRegistry.address);

            await deployer.deploy(UAIRegistry, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    erc721Registry = result;
                });
            await hub.setContractAddress('UAIRegistry', erc721Registry.address);

            await deployer.deploy(assetRegistry, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    assetRegistry = result;
                });
            await hub.setContractAddress('AssetRegistry', assetRegistry.address);

            await erc721Registry.setupRole(assetRegistry.address);

            await hub.setContractAddress('Token', '0xFfFFFFff00000000000000000000000000000001');

            await deployer.deploy(ProfileStorage, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    profileStorage = result;
                });
            await hub.setContractAddress('ProfileStorage', profileStorage.address);

            await deployer.deploy(Profile, hub.address, {gas: 6000000, from: accounts[0]})
                .then((result) => {
                    profile = result;
                });
            await hub.setContractAddress('Profile', profile.address);

            console.log('\n\n \t Contract adresses on ganache:');
            console.log(`\t Hub address: ${hub.address}`);
            console.log(`\t Sharding table: ${shardingTable.address}`);
            console.log(`\t Assertion registry address: ${assertionRegistry.address}`);
            console.log(`\t Asset registry address: ${assetRegistry.address}`);
            console.log(`\t Token address: 0xFfFFFFff00000000000000000000000000000001`);
            console.log(`\t Profile storage address: ${profileStorage.address}`);
            console.log(`\t Profile address: ${profile.address}`);

            break;
        default:
            console.warn('Please use one of the following network identifiers: ganache');
            break;
    }
};
