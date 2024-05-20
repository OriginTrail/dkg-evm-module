import { randomBytes } from 'crypto';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { BytesLike, BigNumber } from 'ethers';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, Profile, ProfileStorage, ShardingTableStorageV2, ShardingTableV2 } from '../../../typechain';

type ShardingTableFixture = {
  accounts: SignerWithAddress[];
  Profile: Profile;
  ShardingTableStorage: ShardingTableStorageV2;
  ShardingTable: ShardingTableV2;
};

type Node = {
  account: SignerWithAddress;
  identityId: number;
  nodeId: BytesLike;
  sha256: BytesLike;
};

describe('@v2 @unit ShardingTableV2 contract', function () {
  let accounts: SignerWithAddress[];
  let Profile: Profile;
  let ShardingTableStorage: ShardingTableStorageV2;
  let ShardingTable: ShardingTableV2;
  let ProfileStorage: ProfileStorage;
  let identityId: number;

  const nodeId1 = '0x01';
  const nodeId2 = '0x02';
  const nodeId3 = '0x03';
  const nodeId4 = '0x04';
  const nodeId5 = '0x05';

  // 3 1 2 4 5

  async function deployShardingTableFixture(): Promise<ShardingTableFixture> {
    await hre.deployments.fixture(['ShardingTableV2', 'IdentityStorageV2', 'StakingV2', 'Profile'], {
      keepExistingDeployments: false,
    });
    accounts = await hre.ethers.getSigners();
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    ShardingTableStorage = await hre.ethers.getContract<ShardingTableStorageV2>('ShardingTableStorage');
    ShardingTable = await hre.ethers.getContract<ShardingTableV2>('ShardingTable');
    ProfileStorage = await hre.ethers.getContract<ProfileStorage>('ProfileStorage');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Profile, ShardingTableStorage, ShardingTable };
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

    return {
      account: operational,
      identityId,
      nodeId,
      sha256,
    };
  }

  async function createMultipleRandomProfiles(count = 150): Promise<Node[]> {
    const nodes = [];

    for (let i = 0; i < count; i++) {
      const node = await createProfile(accounts[i], accounts[i + count]);
      nodes.push(node);
    }

    return nodes;
  }

  async function createMultipleProfiles() {
    const opWallet1 = Profile.connect(accounts[1]);
    const opWallet2 = Profile.connect(accounts[2]);
    const opWallet3 = Profile.connect(accounts[3]);
    const opWallet4 = Profile.connect(accounts[4]);
    const profile1 = await Profile.createProfile(accounts[6].address, [], nodeId1, 'Token', 'TKN', 0);
    const profile2 = await opWallet1.createProfile(accounts[7].address, [], nodeId2, 'Token1', 'TKN1', 0);
    const profile3 = await opWallet2.createProfile(accounts[8].address, [], nodeId3, 'Token2', 'TKN2', 0);
    const profile4 = await opWallet3.createProfile(accounts[9].address, [], nodeId4, 'Token3', 'TKN3', 0);
    const profile5 = await opWallet4.createProfile(accounts[10].address, [], nodeId5, 'Token4', 'TKN4', 0);
    const idsArray = [];

    const profileArray = [profile1, profile2, profile3, profile4, profile5];
    for (const singleIdentityId of profileArray) {
      const receipt = await singleIdentityId.wait();

      identityId = receipt.events?.[3].args?.identityId.toNumber();
      idsArray.push(identityId);
    }
    return idsArray;
  }

  async function validateShardingTableResult(identityIds: number[]) {
    const nodesCount = (await ShardingTableStorage.nodesCount()).toNumber();

    expect(identityIds.length).to.equal(nodesCount, 'Invalid number of nodes');

    for (let i = 0; i < identityIds.length; i++) {
      const node = await ShardingTableStorage.getNode(identityIds[i]);
      const nodeByIndex = await ShardingTableStorage.getNodeByIndex(i);

      expect(node).to.be.eql(nodeByIndex);

      expect(node.identityId.toNumber()).to.equal(identityIds[i], 'Invalid node on this position');

      expect(node.index.toNumber()).to.equal(i, 'Invalid node index');
    }

    const shardingTable = (await ShardingTable['getShardingTable()']()).map((node) => node.identityId.toNumber());

    expect(shardingTable).to.be.eql(identityIds);
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Profile, ShardingTableStorage, ShardingTable } = await loadFixture(deployShardingTableFixture));
  });

  it('Should initialize contract with correct values', async () => {
    const name = await ShardingTable.name();
    const version = await ShardingTable.version();

    expect(name).to.equal('ShardingTable');
    expect(version).to.equal('2.0.1');
  });

  it('Insert 5 nodes, nodes are sorted expect to pass', async () => {
    const profiles = await createMultipleProfiles();

    // 2
    await ShardingTable['insertNode(uint72,uint72)'](0, profiles[1]);
    await validateShardingTableResult([2]);

    // 3 2
    await ShardingTable['insertNode(uint72,uint72)'](0, profiles[2]);
    await validateShardingTableResult([3, 2]);

    // 3 2 5
    await ShardingTable['insertNode(uint72,uint72)'](2, profiles[4]);
    await validateShardingTableResult([3, 2, 5]);

    // 3 2 4 5
    await ShardingTable['insertNode(uint72,uint72)'](2, profiles[3]);
    await validateShardingTableResult([3, 2, 4, 5]);

    // 3 1 2 4 5
    await ShardingTable['insertNode(uint72,uint72)'](1, profiles[0]);
    await validateShardingTableResult([3, 1, 2, 4, 5]);
  });

  it('Insert 5 nodes, without sorting, expect to be pass and be sorted on insert', async () => {
    const profiles = await createMultipleProfiles();

    // 2
    await ShardingTable['insertNode(uint72)'](profiles[1]);
    await validateShardingTableResult([2]);

    // 3 2
    await ShardingTable['insertNode(uint72)'](profiles[2]);
    await validateShardingTableResult([3, 2]);

    // 3 2 5
    await ShardingTable['insertNode(uint72)'](profiles[4]);
    await validateShardingTableResult([3, 2, 5]);

    // 3 2 4 5
    await ShardingTable['insertNode(uint72)'](profiles[3]);
    await validateShardingTableResult([3, 2, 4, 5]);

    // 3 1 2 4 5
    await ShardingTable['insertNode(uint72)'](profiles[0]);
    await validateShardingTableResult([3, 1, 2, 4, 5]);
  });

  it('Insert 100 nodes to the beginning of the Sharding Table, expect gas consumption to fit in 1_000_000 wei', async () => {
    const gasConsumptionThreshold = hre.ethers.utils.parseEther('1000000');

    const nodes = await createMultipleRandomProfiles(100);

    const sortedNodes = nodes.sort((a, b) => {
      const aBN = BigNumber.from(a.sha256);
      const bBN = BigNumber.from(b.sha256);
      if (bBN.eq(aBN)) {
        return 0;
      }
      return bBN.lt(aBN) ? -1 : 1;
    });

    for (const node of sortedNodes) {
      const tx = await ShardingTable['insertNode(uint72,uint72)'](0, node.identityId);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lessThanOrEqual(gasConsumptionThreshold);
    }
  });

  it('Insert node with invalid prevIdentityId expect to fail', async () => {
    const profiles = await createMultipleProfiles();

    await ShardingTable['insertNode(uint72,uint72)'](0, profiles[1]);

    await expect(ShardingTable['insertNode(uint72,uint72)'](1, profiles[0])).to.be.revertedWithCustomError(
      ShardingTable,
      'InvalidIndexWithRespectToPreviousNode',
    );
  });

  it('Insert node with invalid nextIdentityId expect to fail', async () => {
    const profiles = await createMultipleProfiles();

    await ShardingTable['insertNode(uint72,uint72)'](0, profiles[1]);

    await expect(ShardingTable['insertNode(uint72,uint72)'](0, profiles[3])).to.be.revertedWithCustomError(
      ShardingTable,
      'InvalidIndexWithRespectToNextNode',
    );
  });

  it('Remove node from sharding table, expect to pass', async () => {
    const profiles = await createMultipleProfiles();

    await ShardingTable['insertNode(uint72,uint72)'](0, profiles[2]);
    await ShardingTable['insertNode(uint72,uint72)'](1, profiles[0]);
    await ShardingTable['insertNode(uint72,uint72)'](2, profiles[1]);
    await ShardingTable['insertNode(uint72,uint72)'](3, profiles[3]);
    await ShardingTable['insertNode(uint72,uint72)'](4, profiles[4]);

    // remove from index 0
    await ShardingTable.removeNode(profiles[2]);
    await validateShardingTableResult([1, 2, 4, 5]);

    // remove from last index
    await ShardingTable.removeNode(profiles[4]);
    await validateShardingTableResult([1, 2, 4]);

    // remove from middle
    await ShardingTable.removeNode(profiles[1]);
    await validateShardingTableResult([1, 4]);
  });
});
