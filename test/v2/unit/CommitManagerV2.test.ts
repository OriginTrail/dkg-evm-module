import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BytesLike, BigNumber } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  CommitManagerV2,
  ContentAssetV2,
  ContentAssetStorageV2,
  LinearSum,
  ParametersStorage,
  Profile,
  ProfileStorage,
  ServiceAgreementV1,
  StakingV2,
  Token,
} from '../../../typechain';
import { ContentAssetStructs } from '../../../typechain/contracts/v1/assets/ContentAsset';
import { ServiceAgreementStructsV1 } from '../../../typechain/contracts/v1/CommitManagerV1';
import { ServiceAgreementStructsV2 } from '../../../typechain/contracts/v2/CommitManagerV1.sol/CommitManagerV2';

type CommitManagerV2Fixture = {
  accounts: SignerWithAddress[];
  CommitManagerV2: CommitManagerV2;
};

type Node = {
  account: SignerWithAddress;
  identityId: number;
  nodeId: BytesLike;
  sha256: BytesLike;
  stake: BigNumber;
};

type NodeWithDistance = {
  account: SignerWithAddress;
  identityId: number;
  nodeId: BytesLike;
  sha256: BytesLike;
  stake: BigNumber;
  index: BigNumber;
  distance: BigNumber;
};

