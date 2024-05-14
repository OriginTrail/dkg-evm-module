import { randomBytes } from 'crypto';

import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BytesLike, BigNumber } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import {
  CommitManagerV2,
  CommitManagerV2U1,
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
import { ServiceAgreementStructsV1 } from '../../../typechain/contracts/v1/CommitManagerV1U1';
import { ServiceAgreementStructsV2 } from '../../../typechain/contracts/v2/CommitManagerV1U1.sol/CommitManagerV2U1';

const UINT256_MAX_BN = BigNumber.from(2).pow(256).sub(1);
const UINT64_MAX_BN = BigNumber.from(2).pow(64).sub(1);
const UINT40_MAX_BN = BigNumber.from(2).pow(40).sub(1);

type CommitManagerV2U1Fixture = {
  accounts: SignerWithAddress[];
  CommitManagerV2: CommitManagerV2;
  CommitManagerV2U1: CommitManagerV2U1;
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

describe('@v2 @unit CommitManagerV2U1 contract', function () {
  const HASH_RING_SIZE = BigNumber.from(2).pow(256);

  let accounts: SignerWithAddress[];
  let Token: Token;
  let ServiceAgreementV1: ServiceAgreementV1;
  let ContentAssetV2: ContentAssetV2;
  let ContentAssetStorageV2: ContentAssetStorageV2;
  let LinearSum: LinearSum;
  let CommitManagerV2: CommitManagerV2;
  let CommitManagerV2U1: CommitManagerV2U1;
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

  async function updateAsset(tokenId: number) {
    const assetUpdateArgs = {
      assertionId: '0x' + randomBytes(32).toString('hex'),
      size: 2000,
      triplesNumber: 20,
      chunksNumber: 20,
      tokenAmount: hre.ethers.utils.parseEther('500'),
    };

    await Token.increaseAllowance(ServiceAgreementV1.address, assetUpdateArgs.tokenAmount);
    await ContentAssetV2.updateAssetState(
      tokenId,
      assetUpdateArgs.assertionId,
      assetUpdateArgs.size,
      assetUpdateArgs.triplesNumber,
      assetUpdateArgs.chunksNumber,
      assetUpdateArgs.tokenAmount,
    );
  }

  async function finalizeUpdateV2(
    tokenId: number,
    keyword: BytesLike,
  ): Promise<{
    winners: { account: SignerWithAddress; identityId: number; score: number }[];
    closestNodeIndex: BigNumber;
    leftEdgeNodeIndex: BigNumber;
    rightEdgeNodeIndex: BigNumber;
  }> {
    const finalizationRequirement = await ParametersStorage.finalizationCommitsNumber();

    const r2 = await ParametersStorage.r2();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();
    const nodes = await createMultipleProfiles(30);

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

    scoredNeighborhood.sort((a, b) => a.score - b.score);

    for (let i = 0; i < finalizationRequirement; i++) {
      await expect(
        CommitManagerV2U1.connect(scoredNeighborhood[i].account)[
          'submitUpdateCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
        ](commitV2InputArgs),
      ).to.emit(CommitManagerV2U1, 'CommitSubmitted');
    }

    return {
      winners: scoredNeighborhood.slice(0, finalizationRequirement),
      closestNodeIndex: closestNode.index,
      leftEdgeNodeIndex: leftEdgeNode.index,
      rightEdgeNodeIndex: rightEdgeNode.index,
    };
  }

  async function createProfile(operational: SignerWithAddress, admin: SignerWithAddress): Promise<Node> {
    const { minter } = await hre.getNamedAccounts();
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
    await Token.mint(admin.address, stakeAmount, { from: minter });
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

  async function deployCommitManagerV2U1Fixture(): Promise<CommitManagerV2U1Fixture> {
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
    CommitManagerV2U1 = await hre.ethers.getContract<CommitManagerV2U1>('CommitManagerV1U1');
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    StakingV2 = await hre.ethers.getContract<StakingV2>('Staking');
    ContentAssetStorageV2 = await hre.ethers.getContract<ContentAssetStorageV2>('ContentAssetStorage');
    accounts = await hre.ethers.getSigners();

    return { accounts, CommitManagerV2, CommitManagerV2U1 };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, CommitManagerV2U1 } = await loadFixture(deployCommitManagerV2U1Fixture));
  });

  it('The contract is named "CommitManagerV1U1"', async () => {
    expect(await CommitManagerV2U1.name()).to.equal('CommitManagerV1U1');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await CommitManagerV2U1.version()).to.equal('2.0.0');
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update and finalize V2 update, check if commit window is open, expect to be true', async () => {
    const { tokenId, keyword, agreementId } = await createAsset(2);
    await updateAsset(tokenId);
    await finalizeUpdateV2(tokenId, keyword);

    await expect(CommitManagerV2.isCommitWindowOpen(agreementId, 0)).to.be.revertedWithCustomError(
      CommitManagerV2,
      'ServiceAgreementDoesntExist',
    );
    expect(await CommitManagerV2U1.isCommitWindowOpen(agreementId, 0)).to.eql(true);
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update and finalize V2 update, teleport to the end of commit phase and check if commit window is open, expect to be false', async () => {
    const { tokenId, keyword, agreementId } = await createAsset(2);
    await updateAsset(tokenId);
    await finalizeUpdateV2(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    const commitWindowDurationPerc = await ParametersStorage.commitWindowDurationPerc();
    const commitWindowDuration = (epochLength * commitWindowDurationPerc) / 100;

    await time.increase(commitWindowDuration + 1);

    await expect(CommitManagerV2.isCommitWindowOpen(agreementId, 0)).to.be.revertedWithCustomError(
      CommitManagerV2,
      'ServiceAgreementDoesntExist',
    );
    expect(await CommitManagerV2U1.isCommitWindowOpen(agreementId, 0)).to.eql(false);
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update and finalize update V2, teleport to second epoch and check if commit window is open, expect to be true', async () => {
    const { tokenId, keyword, agreementId } = await createAsset(2);
    await updateAsset(tokenId);
    await finalizeUpdateV2(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    await expect(CommitManagerV2.isCommitWindowOpen(agreementId, 1)).to.be.revertedWithCustomError(
      CommitManagerV2,
      'ServiceAgreementDoesntExist',
    );
    expect(await CommitManagerV2U1.isCommitWindowOpen(agreementId, 1)).to.eql(true);
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update it, check if update commit window is open, expect to be true', async () => {
    const { tokenId, agreementId } = await createAsset(2);
    await updateAsset(tokenId);

    expect(await CommitManagerV2U1.isUpdateCommitWindowOpen(agreementId, 0, 1)).to.eql(true);
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update it, teleport to the end of update commit window and check if its open, expect to be false', async () => {
    const { tokenId, agreementId } = await createAsset(2);
    await updateAsset(tokenId);

    const updateCommitWindowDuration = await ParametersStorage.updateCommitWindowDuration();
    await time.increase(updateCommitWindowDuration);

    expect(await CommitManagerV2U1.isUpdateCommitWindowOpen(agreementId, 0, 1)).to.eql(false);
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update it, finalize V2 update, teleport to the second epoch, submit commit, expect CommitSubmitted event', async () => {
    const { tokenId, keyword } = await createAsset(2);
    await updateAsset(tokenId);
    const { closestNodeIndex, leftEdgeNodeIndex, rightEdgeNodeIndex } = await finalizeUpdateV2(tokenId, keyword);

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    commitV2InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 1,
      closestNodeIndex: closestNodeIndex,
      leftEdgeNodeIndex: leftEdgeNodeIndex,
      rightEdgeNodeIndex: rightEdgeNodeIndex,
    };

    await expect(
      CommitManagerV2['submitCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'](commitV2InputArgs),
    ).to.be.revertedWithCustomError(CommitManagerV2, 'ServiceAgreementDoesntExist');
    await expect(
      CommitManagerV2U1['submitCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'](commitV2InputArgs),
    ).to.emit(CommitManagerV2U1, 'CommitSubmitted');
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update it, finalize update V2, teleport to the second epoch, submit R0 commits, expect R0 commits to be returned', async () => {
    const r0 = await ParametersStorage.r0();

    const { tokenId, keyword, agreementId } = await createAsset(2);
    await updateAsset(tokenId);
    const { winners, closestNodeIndex, leftEdgeNodeIndex, rightEdgeNodeIndex } = await finalizeUpdateV2(
      tokenId,
      keyword,
    );

    const epochLength = (await ParametersStorage.epochLength()).toNumber();
    await time.increase(epochLength);

    commitV2InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 1,
      closestNodeIndex: closestNodeIndex,
      leftEdgeNodeIndex: leftEdgeNodeIndex,
      rightEdgeNodeIndex: rightEdgeNodeIndex,
    };

    for (let i = 0; i < r0; i++) {
      await expect(
        CommitManagerV2.connect(winners[i].account)[
          'submitCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
        ](commitV2InputArgs),
      ).to.be.revertedWithCustomError(CommitManagerV2, 'ServiceAgreementDoesntExist');
      await expect(
        CommitManagerV2U1.connect(winners[i].account)[
          'submitCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
        ](commitV2InputArgs),
      ).to.emit(CommitManagerV2U1, 'CommitSubmitted');
    }

    await expect(CommitManagerV2.getTopCommitSubmissions(agreementId, 1)).to.be.revertedWithCustomError(
      CommitManagerV2,
      'ServiceAgreementDoesntExist',
    );
    const topCommits = await CommitManagerV2U1.getTopCommitSubmissions(agreementId, 1, 1);

    expect(topCommits.map((arr) => arr[0])).to.have.deep.members(
      winners.map((winner) => hre.ethers.BigNumber.from(winner.identityId)),
    );
  });

  it('Create new asset with proximityScoreFunctionsPair 1, update asset, submit update commit V1, expect revert InvalidScoreFunctionId', async () => {
    await createProfile(accounts[0], accounts[1]);

    const { tokenId, keyword } = await createAsset();
    await updateAsset(tokenId);

    commitV1InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };

    await expect(
      CommitManagerV2U1['submitUpdateCommit((address,uint256,bytes,uint8,uint16))'](commitV1InputArgs),
    ).to.be.revertedWithCustomError(CommitManagerV2U1, 'InvalidScoreFunctionId');
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update asset, submit update commit V2, expect CommitSubmitted event', async () => {
    const { tokenId, keyword } = await createAsset(2);

    const nodes = await createMultipleProfiles(30);

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

    await updateAsset(tokenId);

    await expect(
      CommitManagerV2U1['submitUpdateCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'](
        commitV2InputArgs,
      ),
    ).to.emit(CommitManagerV2U1, 'CommitSubmitted');
  });

  it('Create new asset with proximityScoreFunctionsPair 1, update it and submit <finalizationCommitsNumber> V1 update commits, expect revert InvalidScoreFunctionId', async () => {
    const finalizationRequirement = await ParametersStorage.finalizationCommitsNumber();

    const identityIds = [];
    for (let i = 0; i < finalizationRequirement; i++) {
      const node = await createProfile(accounts[i], accounts[accounts.length - 1]);
      identityIds.push(node.identityId);
    }

    const { tokenId, keyword } = await createAsset();
    await updateAsset(tokenId);

    commitV1InputArgs = {
      assetContract: ContentAssetStorageV2.address,
      tokenId: tokenId,
      keyword: keyword,
      hashFunctionId: 1,
      epoch: 0,
    };
    for (let i = 0; i < finalizationRequirement - 1; i++) {
      await expect(
        CommitManagerV2U1.connect(accounts[i])['submitUpdateCommit((address,uint256,bytes,uint8,uint16))'](
          commitV1InputArgs,
        ),
      ).to.be.revertedWithCustomError(CommitManagerV2U1, 'InvalidScoreFunctionId');
    }
  });

  it('Create new asset with proximityScoreFunctionsPair 2, update it and submit <finalizationCommitsNumber> V2 update commits, expect StateFinalized event', async () => {
    const r2 = await ParametersStorage.r2();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();
    const finalizationRequirement = await ParametersStorage.finalizationCommitsNumber();

    const { tokenId, keyword, agreementId } = await createAsset(2);

    const nodes = await createMultipleProfiles(30);

    const keyHash = hre.ethers.utils.soliditySha256(['bytes'], [keyword]);

    const neighborhood = await getNeighborhood(nodes, keyHash);

    const closestNode = neighborhood[0];
    const { leftEdgeNode, rightEdgeNode } = await getNeighborhoodEdgeNodes(neighborhood, keyHash);

    await updateAsset(tokenId);

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

    scoredNeighborhood.sort((a, b) => a.score - b.score);

    for (let i = 0; i < finalizationRequirement - 1; i++) {
      await expect(
        CommitManagerV2U1.connect(scoredNeighborhood[i].account)[
          'submitUpdateCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
        ](commitV2InputArgs),
      ).to.emit(CommitManagerV2U1, 'CommitSubmitted');
    }
    await expect(
      CommitManagerV2U1.connect(scoredNeighborhood[finalizationRequirement - 1].account)[
        'submitUpdateCommit((address,uint256,bytes,uint8,uint16,uint72,uint72,uint72))'
      ](commitV2InputArgs),
    ).to.emit(CommitManagerV2U1, 'StateFinalized');
    const topCommits = await CommitManagerV2U1.getTopCommitSubmissions(agreementId, 0, 1);
    expect(topCommits.map((arr) => arr[0])).to.include.deep.members(
      scoredNeighborhood.slice(0, finalizationRequirement).map((node) => hre.ethers.BigNumber.from(node.identityId)),
    );
  });
});
