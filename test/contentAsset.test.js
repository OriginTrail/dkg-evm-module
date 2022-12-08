// const {assert} = require('chai');

// const ContentAsset = artifacts.require('ContentAsset');
// const ERC20Token = artifacts.require('ERC20Token');
// const ServiceAgreementStorage = artifacts.require('ServiceAgreementStorage');
// const AssertionRegistry = artifacts.require('AssertionRegistry');

// const {
//     formatAssertion,
//     calculateRoot
// } = require('assertion-tools');

// let assertionCount = 0;

// // Contracts used in test
// let contentAsset;
// let erc20Token;
// let serviceAgreementStorage;

// const testAssetId = '0x1';
// const invalidTestAssetid = '0x0';
// const invalidTestTokenId = 1000;
// const errorPrefix = 'Returned error: VM Exception while processing transaction: ';

// const tokenAmount = 250;

// contract('DKG v6 assets/ContentAsset', async (accounts) => {

    // before(async () => {
    //     contentAsset = await ContentAsset.deployed();
    //     erc20Token = await ERC20Token.deployed();
    //     serviceAgreementStorage = await ServiceAgreementStorage.deployed();
    //     assertionRegistry = await AssertionRegistry.deployed();
    //
    //     const promises = [];
    //     const amountToDeposit = 3000;
    //     const tokenAmount = 1000000;
    //
    //     for (let i = 0; i < accounts.length; i += 1) {
    //         promises.push(erc20Token.mint(
    //             accounts[i],
    //             tokenAmount,
    //             {from: accounts[0]},
    //         ));
    //
    //         promises.push(erc20Token.approve(
    //             serviceAgreementStorage.address,
    //             tokenAmount - amountToDeposit,
    //             {from: accounts[i]},
    //         ));
    //     }
    //     await Promise.all(promises);
    // });
    //
    //
    // it('Create an asset, send 0 assertionId, expect to fail', async () => {
    //     try {
    //         await contentAsset.createAsset(
    //             invalidTestAssetid, 1024, 10, 10, 5, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert assertionId cannot be empty'), 'Invalid error message received');
    //     }
    // });
    //
    // it('Create an asset, send size 0, expect to fail', async () => {
    //     try {
    //         await contentAsset.createAsset(
    //             testAssetId, 0, 10, 10, 5, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Size cannot be 0'), 'Invalid error message received');
    //     }
    // });
    //
    // it('Create an asset, send 0 epochs number, expect to fail', async () => {
    //     try {
    //         await contentAsset.createAsset(
    //             testAssetId, 1024, 10, 10, 0, 250
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Epochs number cannot be 0'), 'Invalid error message received');
    //     }
    // });
    //
    // it('Create an asset, send 0 token amount, expect to fail', async () => {
    //     try {
    //         await contentAsset.createAsset(
    //             testAssetId, 1024, 10, 10, 5, 0
    //         );
    //         throw null;
    //     } catch (error) {
    //         assert(error, 'Expected error but did not get one');
    //         assert(error.message.startsWith(errorPrefix + 'revert Token amount cannot be 0'), 'Invalid error message received');
    //     }
    // });
    //
    // it('Create an asset, expect asset created', async () => {
    //     const assertionId = await generateUniqueAssertionId();
    //
    //     const accountBalanceBeforeCreateAsset = await erc20Token.balanceOf(accounts[0]);
    //     const contractBalanceBeforeCreateAsset = await erc20Token.balanceOf(serviceAgreementStorage.address);
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, tokenAmount
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     const accountBalanceAfterCreateAsset = await erc20Token.balanceOf(accounts[0]);
    //     const contractBalanceAfterCreateAsset = await erc20Token.balanceOf(serviceAgreementStorage.address);
    //
    //     const accountBalanceDifference = accountBalanceBeforeCreateAsset.sub(accountBalanceAfterCreateAsset).toNumber();
    //     assert(accountBalanceDifference === tokenAmount, 'Account balance should be lower then before');
    //
    //     const contractBalanceDifference = contractBalanceAfterCreateAsset.sub(contractBalanceBeforeCreateAsset).toNumber();
    //     assert(contractBalanceDifference === tokenAmount, 'Contract balance should be greater than before');
    //
    //     const owner = await contentAsset.ownerOf(tokenId);
    //     assert(owner === accounts[0]);
    //
    // });
    //
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
    //
    // it('Get an non existing asset, expect 0 returned', async () => {
    //     const updatedBcAssertion = await contentAsset.getAssertions(invalidTestTokenId);
    //     assert(updatedBcAssertion.length === 0, 'Expected empty array');
    // });
    //
    // it('Get an existing asset, expect asset returned', async () => {
    //
    //     const assertionId = await generateUniqueAssertionId();
    //
    //     const receipt = await contentAsset.createAsset(
    //         assertionId, 1024, 10, 10, 5, 250
    //     );
    //     const tokenId = receipt.logs[0].args.tokenId.toString();
    //
    //     const bcAssertion = await contentAsset.getAssertions(tokenId);
    //
    //     assert(bcAssertion.length === 1, 'Invalid assertion array size');
    //     assert(bcAssertion.includes(assertionId), 'Epected assertion id in array');
    // });

// });

// async function generateUniqueAssertionId () {
//     const assertion = await formatAssertion({
//         "@context": "https://json-ld.org/contexts/person.jsonld",
//         "@id": "http://dbpedia.org/resource/John_Lennon",
//         "name": "John Lennon " + assertionCount++,
//         "born": "1940-10-09",
//         "spouse": "http://dbpedia.org/resource/Cynthia_Lennon"
//     });
//
//     return calculateRoot(assertion);
// }