describe('@v2 @unit CommitManagerV2 contract', function () {
  const HASH_RING_SIZE = BigNumber.from(2).pow(256).sub(1);
  const UINT256_MAX_BN = BigNumber.from(2).pow(256).sub(1);
  const UINT64_MAX_BN = BigNumber.from(2).pow(64).sub(1);
  const UINT40_MAX_BN = BigNumber.from(2).pow(40).sub(1);

  let accounts: SignerWithAddress[];
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ContentAssetV2: ContentAssetV2;
  let ContentAssetStorageV2: ContentAssetStorageV2;
  let LinearSum: LinearSum;
  let CommitManagerV2: CommitManagerV2;
  let ParametersStorage: ParametersStorage;
  let ProfileStorage: ProfileStorage;
  let Profile: Profile;
  let StakingV2: StakingV2;

  let commitV1InputArgs: ServiceAgreementStructsV1.CommitInputArgsStruct;
  let commitV2InputArgs: ServiceAgreementStructsV2.CommitInputArgsStruct;

  async function createAsset(
    scoreFunctionId = 1,
  ): Promise<{ tokenId: number; keyword: BytesLike; agreementId: BytesLike }> {
    const assetInputStruct: ContentAssetStructs.AssetInputArgsStruct = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 1000,
      triplesNumber: 10,
      chunksNumber: 10,
      epochsNumber: 5,
      tokenAmount: hre.ethers.utils.parseEther('250'),
      scoreFunctionId,
      immutable_: false,
    };

    await Token.increaseAllowance(ServiceAgreementV1.address, assetInputStruct.tokenAmount);
    const receipt = await (await ContentAssetV2.createAsset(assetInputStruct)).wait();

    const tokenId = Number(receipt.logs[0].topics[3]);
    const keyword = hre.ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [ContentAssetStorageV2.address, assetInputStruct.assertionId],
    );
    const agreementId = hre.ethers.utils.soliditySha256(
      ['address', 'uint256', 'bytes'],
      [ContentAssetStorageV2.address, tokenId, keyword],
    );

    return { tokenId, keyword, agreementId };
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

    const minStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.minimumStake()));
    const maxStake = Number(hre.ethers.utils.formatEther(await ParametersStorage.maximumStake()));
    const stakeAmount = hre.ethers.utils.parseEther(
      `${Math.floor(Math.random() * (maxStake - minStake + 1)) + minStake}`,
    );
    await Token.connect(admin).increaseAllowance(StakingV2.address, stakeAmount);
    await StakingV2.connect(admin)['addStake(uint72,uint96)'](identityId, stakeAmount);

    return {
      account: operational,
      identityId,
      nodeId,
      sha256,
      stake: stakeAmount,
    };
  }

  async function createMultipleProfiles(count = 150): Promise<Node[]> {
    const nodes = [];

    for (let i = 0; i < count; i++) {
      const node = await createProfile(accounts[i], accounts[i + count]);
      nodes.push(node);
    }

    return nodes;
  }

  function calculateDistance(peerHash: BytesLike, keyHash: BytesLike): BigNumber {
    const peerPositionOnHashRing = BigNumber.from(peerHash);
    const keyPositionOnHashRing = BigNumber.from(keyHash);

    const directDistance = peerPositionOnHashRing.gt(keyPositionOnHashRing)
      ? peerPositionOnHashRing.sub(keyPositionOnHashRing)
      : keyPositionOnHashRing.sub(peerPositionOnHashRing);
    const wraparoundDistance = HASH_RING_SIZE.sub(directDistance);

    return directDistance.lt(wraparoundDistance) ? directDistance : wraparoundDistance;
  }

  function toUint40(value: BigNumber, maxValue: BigNumber): BigNumber {
    const result = value.mul(UINT40_MAX_BN).div(maxValue);
    return result;
  }

  async function calculateScore(
    distance: BigNumber,
    stake: BigNumber,
    maxNeighborhoodDistance: BigNumber,
    r2: number,
    nodesNumber: number,
    minStake: BigNumber,
    maxStake: BigNumber,
  ): Promise<BigNumber> {
    const linearSumParams = await LinearSum.getParameters();
    const [distanceScaleFactor, stakeScaleFactor, w1, w2] = linearSumParams;

    const idealMaxDistanceInNeighborhood = HASH_RING_SIZE.div(nodesNumber).mul(Math.ceil(r2 / 2));
    const divisor =
      maxNeighborhoodDistance <= idealMaxDistanceInNeighborhood
        ? maxNeighborhoodDistance
        : idealMaxDistanceInNeighborhood;

    const maxMultiplier = UINT256_MAX_BN.div(distance);

    let scaledDistanceScaleFactor = distanceScaleFactor;
    let compensationFactor = BigNumber.from(1);

    if (scaledDistanceScaleFactor.gt(maxMultiplier)) {
      compensationFactor = scaledDistanceScaleFactor.div(maxMultiplier);
      scaledDistanceScaleFactor = maxMultiplier;
    }

    const scaledDistance = distance.mul(scaledDistanceScaleFactor);
    const adjustedDivisor = divisor.div(compensationFactor);

    let normalizedDistance = scaledDistance.div(adjustedDivisor);
    if (normalizedDistance.gt(UINT64_MAX_BN)) {
      normalizedDistance = normalizedDistance.mod(UINT64_MAX_BN.add(1));
    }

    let normalizedStake = stakeScaleFactor.mul(stake.sub(minStake)).div(maxStake.sub(minStake));
    if (normalizedStake.gt(UINT64_MAX_BN)) {
      normalizedStake = normalizedStake.mod(UINT64_MAX_BN.add(1));
    }

    const oneEther = BigNumber.from('1000000000000000000');

    const isProximityScorePositive = oneEther.gte(normalizedDistance);

    const proximityScore = isProximityScorePositive
      ? oneEther.sub(normalizedDistance).mul(w1)
      : normalizedDistance.sub(oneEther).mul(w1);
    const stakeScore = normalizedStake.mul(w2);

    let finalScore;
    if (isProximityScorePositive) {
      finalScore = proximityScore.add(stakeScore);
    } else if (stakeScore.gte(proximityScore)) {
      finalScore = stakeScore.sub(proximityScore);
    } else {
      finalScore = BigNumber.from(0);
    }

    finalScore = toUint40(finalScore, oneEther.mul(w1 + w2));

    return finalScore;
  }

  async function getNeighborhood(nodes: Node[], keyHash: BytesLike): Promise<NodeWithDistance[]> {
    const nodesWithIndexes = nodes
      .sort((a, b) => {
        const aBN = BigNumber.from(a.sha256);
        const bBN = BigNumber.from(b.sha256);
        if (aBN.eq(bBN)) {
          return 0;
        }
        return aBN.lt(bBN) ? -1 : 1;
      })
      .map((node, index) => ({ ...node, index: BigNumber.from(index) }));

    const nodesWithDistance = await Promise.all(
      nodesWithIndexes.map(async (node) => ({
        node,
        distance: calculateDistance(node.sha256, keyHash),
      })),
    );
    nodesWithDistance.sort((a, b) => {
      if (a.distance.eq(b.distance)) {
        return 0;
      }
      return a.distance.lt(b.distance) ? -1 : 1;
    });
    return nodesWithDistance.slice(0, 20).map((pd) => ({ ...pd.node, distance: pd.distance }));
  }

  async function getNeighborhoodEdgeNodes(
    neighborhood: NodeWithDistance[],
    keyHash: BytesLike,
  ): Promise<{ leftEdgeNode: NodeWithDistance; rightEdgeNode: NodeWithDistance }> {
    const assetPositionOnHashRing = BigNumber.from(keyHash);
    const hashRing = [];

    const maxDistance = neighborhood[neighborhood.length - 1].distance;

    for (const neighbor of neighborhood) {
      const neighborPositionOnHashRing = BigNumber.from(neighbor.sha256);

      if (neighborPositionOnHashRing.lte(assetPositionOnHashRing)) {
        if (assetPositionOnHashRing.sub(neighborPositionOnHashRing).lte(maxDistance)) {
          hashRing.unshift(neighbor);
        } else {
          hashRing.push(neighbor);
        }
      } else {
        if (neighborPositionOnHashRing.sub(assetPositionOnHashRing).lte(maxDistance)) {
          hashRing.push(neighbor);
        } else {
          hashRing.unshift(neighbor);
        }
      }
    }

    return {
      leftEdgeNode: hashRing[0],
      rightEdgeNode: hashRing[hashRing.length - 1],
    };
  }

  async function deployCommitManagerV2Fixture(): Promise<CommitManagerV2Fixture> {
    await hre.deployments.fixture([
      'HubV2',
      'ContentAssetStorageV2',
      'ShardingTableV2',
      'StakingV2',
      'CommitManagerV2',
      'CommitManagerV2U1',
      'ContentAssetV2',
      'Profile',
    ]);
    Token = await hre.ethers.getContract<Token>('Token');
    ServiceAgreementV1 = await hre.ethers.getContract<ServiceAgreementV1>('ServiceAgreementV1');
    ContentAssetV2 = await hre.ethers.getContract<ContentAssetV2>('ContentAsset');
    ContentAssetStorageV2 = await hre.ethers.getContract<ContentAssetStorageV2>('ContentAssetStorage');
    LinearSum = await hre.ethers.getContract<LinearSum>('LinearSum');
    CommitManagerV2 = await hre.ethers.getContract<CommitManagerV2>('CommitManagerV1');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    StakingV2 = await hre.ethers.getContract<StakingV2>('Staking');
    accounts = await hre.ethers.getSigners();

    return { accounts, CommitManagerV2 };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, CommitManagerV2 } = await loadFixture(deployCommitManagerV2Fixture));
  });

  it('The contract is named "CommitManagerV1"', async () => {
    expect(await CommitManagerV2.name()).to.equal('CommitManagerV1');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await CommitManagerV2.version()).to.equal('2.0.0');
  });

  it('Create new asset, check if commit window is open, expect to be true', async () => {
    const { agreementId } = await createAsset();

    expect(await CommitManagerV2.isCommitWindowOpen(agreementId, 0)).to.eql(true);
  });

  it('Create new asset, teleport to the end of commit phase and check if commit window is open, expect to be false', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();
    const commitWindowDuration = (epochLength * commitWindowDurationPerc) / 100;

    await time.increase(commitWindowDuration + 1);

    expect(await CommitManagerV2.isCommitWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create new asset, teleport to second epoch and check if commit window is open, expect to be true', async () => {
    const { agreementId } = await createAsset();

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    expect(await CommitManagerV2.isCommitWindowOpen(agreementId, 1)).to.eql(true);
  });

  it('Create new asset with scoreFunction 1, submit commit V1, expect revert InvalidScoreFunctionId', async () => {
    await createProfile(accounts[0], accounts[1]);

    const { tokenId, keyword } = await createAsset();

    commitV1InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    await expect(
      CommitManagerV2['submitCommit((address,uint256,bytes,uint8,uint16))'](commitV1InputArgs),
    ).to.be.revertedWithCustomError(CommitManagerV2, 'InvalidScoreFunctionId');
  });

  it('Create new asset with scoreFunction 2, submit commit V2, expect CommitSubmitted event', async () => {
    const nodes = await createMultipleProfiles(30);

    const { tokenId, keyword } = await createAsset(2);

    const keyHash = hre.ethers.utils.soliditySha256(['bytes'], [keyword]);

    const neighborhood = await getNeighborhood(nodes, keyHash);

    const closestNode = neighborhood[0];
    const { leftEdgeNode, rightEdgeNode } = await getNeighborhoodEdgeNodes(neighborhood, keyHash);

    commitV2InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
      closestNodeIndex: closestNode.index,
      leftEdgeNodeIndex: leftEdgeNode.index,
      rightEdgeNodeIndex: rightEdgeNode.index,
    };

    const r2 = await ParametersStorage.r2();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();
    const score = await calculateScore(
      closestNode.distance,
      closestNode.stake,
      neighborhood[neighborhood.length - 1].distance,
      r2,
      nodes.length,
      minStake,
      maxStake,
    );

    await expect(
      CommitManagerV2.connect(closestNode.account)[
        'submitCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
      ](commitV2InputArgs),
    )
      .to.emit(CommitManagerV2, 'CommitSubmitted')
      .withArgs(ContentAssetStorageV2.address, tokenId, keyword, 1, 0, closestNode.identityId, score);
  });

  it('Create new asset with scoreFunction 1, submit R0 V1 commits, expect R0 V1 commits to be reverted with InvalidScoreFunctionId', async () => {
    const r0 = await ParametersStorage.r0();

    const identityIds = [];
    for (let i = 0; i < r0; i++) {
      const { identityId } = await createProfile(accounts[i], accounts[accounts.length - 1]);
      identityIds.push(identityId);
    }

    const { tokenId, keyword } = await createAsset();

    commitV1InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    for (let i = 0; i < r0; i++) {
      await expect(
        CommitManagerV2.connect(accounts[i])['submitCommit((address,uint256,bytes,uint8,uint16))'](commitV1InputArgs),
      ).to.be.revertedWithCustomError(CommitManagerV2, 'InvalidScoreFunctionId');
    }
  });

  it('Create new asset with scoreFunction 2, submit R0 V2 commits, expect R0 V2 commits to be returned', async () => {
    const r0 = await ParametersStorage.r0();
    const r2 = await ParametersStorage.r2();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();
    const nodes = await createMultipleProfiles(30);

    const { tokenId, keyword, agreementId } = await createAsset(2);

    const keyHash = hre.ethers.utils.soliditySha256(['bytes'], [keyword]);

    const neighborhood = await getNeighborhood(nodes, keyHash);

    const closestNode = neighborhood[0];
    const { leftEdgeNode, rightEdgeNode } = await getNeighborhoodEdgeNodes(neighborhood, keyHash);

    commitV2InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
      closestNodeIndex: closestNode.index,
      leftEdgeNodeIndex: leftEdgeNode.index,
      rightEdgeNodeIndex: rightEdgeNode.index,
    };

    const scoredNeighborhood = await Promise.all(
      neighborhood.map(async (node) => ({
        account: node.account,
        identityId: node.identityId,
        score: (
          await calculateScore(
            node.distance,
            node.stake,
            neighborhood[neighborhood.length - 1].distance,
            r2,
            nodes.length,
            minStake,
            maxStake,
          )
        ).toNumber(),
      })),
    );

    scoredNeighborhood.sort((a, b) => b.score - a.score);

    for (const node of [...scoredNeighborhood].reverse()) {
      await expect(
        CommitManagerV2.connect(node.account)[
          'submitCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
        ](commitV2InputArgs),
      )
        .to.emit(CommitManagerV2, 'CommitSubmitted')
        .withArgs(ContentAssetStorageV2.address, tokenId, keyword, 1, 0, node.identityId, node.score);
    }

    const topCommits = await CommitManagerV2.getTopCommitSubmissions(agreementId, 0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const expectedWinners = scoredNeighborhood.map(({ account, ...rest }) => rest).slice(0, r0);

    expect(
      topCommits.map((commit) => ({ identityId: commit.identityId.toNumber(), score: commit.score })),
    ).to.have.deep.members(expectedWinners);
  });
});
