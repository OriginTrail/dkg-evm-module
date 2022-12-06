const ServiceAgrementStorageV1 = artifacts.require("ServiceAgreementStorageV1");
const Hub = artifacts.require("Hub");
const { expect } = require("chai");

contract("ServiceAgreementStorageV1", accounts => {
    let serviceAgreementStorage;
    let hub;
    const owner = accounts[0];

    const agreementId = '0x5181b8cb24ae9feb3a1c987c1abe95b6ba62ef4807b6d589f64455c9dba7f1fc';
    const newAgreementId = '0x4181b8cb24ae9feb3a1c987c1abe95b6ba62ef4807b6d589f64455c9dba7f1fc';
    const epochsNumber = 5;
    const epochLength = 10;
    const tokenAmount = 100;
    const scoreFunctionId = 0;
    const proofWindowOffsetPerc = 10;

    beforeEach(async () => {
        // Deploy a new instance of ProfileStorage before each test
        hub = await Hub.deployed();
        serviceAgreementStorage = await ServiceAgrementStorageV1.new(hub.address);
    });

    it("should allow creating service agreement object", async () => {

        await hub.setContractAddress('Owner', owner, {from: owner});

        const createResult = await serviceAgreementStorage.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        )
        const blockTimestamp = (await web3.eth.getBlock(createResult.receipt.blockNumber)).timestamp
        const result = await serviceAgreementStorage.getAgreementData(agreementId);

        expect(result[0].toNumber()).to.equal(blockTimestamp);
        expect(result[1].toNumber()).to.equal(epochsNumber);
        expect(result[2].toNumber()).to.equal(epochLength);
        expect(result[3].toNumber()).to.equal(tokenAmount);
        expect(result[4][0].toNumber()).to.equal(scoreFunctionId);
        expect(result[4][1].toNumber()).to.equal(proofWindowOffsetPerc);

    });

    it("should allow updating service agreement data using get and set", async () => {
        await hub.setContractAddress('Owner', owner, {from: owner});

        const createResult = await serviceAgreementStorage.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        )
        const blockTimestamp = (await web3.eth.getBlock(createResult.receipt.blockNumber)).timestamp
        const newBlockTimestamp = blockTimestamp + 1;
        const newEpochsNumber = 10;
        const newEpochLength = 15;
        const newTokenAmount = 200;
        const newScoreFunctionId = 1;
        const newProofWindowOffsetPerc = 20;

        await serviceAgreementStorage.setAgreementStartTime(agreementId, newBlockTimestamp);
        let result = await serviceAgreementStorage.getAgreementStartTime(agreementId);
        expect(result.toNumber()).to.equal(newBlockTimestamp);

        await serviceAgreementStorage.setAgreementEpochsNumber(agreementId, newEpochsNumber);
        result = await serviceAgreementStorage.getAgreementEpochsNumber(agreementId);
        expect(result.toNumber()).to.equal(newEpochsNumber);

        await serviceAgreementStorage.setAgreementEpochLength(agreementId, newEpochLength);
        result = await serviceAgreementStorage.getAgreementEpochLength(agreementId);
        expect(result.toNumber()).to.equal(newEpochLength);

        await serviceAgreementStorage.setAgreementTokenAmount(agreementId, newTokenAmount);
        result = await serviceAgreementStorage.getAgreementTokenAmount(agreementId);
        expect(result.toNumber()).to.equal(newTokenAmount);

        await serviceAgreementStorage.setAgreementScoreFunctionId(agreementId, newScoreFunctionId);
        result = await serviceAgreementStorage.getAgreementScoreFunctionId(agreementId);
        expect(result.toNumber()).to.equal(newScoreFunctionId);

        await serviceAgreementStorage.setAgreementProofWindowOffsetPerc(agreementId, newProofWindowOffsetPerc);
        result = await serviceAgreementStorage.getAgreementProofWindowOffsetPerc(agreementId);
        expect(result.toNumber()).to.equal(newProofWindowOffsetPerc);

        const agreementEpochSubmissionHead = '0x5181b8cb24ae9feb3a1c987c1abe95b6ba62ef4807b6d589f64455c9dba7f1fc';

        await serviceAgreementStorage.setAgreementEpochSubmissionHead(agreementId, 0, agreementEpochSubmissionHead);
        result = await serviceAgreementStorage.getAgreementEpochSubmissionHead(agreementId, 0);
        expect(result).to.equal(agreementEpochSubmissionHead);
    });

    it("should allow increment and decrement agreement rewarded number", async () => {
        await hub.setContractAddress('Owner', owner, {from: owner});

        await serviceAgreementStorage.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        )

        let result = await serviceAgreementStorage.getAgreementRewardedNodesNumber(agreementId, 0);
        const initialNodesNumber = result.toNumber();

        await serviceAgreementStorage.incrementAgreementRewardedNodesNumber(agreementId, 0);
        result = await serviceAgreementStorage.getAgreementRewardedNodesNumber(agreementId, 0);
        const incrementedNodesNumber = result.toNumber();
        expect(incrementedNodesNumber).to.equal(initialNodesNumber + 1);

        await serviceAgreementStorage.decrementAgreementRewardedNodesNumber(agreementId, 0);
        result = await serviceAgreementStorage.getAgreementRewardedNodesNumber(agreementId, 0);
        const decrementedNodesNumber = result.toNumber();
        expect(decrementedNodesNumber).to.equal(incrementedNodesNumber - 1);

        const nodesNumber = 5;
        await serviceAgreementStorage.setAgreementRewardedNodesNumber(agreementId, 0, nodesNumber);
        result = await serviceAgreementStorage.getAgreementRewardedNodesNumber(agreementId, 0);
        expect(result.toNumber()).to.equal(nodesNumber);

    });

    it("Service agreement exists should return true for existing agreement", async () => {
        await hub.setContractAddress('Owner', owner, {from: owner});

        await serviceAgreementStorage.createServiceAgreementObject(
            agreementId,
            epochsNumber,
            epochLength,
            tokenAmount,
            scoreFunctionId,
            proofWindowOffsetPerc
        )

        let result = await serviceAgreementStorage.serviceAgreementExists(agreementId);
        expect(result).to.be.true;
        result = await serviceAgreementStorage.serviceAgreementExists(newAgreementId);
        expect(result).to.be.false;
    });
})
