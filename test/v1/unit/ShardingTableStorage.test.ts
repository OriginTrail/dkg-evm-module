import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubController, Profile, ShardingTableStorage } from '../../../typechain';

type ShardingTableStorageFixture = {
  accounts: SignerWithAddress[];
  ShardingTableStorage: ShardingTableStorage;
  Profile: Profile;
};

describe('@v1 @unit ShardingTableStorage Contract', function () {
  let accounts: SignerWithAddress[];
  let ShardingTableStorage: ShardingTableStorage;
  let Profile: Profile;
  let identityId: number;
  const nodeId1 = '0x07f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb66';
  const nodeId2 = '0x08f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb67';
  const nodeId3 = '0x08f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb68';
  const nodeId4 = '0x08f38512786964d9e70453371e7c98975d284100d44bd68dab67fe00b525cb69';

  async function deployShardingTableStorageFixture(): Promise<ShardingTableStorageFixture> {
    await hre.deployments.fixture(['ShardingTableStorage', 'Profile']);
    accounts = await hre.ethers.getSigners();
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    ShardingTableStorage = await hre.ethers.getContract<ShardingTableStorage>('ShardingTableStorage');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return {
      accounts,
      ShardingTableStorage,
      Profile,
    };
  }

  async function createProfile() {
    const profile = await Profile.createProfile(accounts[1].address, [], nodeId1, 'Token', 'TKN', 0);
    const receipt = await profile.wait();

    return receipt.events?.[3].args?.identityId.toNumber();
  }

  async function createMultipleProfiles() {
    const adminWallet1 = Profile.connect(accounts[1]);
    const adminWallet2 = Profile.connect(accounts[2]);
    const profile1 = await Profile.createProfile(accounts[3].address, [], nodeId1, 'Token', 'TKN', 0);
    const profile2 = await adminWallet1.createProfile(accounts[4].address, [], nodeId2, 'Token1', 'TKN1', 0);
    const profile3 = await adminWallet2.createProfile(accounts[5].address, [], nodeId3, 'Token2', 'TKN2', 0);
    const idsArray = [];

    const profileArray = [profile1, profile2, profile3];
    for (const singleIdentityId of profileArray) {
      const receipt = await singleIdentityId.wait();

      identityId = receipt.events?.[3].args?.identityId.toNumber();
      idsArray.push(identityId);
    }
    return idsArray;
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ShardingTableStorage, Profile } = await loadFixture(deployShardingTableStorageFixture));
  });

  it('The contract is named "ShardingTableStorage"', async () => {
    expect(await ShardingTableStorage.name()).to.equal('ShardingTableStorage');
  });

  it('The contract is version "1.0.0"', async () => {
    expect(await ShardingTableStorage.version()).to.equal('1.0.0');
  });

  it('Create 3 nodes and create node object, expect to pass', async () => {
    const profiles = await createMultipleProfiles();
    await ShardingTableStorage.createNodeObject(profiles[1], profiles[0], profiles[2]);
    const getNodeResult = await ShardingTableStorage.getNode(profiles[1]);

    expect(getNodeResult.identityId.toNumber()).to.equal(profiles[1]);
    expect(getNodeResult.prevIdentityId.toNumber()).to.equal(profiles[0]);
    expect(getNodeResult.nextIdentityId.toNumber()).to.equal(profiles[2]);
  });

  it('Delete created node object, expect to pass', async () => {
    identityId = await createProfile();
    await ShardingTableStorage.createNodeObject(identityId, identityId, identityId);
    const nodeResult = await ShardingTableStorage.getNode(identityId);

    expect(nodeResult.identityId.toNumber()).to.equal(identityId);
    expect(nodeResult.prevIdentityId.toNumber()).to.equal(identityId);
    expect(nodeResult.nextIdentityId.toNumber()).to.equal(identityId);

    await ShardingTableStorage.deleteNodeObject(identityId);
    const deleteNodeResult = await ShardingTableStorage.getNode(identityId);

    deleteNodeResult.forEach((e) => {
      expect(e.toString()).to.equal('0');
    });
  });

  it('Increment and decrement nodes count, expect to pass', async () => {
    const nodesCount = await ShardingTableStorage.nodesCount();

    expect(nodesCount.toNumber()).to.equal(0);

    await ShardingTableStorage.incrementNodesCount();
    const incrementedNodeCount = await ShardingTableStorage.nodesCount();

    expect(incrementedNodeCount.toNumber()).to.equal(1);

    await ShardingTableStorage.decrementNodesCount();
    const decrementedNodeCount = await ShardingTableStorage.nodesCount();

    expect(decrementedNodeCount.toNumber()).to.equal(0);
  });

  it('Set profile identityId to be head, expect to pass', async () => {
    await ShardingTableStorage.setHead(2);
    const headValue = await ShardingTableStorage.head();

    expect(headValue.toNumber()).to.equal(2);
  });

  it('Set profile identityId to be tail, expect to pass', async () => {
    await ShardingTableStorage.setTail(2);
    const tailValue = await ShardingTableStorage.tail();

    expect(tailValue.toNumber()).to.equal(2);
  });

  it('Check node existence with valid identity id, expect to pass', async () => {
    identityId = await createProfile();
    await ShardingTableStorage.createNodeObject(identityId, identityId, identityId);
    const nodeExists = await ShardingTableStorage.nodeExists(identityId);

    expect(nodeExists).to.be.true;
  });

  it('Set new previous identity id, expect to pass', async () => {
    identityId = await createProfile();
    const newPrevIdentityId = 2;

    await ShardingTableStorage.createNodeObject(identityId, identityId, identityId);
    await ShardingTableStorage.setPrevIdentityId(identityId, newPrevIdentityId);
    const nodeResult = await ShardingTableStorage.getNode(identityId);

    expect(nodeResult.identityId.toNumber()).to.equal(identityId);
    expect(nodeResult.prevIdentityId.toNumber()).to.equal(newPrevIdentityId);
    expect(nodeResult.nextIdentityId.toNumber()).to.equal(identityId);
  });

  it('Set new next identity id, expect to pass', async () => {
    identityId = await createProfile();
    const newNextIdentityId = 3;

    await ShardingTableStorage.createNodeObject(identityId, identityId, identityId);
    await ShardingTableStorage.setNextIdentityId(identityId, newNextIdentityId);
    const nodeResult = await ShardingTableStorage.getNode(identityId);

    expect(nodeResult.identityId.toNumber()).to.equal(identityId);
    expect(nodeResult.prevIdentityId.toNumber()).to.equal(identityId);
    expect(nodeResult.nextIdentityId.toNumber()).to.equal(newNextIdentityId);
  });

  it('Create 4 nodes, node 4 linked with node 2 and 3, get multiple nodes, expect to pass', async () => {
    // create 3 nodes and set node object for prev and next identityId
    const profiles = await createMultipleProfiles();
    await ShardingTableStorage.createNodeObject(profiles[1], profiles[0], profiles[2]); // identityId = 2, prevIdentityId = 1, nextIdentityId = 3
    const getNodeResult = await ShardingTableStorage.getNode(profiles[1]);

    expect(getNodeResult.identityId.toNumber()).to.equal(profiles[1]);
    expect(getNodeResult.prevIdentityId.toNumber()).to.equal(profiles[0]);
    expect(getNodeResult.nextIdentityId.toNumber()).to.equal(profiles[2]);

    // add 1 more node
    const adminWallet3 = await Profile.connect(accounts[3]);
    const newProfile = await adminWallet3.createProfile(accounts[0].address, [], nodeId4, 'Token4', 'TKN4', 0);

    const receipt1 = await newProfile.wait();
    const newIdentityId = receipt1.events?.[3].args?.identityId;

    await ShardingTableStorage.createNodeObject(newIdentityId, newIdentityId, newIdentityId);

    await ShardingTableStorage.link(profiles[1], newIdentityId); // left = 2, right = 4
    await ShardingTableStorage.link(newIdentityId, profiles[2]); // left = 4, right = 3

    const getLinkedNodeValues = await ShardingTableStorage.getNode(newIdentityId);
    expect(getLinkedNodeValues.prevIdentityId).to.equal(profiles[1]); // 2
    expect(getLinkedNodeValues.nextIdentityId).to.equal(profiles[2]); // 3

    const getValuesForNext2Nodes = await ShardingTableStorage.getMultipleNodes(profiles[1], 2);

    // NODE[2] has 2 linked nodes:
    // FIRST: previous identityId 1 and nextIdentity id 4
    // SECOND: previous identityId 2 and nextIdentity id 3
    expect(getValuesForNext2Nodes.length).to.equal(2);
    expect(getValuesForNext2Nodes[0].identityId).to.equal(profiles[1]);
    expect(getValuesForNext2Nodes[0].prevIdentityId).to.equal(profiles[0]);
    expect(getValuesForNext2Nodes[0].nextIdentityId).to.equal(newIdentityId);
    expect(getValuesForNext2Nodes[1].identityId).to.equal(newIdentityId);
    expect(getValuesForNext2Nodes[1].prevIdentityId).to.equal(profiles[1]);
    expect(getValuesForNext2Nodes[1].nextIdentityId).to.equal(profiles[2]);
  });
});
