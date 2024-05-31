import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BigNumber, BytesLike } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  Token,
  Profile,
  NodeOperatorFeesStorage,
  ServiceAgreementStorageV1U1,
  StakingStorage,
  HubController,
  ProfileStorage,
} from '../../../typechain';
import { NodeOperatorStructs } from '../../../typechain/contracts/v2/storage/NodeOperatorFeesStorage';

type NodeOperatorFeesStorageFixture = {
  accounts: SignerWithAddress[];
  Token: Token;
  Profile: Profile;
  NodeOperatorFeesStorage: NodeOperatorFeesStorage;
  ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  StakingStorage: StakingStorage;
  HubController: HubController;
};

type Node = {
  account: SignerWithAddress;
  identityId: number;
  nodeId: BytesLike;
  sha256: BytesLike;
};

describe('@v2 @unit NodeOperatorFeesStorage contract', function () {
  let accounts: SignerWithAddress[];
  let ProfileStorage: ProfileStorage;
  let StakingStorage: StakingStorage;
  let Token: Token;
  let Profile: Profile;
  let NodeOperatorFeesStorage: NodeOperatorFeesStorage;
  let ServiceAgreementStorageV1U1: ServiceAgreementStorageV1U1;
  let HubController: HubController;

  async function deployNodeOperatorFeesStorageFixture(): Promise<NodeOperatorFeesStorageFixture> {
    await hre.deployments.fixture(['StakingStorage', 'NodeOperatorFeesStorage', 'Profile']);
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    StakingStorage = await hre.ethers.getContract<StakingStorage>('StakingStorage');
    Token = await hre.ethers.getContract<Token>('Token');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    NodeOperatorFeesStorage = await hre.ethers.getContract<NodeOperatorFeesStorage>('NodeOperatorFeesStorage');
    ServiceAgreementStorageV1U1 = await hre.ethers.getContract<ServiceAgreementStorageV1U1>(
      'ServiceAgreementStorageV1U1',
    );
    accounts = await hre.ethers.getSigners();
    HubController = await hre.ethers.getContract<HubController>('HubController');
    await HubController.setContractAddress('HubOwner', accounts[0].address);
    await HubController.setContractAddress('NotHubOwner', accounts[1].address);

    return {
      accounts,
      Token,
      Profile,
      NodeOperatorFeesStorage,
      ServiceAgreementStorageV1U1,
      StakingStorage,
      HubController,
    };
  }

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<Node> {
    const OperationalProfile = Profile.connect(operational);

    const nodeId = '0x' + randomBytes(32).toString('hex');
    const sha256 = hre.ethers.utils.soliditySha256(['bytes'], [nodeId]);

    const receipt = await (
      await OperationalProfile.createProfile(
        admin.address,
        [],
        nodeId,
        randomBytes(5).toString('hex'),
        randomBytes(3).toString('hex'),
        0,
      )
    ).wait();
    const identityId = Number(receipt.logs[0].topics[1]);
    const blockchainNodeId = await ProfileStorage.getNodeId(identityId);
    const blockchainSha256 = await ProfileStorage.getNodeAddress(identityId, 1);

    expect(blockchainNodeId).to.be.equal(nodeId);
    expect(blockchainSha256).to.be.equal(sha256);

    await OperationalProfile.setAsk(identityId, hre.ethers.utils.parseEther('0.25'));

    return {
      account: operational,
      identityId,
      nodeId,
      sha256,
    };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Token, Profile, NodeOperatorFeesStorage, ServiceAgreementStorageV1U1, StakingStorage, HubController } =
      await loadFixture(deployNodeOperatorFeesStorageFixture));
  });

  it('The contract is named "NodeOperatorFeesStorage"', async () => {
    expect(await NodeOperatorFeesStorage.name()).to.equal('NodeOperatorFeesStorage');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await NodeOperatorFeesStorage.version()).to.equal('2.0.2');
  });

  it('Migration of old Operator Fees should pass successfully', async () => {
    const LegacyNodeOperatorFeeChangesStorage = await hre.helpers.deploy({
      newContractName: 'LegacyNodeOperatorFeeChangesStorage',
    });

    const latestBlockTimestamp = (await hre.ethers.provider.getBlock('latest')).timestamp;

    const identityIds = [];

    // identity 1 -- op 1
    // identity 2 -- op 2, pending past 12
    // identity 3 -- op 3
    // identity 4 -- op 4, pending future 14
    // identity 5 -- op 5
    for (let i = 0; i < 5; i++) {
      const { identityId } = await createProfile(accounts[2 * i], accounts[2 * i + 1]);
      identityIds.push(identityId);

      await StakingStorage.setOperatorFee(identityId, i);

      if (i === 1) {
        await LegacyNodeOperatorFeeChangesStorage.createOperatorFeeChangeRequest(
          identityId,
          i + 10,
          latestBlockTimestamp - 100,
        );
      } else if (i === 3) {
        await LegacyNodeOperatorFeeChangesStorage.createOperatorFeeChangeRequest(
          identityId,
          i + 10,
          latestBlockTimestamp + 100,
        );
      }
    }

    const operatorFees = [
      { identityId: identityIds[0], fees: [{ feePercentage: 1, effectiveDate: BigNumber.from(latestBlockTimestamp) }] },
      {
        identityId: identityIds[1],
        fees: [
          { feePercentage: 2, effectiveDate: BigNumber.from(latestBlockTimestamp) },
          { feePercentage: 12, effectiveDate: BigNumber.from(latestBlockTimestamp) },
        ],
      },
      { identityId: identityIds[2], fees: [{ feePercentage: 3, effectiveDate: BigNumber.from(latestBlockTimestamp) }] },
      {
        identityId: identityIds[3],
        fees: [
          { feePercentage: 4, effectiveDate: BigNumber.from(latestBlockTimestamp) },
          { feePercentage: 14, effectiveDate: BigNumber.from(latestBlockTimestamp + 100) },
        ],
      },
      { identityId: identityIds[4], fees: [{ feePercentage: 5, effectiveDate: BigNumber.from(latestBlockTimestamp) }] },
    ];

    const NewOperatorFeesStorage = await hre.helpers.deploy({
      newContractName: 'NodeOperatorFeesStorage',
      additionalArgs: [(await hre.ethers.provider.getBlock('latest')).timestamp + 600],
    });

    const tx = await NewOperatorFeesStorage.migrateOldOperatorFees(operatorFees);
    await tx.wait();

    for (const [i, identityId] of identityIds.entries()) {
      const fees: NodeOperatorStructs.OperatorFeeStruct[] = await NewOperatorFeesStorage.getOperatorFees(identityId);
      const normalizedFees = fees.map((fee) => ({
        feePercentage: fee.feePercentage,
        effectiveDate: fee.effectiveDate,
      }));

      expect(normalizedFees).to.deep.equal(operatorFees[i].fees);
    }
  });
});
