const AssertionStorage = artifacts.require("AssertionStorage");
const Hub = artifacts.require("Hub");
const truffleAssert = require('truffle-assertions');
const { expect } = require("chai");

contract('AssertionStorage', async (accounts) => {
    let assertionStorage, hub;
    let owner = accounts[0];
    let nonOwner = accounts[1];

    // parameters for creating assertion
    const nonExistingAssertionId = '0x696e76616c696420617373657274696f6e';
    const assertionId = '0x74657374696e6720617373657274696f6e206964';
    const size = 20;
    const triplesNumber = 10;
    const chunksNumber = 3;

    before(async () => {
        // Deploy a new instance of AssertionStorage before test
        hub = await Hub.deployed();
        assertionStorage = await AssertionStorage.deployed();
    });

    it('Create an assertion with owner, expect to pass', async () => {
        await hub.setContractAddress('Owner', owner, { from: owner });
        await truffleAssert.passes(assertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber, { from: owner }));
    });

    it('Create an assertion with non owner, expect to fail', async () => {
        await truffleAssert.reverts(assertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber, { from: nonOwner }));
    });

    it('Set non owner to be new contract owner and create an assertion, expect to pass', async () => {
        await hub.setContractAddress('Owner', nonOwner, { from: owner });
        await truffleAssert.passes(assertionStorage.createAssertion(assertionId, size, triplesNumber, chunksNumber, { from: nonOwner }));
    })

    it('Get the assertion data for valid assertion id, expect to pass', async () => {
        const getAssertionResult = await assertionStorage.getAssertion(assertionId);

        await truffleAssert.passes(getAssertionResult);
        expect(getAssertionResult.size).to.be.eql(size.toString());
        expect(getAssertionResult.triplesNumber).to.be.eql(triplesNumber.toString());
        expect(getAssertionResult.chunksNumber).eql(chunksNumber.toString());
    });

    it('Get assertion for non-existing assertionId, expect to get 0', async () => {
        const getAssertionResult = await assertionStorage.getAssertion(nonExistingAssertionId);

        await truffleAssert.passes(getAssertionResult);
        getAssertionResult.forEach((e) => {
           expect(e).to.be.eql('0');
        });
    })

    it('Get assertion timestamp, size, triples and chunks number for non-existing assertionId, expect to get 0', async () => {
        const getTimestampResult = await assertionStorage.getAssertionTimestamp(nonExistingAssertionId);
        const getSizeResult = await assertionStorage.getAssertionSize(nonExistingAssertionId);
        const getTriplesNumber = await assertionStorage.getAssertionTriplesNumber(nonExistingAssertionId);
        const getChunksNumber = await assertionStorage.getAssertionChunksNumber(nonExistingAssertionId);

        expect(getTimestampResult.toString()).to.be.eql('0');
        expect(getSizeResult.toString()).to.be.eql('0');
        expect(getTriplesNumber.toString()).to.be.eql('0');
        expect(getChunksNumber.toString()).to.be.eql('0');
    })

    it('Get the assertion timestamp for valid assertion id, expect to pass', async () => {
       const getTimestampResult = await assertionStorage.getAssertionTimestamp(assertionId);
       const timestamp = getTimestampResult.toString();

       await truffleAssert.passes(getTimestampResult);
       expect(timestamp).to.not.eql('0');
    })

    it('Get the assertion size for valid assertion id, expect to pass', async () => {
        const getSizeResult = await assertionStorage.getAssertionSize(assertionId);

        await truffleAssert.passes(getSizeResult);
        expect(getSizeResult.toString()).to.be.eql(size.toString());
        expect(getSizeResult.toString()).to.not.eql('0');
    })

    it('Get the assertion triple number for valid assertion id, expect to pass', async () => {
        const getTriplesNumber = await assertionStorage.getAssertionTriplesNumber(assertionId);

        await truffleAssert.passes(getTriplesNumber);
        expect(getTriplesNumber.toString()).to.be.eql(triplesNumber.toString());
        expect(getTriplesNumber.toString()).to.not.eql('0');
    })

    it('Get the assertion chunks number for valid assertion id, expect to pass', async () => {
        const getChunksNumber = await assertionStorage.getAssertionChunksNumber(assertionId);

        await truffleAssert.passes(getChunksNumber);
        expect(getChunksNumber.toString()).to.be.eql(chunksNumber.toString());
        expect(getChunksNumber.toString()).to.not.eql('0');
    })

    it('Validate that assertion exists with valid assertion id, expect to pass', async () => {
        const result = await assertionStorage.assertionExists(assertionId);

        await truffleAssert.passes(result);
        expect(result).to.be.true;
    })
})
