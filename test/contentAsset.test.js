const {assert} = require('chai');
const { ethers } = require('ethers');
const truffleAssert = require("truffle-assertions");
const {
    formatAssertion,
    calculateRoot
} = require('assertion-tools');
const BN = require("bn.js");

const ContentAsset = artifacts.require('ContentAsset');
const ContentAssetStorage = artifacts.require('ContentAssetStorage');
const ERC20Token = artifacts.require('ERC20Token');
const ServiceAgreementStorageV1 = artifacts.require('ServiceAgreementStorageV1');
const ServiceAgreementV1 = artifacts.require('ServiceAgreementV1');

let assertionCount = 0;

// Contracts used in test
let contentAsset, contentAssetStorage;
let erc20Token;
let serviceAgreementStorageV1;
let serviceAgreementV1;
let newTokenId;

const testAssetId = '0x1';
const invalidTestAssetid = '0x0';
const invalidTestTokenId = 1000;
const ETH_DECIMALS = new BN('1000000000000000000');
const tokenAmount = 250;

contract('DKG v6 assets/ContentAsset', async (accounts) => {

    before(async () => {
        contentAssetStorage = await ContentAssetStorage.deployed();
        contentAsset = await ContentAsset.deployed();
        erc20Token = await ERC20Token.deployed();
        serviceAgreementStorageV1 = await ServiceAgreementStorageV1.deployed();
        serviceAgreementV1 = await ServiceAgreementV1.deployed();

        const promises = [];
        const amountToDeposit = 3000;
        const tokenAmount = 1000000;

        for (let i = 0; i < accounts.length; i += 1) {
            promises.push(erc20Token.mint(
                accounts[i],
                tokenAmount,
                {from: accounts[0]},
            ));

            promises.push(erc20Token.approve(
                serviceAgreementStorageV1.address,
                tokenAmount - amountToDeposit,
                {from: accounts[i]},
            ));
        }
        await Promise.all(promises);
    });


    it('Create an asset, send 0 assertionId, expect to fail', async () => {
        await truffleAssert.reverts(
            contentAsset.createAsset(
                [ethers.utils.formatBytes32String(invalidTestAssetid), 1000, 10, 10, 5, 250, 1],
                {from: accounts[1]}
            ));
    });

    it('Create an asset, send size 0, expect to fail', async () => {
        await truffleAssert.reverts(
            contentAsset.createAsset(
                [ethers.utils.formatBytes32String(testAssetId), 0, 10, 10, 0, 250, 1],
                {from: accounts[1]}
            ));
    });

    it('Create an asset, send 0 epochs number, expect to fail', async () => {
        await truffleAssert.reverts(
            contentAsset.createAsset(
                [ethers.utils.formatBytes32String(testAssetId), 1000, 10, 10, 0, 250, 1],
                {from: accounts[1]}
            ));
    });

    it('Create an asset, send 0 token amount, expect to fail', async () => {
        await truffleAssert.reverts(
            contentAsset.createAsset(
                [ethers.utils.formatBytes32String(testAssetId), 1000, 10, 10, 5, 0, 1],
                {from: accounts[1]}
            ));
    });

    it('Create an asset, expect asset created', async () => {
        const accountBalanceBeforeCreateAsset = await erc20Token.balanceOf(accounts[1]);
        const contractBalanceBeforeCreateAsset = await erc20Token.balanceOf(serviceAgreementStorageV1.address);

        const increase = (new BN(tokenAmount).mul(ETH_DECIMALS)).toString();
        await erc20Token.increaseAllowance(serviceAgreementV1.address, increase, {from: accounts[1]});

        const receipt = await contentAsset.createAsset([
            ethers.utils.formatBytes32String(testAssetId), 1024, 10, 10, 5, tokenAmount, 1
        ],
            {from: accounts[1]}
        );

        newTokenId = receipt.logs[0].args.tokenId.toString();

        const accountBalanceAfterCreateAsset = await erc20Token.balanceOf(accounts[1]);
        const contractBalanceAfterCreateAsset = await erc20Token.balanceOf(serviceAgreementStorageV1.address);

        const accountBalanceDifference = accountBalanceBeforeCreateAsset.sub(accountBalanceAfterCreateAsset).toNumber();
        assert(accountBalanceDifference === tokenAmount, 'Account balance should be lower then before');

        const contractBalanceDifference = contractBalanceAfterCreateAsset.sub(contractBalanceBeforeCreateAsset).toNumber();
        assert(contractBalanceDifference === tokenAmount, 'Contract balance should be greater than before');

        const owner = await contentAssetStorage.ownerOf(newTokenId);
        assert(owner === accounts[1]);
    });

    it('Get an non existing asset, expect 0 returned', async () => {
        const updatedBcAssertion = await contentAssetStorage.getAssertionIds(invalidTestTokenId);
        assert(updatedBcAssertion.length === 0, 'Expected empty array');
    });

    it('Get an existing asset, expect asset returned', async () => {
        const bcAssertion = await contentAssetStorage.getAssertionIds(newTokenId);
        assert(bcAssertion.length === 1, 'Invalid assertion array size');
        assert(bcAssertion.includes(ethers.utils.formatBytes32String(testAssetId)), 'Epected assertion id in array');
    });

    // it('Update an asset, send unknown token id, expect to fail', async () => {
    //     try {
    //         await contentAsset.updateAsset(
    //             invalidTestTokenId, testAssetId, 1024, 10, 10, 5, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert ERC721: invalid token ID'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Update an asset, only owner can update an asset, expect to fail', async () => {
    //     const assertionId = await generateUniqueAssertionId();
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, tokenAmount
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     try {
    //         await contentAsset.updateAsset(
    //             tokenId, assertionId, 1024, 10, 10, 5, 250, {from: accounts[1]}
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Only owner can update an asset'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Update an asset, send 0 assertion id, expect to fail', async () => {
    //
    //     const assertionId = await generateUniqueAssertionId();
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, tokenAmount
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     try {
    //         await contentAsset.updateAsset(
    //             tokenId, invalidTestAssetid, 1024, 10, 10, 5, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert assertionId cannot be 0'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Update an asset, send 0 size, expect to fail', async () => {
    //
    //     const assertionId = await generateUniqueAssertionId();
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, tokenAmount
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     try {
    //         await contentAsset.updateAsset(
    //             tokenId, assertionId, 0, 10, 10, 5, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Size cannot be 0'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Update an asset, send 0 epochs number, expect to fail', async () => {
    //
    //     const assertionId = await generateUniqueAssertionId();
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, tokenAmount
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     try {
    //         await contentAsset.updateAsset(
    //             tokenId, assertionId, 1024, 10, 10, 0, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Epochs number cannot be 0'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Update an asset, send 0 token amount, expect to fail', async () => {
    //     const assertionId = await generateUniqueAssertionId();
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, tokenAmount
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     try {
    //         await contentAsset.updateAsset(
    //             tokenId, assertionId, 1024, 10, 10, 5, 0
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Token amount cannot be 0'), 'Invalid error message received: ' + error.message);
    //     }
    // });
    //
    // it('Update an asset, expect asset updated', async () => {
    //     const assertionId = await generateUniqueAssertionId();
    //     const assertionSizeBefore = 1024;
    //     const assertionTriplesNumberBefore = 10;
    //     const assertionChunksNumberBefore = 10;
    //     const epochNumberBefore = 5;
    //     const tokenAmountBefore = 250;
    //     const receipt = await contentAsset.createAsset(
    //         assertionId,
    //         assertionSizeBefore,
    //         assertionTriplesNumberBefore,
    //         assertionChunksNumberBefore,
    //         epochNumberBefore,
    //         tokenAmountBefore
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     const updatedAssertionId = await generateUniqueAssertionId();
    //     const assertionSizeAfter = 1024;
    //     const assertionTriplesNumberAfter = 10;
    //     const assertionChunksNumberAfter = 10;
    //     const epochNumberAfter = 5;
    //     const tokenAmountAfter = 250;
    //     await contentAsset.updateAsset(
    //         tokenId,
    //         updatedAssertionId,
    //         assertionSizeAfter,
    //         assertionTriplesNumberAfter,
    //         assertionChunksNumberAfter,
    //         epochNumberAfter,
    //         tokenAmountAfter
    //     );
    //
    //     const updatedBcAssertion = await contentAsset.getAssertions(tokenId);
    //     assert(updatedBcAssertion.length === 2, 'Expected length of received assertions to be 2');
    //     assert(updatedBcAssertion.includes(assertionId, 'Expected assertion id to be part of array'));
    //     assert(updatedBcAssertion.includes(updatedAssertionId, 'Expected assertion id to be part of array'));
    //
    // });
});

async function generateUniqueAssertionId () {
    const assertion = await formatAssertion({
        "@context": "https://json-ld.org/contexts/person.jsonld",
        "@id": "http://dbpedia.org/resource/John_Lennon",
        "name": "John Lennon " + assertionCount++,
        "born": "1940-10-09",
        "spouse": "http://dbpedia.org/resource/Cynthia_Lennon"
    });

    return calculateRoot(assertion);
}
