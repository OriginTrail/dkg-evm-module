const {assert} = require('chai');


const ERC20Token = artifacts.require('ERC20Token');
const Identity = artifacts.require('Identity');
const IdentityStorage = artifacts.require('IdentityStorage');


// Contracts used in test
let erc20Token, identity, identityStorage;

const testAssetId = '0x1';
const invalidTestAssetid = '0x0';
const invalidTestTokenId = 1000;
const errorPrefix = 'Returned error: VM Exception while processing transaction: ';

const tokenAmount = 250;

contract('DKG v6 Identity', async (accounts) => {

    before(async () => {
        erc20Token = await ERC20Token.deployed();
        identity = await Identity.deployed();
        identityStorage = await IdentityStorage.deployed();

        const promises = [];
        const tokenAmount = 1000000;

        for (let i = 0; i < accounts.length; i += 1) {
            promises.push(erc20Token.mint(
                accounts[i],
                tokenAmount,
                {from: accounts[0]},
            ));
        }
        await Promise.all(promises);
    });


    it('Create an identity; only contracts can create identity; expect to fail', async () => {

    });


});

