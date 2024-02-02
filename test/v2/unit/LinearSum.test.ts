import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BytesLike } from 'ethers';
import hre from 'hardhat';

import { LinearSum, ParametersStorage } from '../../../typechain';

type LinearSumFixture = {
  accounts: SignerWithAddress[];
  LinearSum: LinearSum;
};

describe('@v2 @unit LinearSum', function () {
  const HASH_RING_SIZE = BigNumber.from(2).pow(256).sub(1);
  const UINT256_MAX_BN = BigNumber.from(2).pow(256).sub(1);
  const UINT64_MAX_BN = BigNumber.from(2).pow(64).sub(1);
  const UINT40_MAX_BN = BigNumber.from(2).pow(40).sub(1);

  let accounts: SignerWithAddress[];
  let ParametersStorage: ParametersStorage;
  let LinearSum: LinearSum;

  async function deployLinearSumFixture(): Promise<LinearSumFixture> {
    await hre.deployments.fixture(['LinearSum']);
    ParametersStorage = await hre.ethers.getContract<ParametersStorage>('ParametersStorage');
    LinearSum = await hre.ethers.getContract<LinearSum>('LinearSum');
    accounts = await hre.ethers.getSigners();

    return { accounts, LinearSum };
  }

  function generateRandomHashes(count: number): string[] {
    const hashes = [];

    for (let i = 0; i < count; i += 1) {
      hashes.push('0x' + randomBytes(32).toString('hex'));
    }

    return hashes;
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

    const divisor = maxNeighborhoodDistance.lte(idealMaxDistanceInNeighborhood)
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
    finalScore = toUint40(finalScore, UINT64_MAX_BN);

    return finalScore;
  }

  beforeEach(async function () {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, LinearSum } = await loadFixture(deployLinearSumFixture));
  });

  it('Should deploy successfully with correct initial parameters', async function () {
    expect(await LinearSum.name()).to.equal('LinearSum');
    expect(await LinearSum.getParameters()).to.eql([
      BigNumber.from('1000000000000000000'),
      BigNumber.from('1000000000000000000'),
      1,
      1,
    ]);
  });

  it('Should calculate distance correctly for 30 random nodes/KAs', async function () {
    const peerIds = generateRandomHashes(30);
    const keywords = generateRandomHashes(30);

    const peerHashes = peerIds.map((peerId) => hre.ethers.utils.soliditySha256(['bytes'], [peerId]));
    const keyHashes = keywords.map((keyword) => hre.ethers.utils.soliditySha256(['bytes'], [keyword]));

    for (let i = 0; i < peerHashes.length; i += 1) {
      const expectedDistance = calculateDistance(peerHashes[i], keyHashes[i]);
      const calculatedDistance = await LinearSum.calculateDistance(1, peerIds[i], keywords[i]);

      expect(calculatedDistance).to.be.equal(expectedDistance);
    }
  });

  it('Should calculate score correctly for 30 random nodes/KAs', async function () {
    const r2 = await ParametersStorage.r2();
    const minStake = await ParametersStorage.minimumStake();
    const maxStake = await ParametersStorage.maximumStake();

    const minStakeNumber = Number(hre.ethers.utils.formatEther(minStake));
    const maxStakeNumber = Number(hre.ethers.utils.formatEther(maxStake));

    const peerHashes = generateRandomHashes(30);
    const keyHashes = generateRandomHashes(30);

    for (const keyHash of keyHashes) {
      const peerHashesWithDistances = peerHashes.map((peerHash) => ({
        hash: peerHash,
        distance: calculateDistance(peerHash, keyHash),
      }));

      const maxDistance = peerHashesWithDistances.reduce(
        (max, obj) =>
          BigNumber.from(obj.hash).gt(BigNumber.from(max)) ? BigNumber.from(obj.hash) : BigNumber.from(max),
        BigNumber.from(peerHashesWithDistances[0].hash),
      );

      for (const peerHash of peerHashesWithDistances) {
        const stake = hre.ethers.utils.parseEther(
          `${Math.floor(Math.random() * (maxStakeNumber - minStakeNumber + 1)) + minStakeNumber}`,
        );
        const expectedScore = await calculateScore(
          peerHash.distance,
          stake,
          maxDistance,
          r2,
          peerHashes.length,
          minStake,
          maxStake,
        );
        const calculatedScore = await LinearSum.calculateScore(
          peerHash.distance,
          maxDistance,
          peerHashes.length,
          stake,
        );

        expect(calculatedScore).to.be.equal(expectedScore);
      }
    }
  });
});
