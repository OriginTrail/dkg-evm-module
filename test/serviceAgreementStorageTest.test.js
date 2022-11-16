const {assert} = require('chai');

const ContentAsset = artifacts.require('ContentAsset');
const ERC20Token = artifacts.require('ERC20Token');
const ServiceAgreementStorage = artifacts.require('ServiceAgreementStorage');
const Hub = artifacts.require('Hub');

const {
    formatAssertion,
    calculateRoot
} = require('assertion-tools');

let assertionCount = 0;

// Contracts used in test
let contentAsset;
let erc20Token;
let serviceAgreementStorage;
let hub

let callingWalletAddress;

const testAssetId = '0x1';
const invalidTestAssetid = '0x0';
const invalidTestTokenId = 1000;
const errorPrefix = 'Returned error: VM Exception while processing transaction: ';

const tokenAmount = 250;

contract('DKG v6 assets/ContentAsset', async (accounts) => {

    before(async () => {
        contentAsset = await ContentAsset.deployed();
        erc20Token = await ERC20Token.deployed();
        serviceAgreementStorage = await ServiceAgreementStorage.deployed();
        hub = await Hub.deployed();

        callingWalletAddress = accounts[1];

        await hub.setAssetContractAddress('SASTest', callingWalletAddress);

        // assertionRegistry = await AssertionRegistry.deployed();

        // const promises = [];
        // const amountToDeposit = 3000;
        // const tokenAmount = 1000000;
        //
        // for (let i = 0; i < accounts.length; i += 1) {
        //     promises.push(erc20Token.mint(
        //         accounts[i],
        //         tokenAmount,
        //         {from: accounts[0]},
        //     ));
        //
        //     promises.push(erc20Token.approve(
        //         serviceAgreementStorage.address,
        //         tokenAmount - amountToDeposit,
        //         {from: accounts[i]},
        //     ));
        // }
        // await Promise.all(promises);
    });


    it('Create service agreement, expect service agreement created', async () => {
        const agreementId = '0xf933067e474ab7f64f3af72094088ac7ff4de91cfdf0b52cffa30e6aef4a517a';
        const operationalWallet = accounts[2];
        const tokenId = 0;
        const keyword = '0x123';
        const hashingFunctionId = 0;
        const epochsNum = 5;
        const tokenAmount = 250;
        const scoringFunctionId = 0;

        await erc20Token.mint(
            operationalWallet,
            tokenAmount
        );

        await erc20Token.approve(
            serviceAgreementStorage.address,
            tokenAmount,
            {from: operationalWallet}
        );
        const contractBalanceBeforeCreate = await erc20Token.balanceOf(serviceAgreementStorage.address);
        const walletBalanceBeforeCreate = await erc20Token.balanceOf(operationalWallet);
        const result = await serviceAgreementStorage.createServiceAgreement(
            operationalWallet,
            contentAsset.address,
            tokenId,
            keyword,
            hashingFunctionId,
            epochsNum,
            tokenAmount,
            scoringFunctionId,
            {from: callingWalletAddress}
        );
        const contractBalanceAfterCreate = await erc20Token.balanceOf(serviceAgreementStorage.address);
        const walletBalanceAfterCreate = await erc20Token.balanceOf(operationalWallet);

        const contractBalanceDifference = contractBalanceAfterCreate.sub(contractBalanceBeforeCreate).toNumber();
        const walletBalanceDifference = walletBalanceBeforeCreate.sub(walletBalanceAfterCreate).toNumber();

        assert(contractBalanceDifference === tokenAmount, 'Wrong contract balance after sa create');
        assert(walletBalanceDifference === tokenAmount, 'Wrong wallet balance after sa create');

        const events = result.logs;
        assert(events.length === 1, 'Expected only 1 event to be emitted');
        const serviceAgreementCreatedEvent = events[0];
        assert(serviceAgreementCreatedEvent.event === 'ServiceAgreementCreated', 'Received wrong event name: ' + serviceAgreementCreatedEvent.event);
        assert(serviceAgreementCreatedEvent.args.agreementId === agreementId, 'Received wrong agreement id: ' + serviceAgreementCreatedEvent.args.agreementId);
        assert(serviceAgreementCreatedEvent.args.assetContract === contentAsset.address, 'Wrong asset contract received: ' + serviceAgreementCreatedEvent.args.assetContract);
        assert(serviceAgreementCreatedEvent.args.tokenId.toNumber() === tokenId, 'Wrong token id received');
        assert(serviceAgreementCreatedEvent.args.hashingFunctionId.toNumber() === hashingFunctionId, 'Wrong hashing function id received');
        assert(serviceAgreementCreatedEvent.args.tokenAmount.toNumber() === tokenAmount, 'Wrong token amount received');
        assert(serviceAgreementCreatedEvent.args.epochsNum.toNumber() === epochsNum, 'Wrong epochs number received');

    });

    it('Update service agreement, expect service agreement updated', async () => {

        const operationalWallet = accounts[3];
        const tokenId = 1;
        const keyword = '0x1234';
        const hashingFunctionId = 0;
        const epochsNum = 3;
        const tokenAmount = 150;
        const scoringFunctionId = 0;

        await erc20Token.mint(
            operationalWallet,
            tokenAmount
        );

        await erc20Token.approve(
            serviceAgreementStorage.address,
            tokenAmount,
            {from: operationalWallet}
        );

        const result = await serviceAgreementStorage.createServiceAgreement(
            operationalWallet,
            contentAsset.address,
            tokenId,
            keyword,
            hashingFunctionId,
            epochsNum,
            tokenAmount,
            scoringFunctionId,
            {from: callingWalletAddress}
        );

        const agreementId = result.logs[0].args.agreementId;


    });
});
