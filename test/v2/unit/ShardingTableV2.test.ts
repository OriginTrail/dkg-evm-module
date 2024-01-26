import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import hre from 'hardhat';

import { HubController, Profile, ShardingTableStorageV2, ShardingTableV2 } from '../../../typechain';

type ShardingTableFixture = {
  accounts: SignerWithAddress[];
  Profile: Profile;
  ShardingTableStorage: ShardingTableStorageV2;
  ShardingTable: ShardingTableV2;
};

describe('@v2 @unit ShardingTableV2 contract', function () {
  let accounts: SignerWithAddress[];
  let Profile: Profile;
  let ShardingTableStorage: ShardingTableStorageV2;
  let ShardingTable: ShardingTableV2;
  // let identityId: number;
  //
  // const nodeId1 = '0x01';
  // const nodeId2 = '0x02';
  // const nodeId3 = '0x03';
  // const nodeId4 = '0x04';
  // const nodeId5 = '0x05';

  // 3 1 2 4 5

  // console.log(hre.ethers.BigNumber.from(hre.ethers.utils.sha256(nodeId1)).toString());
  // console.log(hre.ethers.BigNumber.from(hre.ethers.utils.sha256(nodeId2)).toString());
  // console.log(hre.ethers.BigNumber.from(hre.ethers.utils.sha256(nodeId3)).toString());
  // console.log(hre.ethers.BigNumber.from(hre.ethers.utils.sha256(nodeId4)).toString());
  // console.log(hre.ethers.BigNumber.from(hre.ethers.utils.sha256(nodeId5)).toString());

  async function deployShardingTableFixture(): Promise<ShardingTableFixture> {
    await hre.deployments.fixture(['ShardingTableV2', 'IdentityStorageV2', 'StakingV2', 'Profile'], {
      keepExistingDeployments: false,
    });
    accounts = await hre.ethers.getSigners();
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    Profile = await hre.ethers.getContract<Profile>('Profile');
    ShardingTableStorage = await hre.ethers.getContract<ShardingTableStorageV2>('ShardingTableStorage');
    ShardingTable = await hre.ethers.getContract<ShardingTableV2>('ShardingTable');
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, Profile, ShardingTableStorage, ShardingTable };
  }

  // async function createMultipleProfiles() {
  //   const opWallet1 = Profile.connect(accounts[1]);
  //   const opWallet2 = Profile.connect(accounts[2]);
  //   const opWallet3 = Profile.connect(accounts[3]);
  //   const opWallet4 = Profile.connect(accounts[4]);
  //   const profile1 = await Profile.createProfile(accounts[6].address, nodeId1, 'Token', 'TKN');
  //   const profile2 = await opWallet1.createProfile(accounts[7].address, nodeId2, 'Token1', 'TKN1');
  //   const profile3 = await opWallet2.createProfile(accounts[8].address, nodeId3, 'Token2', 'TKN2');
  //   const profile4 = await opWallet3.createProfile(accounts[9].address, nodeId4, 'Token3', 'TKN3');
  //   const profile5 = await opWallet4.createProfile(accounts[10].address, nodeId5, 'Token4', 'TKN4');
  //   const idsArray = [];
  //
  //   const profileArray = [profile1, profile2, profile3, profile4, profile5];
  //   for (const singleIdentityId of profileArray) {
  //     const receipt = await singleIdentityId.wait();
  //
  //     identityId = receipt.events?.[3].args?.identityId.toNumber();
  //     idsArray.push(identityId);
  //   }
  //   return idsArray;
  // }
  //
  // async function validateShardingTableResult(identityIds: number[]) {
  //   const nodesCount = (await ShardingTableStorage.nodesCount()).toNumber();
  //
  //   expect(identityIds.length, 'Invalid number of nodes').to.equal(nodesCount);
  //
  //   for (let i = 0; i < identityIds.length; i++) {
  //     const node = await ShardingTableStorage.getNode(identityIds[i]);
  //     const nodeByIndex = await ShardingTableStorage.getNodeByIndex(i);
  //
  //     expect(node).to.be.eql(nodeByIndex);
  //
  //     expect(node.identityId.toNumber(), 'Invalid node on this position').to.equal(identityIds[i]);
  //
  //     expect(node.index.toNumber(), 'Invalid node index').to.equal(i);
  //     if (i === 0) {
  //       expect(node.prevIdentityId.toNumber(), 'Invalid prevIdentityId').to.equal(0);
  //     } else {
  //       expect(node.prevIdentityId.toNumber(), 'Invalid prevIdentityId').to.equal(identityIds[i - 1]);
  //     }
  //
  //     if (i === nodesCount - 1) {
  //       expect(node.nextIdentityId.toNumber(), 'Invalid nextIdentityId').to.equal(0);
  //     } else {
  //       expect(node.nextIdentityId.toNumber(), 'Invalid nextIdentityId').to.equal(identityIds[i + 1]);
  //     }
  //   }
  // }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, Profile, ShardingTableStorage, ShardingTable } = await loadFixture(deployShardingTableFixture));
  });

  it('Limit testing', async () => {
    for (let i = 1; i < 200; i++) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await ShardingTable['insertNode(uint72,uint256)'](i, 200 - i);

      const nodeByIndex = await ShardingTableStorage.getNodeByIndex(0);
      console.log(nodeByIndex);
    }
  });
  //
  // it('Should initialize contract with correct values', async () => {
  //   const name = await ShardingTable.name();
  //   const version = await ShardingTable.version();
  //
  //   expect(name).to.equal('ShardingTable');
  //   expect(version).to.equal('2.0.0');
  // });
  //
  // it('Insert 5 nodes, nodes are sorted expect to pass', async () => {
  //   const profiles = await createMultipleProfiles();
  //
  //   // 2
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[1], 0, 0);
  //   await validateShardingTableResult([2]);
  //
  //   // 3 2
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[2], 0, profiles[1]);
  //   await validateShardingTableResult([3, 2]);
  //
  //   // 3 2 5
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[4], profiles[1], 0);
  //   await validateShardingTableResult([3, 2, 5]);
  //
  //   // 3 2 4 5
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[3], profiles[1], profiles[4]);
  //   await validateShardingTableResult([3, 2, 4, 5]);
  //
  //   // 3 1 2 4 5
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[0], profiles[2], profiles[1]);
  //   await validateShardingTableResult([3, 1, 2, 4, 5]);
  // });
  //
  // it('Insert 5 nodes, without sorting, expect to be pass and be sorted on insert', async () => {
  //   const profiles = await createMultipleProfiles();
  //
  //   // 2
  //   await ShardingTable['insertNode(uint72)'](profiles[1]);
  //   await validateShardingTableResult([2]);
  //
  //   // 3 2
  //   await ShardingTable['insertNode(uint72)'](profiles[2]);
  //   await validateShardingTableResult([3, 2]);
  //
  //   // 3 2 5
  //   await ShardingTable['insertNode(uint72)'](profiles[4]);
  //   await validateShardingTableResult([3, 2, 5]);
  //
  //   // 3 2 4 5
  //   await ShardingTable['insertNode(uint72)'](profiles[3]);
  //   await validateShardingTableResult([3, 2, 4, 5]);
  //
  //   // 3 1 2 4 5
  //   await ShardingTable['insertNode(uint72)'](profiles[0]);
  //   await validateShardingTableResult([3, 1, 2, 4, 5]);
  // });
  //
  // it('Insert node with invalid prevIdentityId expect to fail', async () => {
  //   const profiles = await createMultipleProfiles();
  //
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[1], 0, 0);
  //
  //   await expect(
  //     ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[0], profiles[1], 0),
  //   ).to.be.revertedWithCustomError(ShardingTable, 'InvalidPreviousIdentityId');
  // });
  //
  // it('Insert node with invalid nextIdentityId expect to fail', async () => {
  //   const profiles = await createMultipleProfiles();
  //
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[1], 0, 0);
  //
  //   await expect(
  //     ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[3], 0, profiles[1]),
  //   ).to.be.revertedWithCustomError(ShardingTable, 'InvalidNextIdentityId');
  // });
  //
  // it('Insert node with invalid prevIdentityId and nextIdentityId expect to fail', async () => {
  //   const profiles = await createMultipleProfiles();
  //
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[2], 0, 0);
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[1], profiles[2], 0);
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[3], profiles[1], 0);
  //
  //   await expect(
  //     ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[0], profiles[2], profiles[3]),
  //   ).to.be.revertedWithCustomError(ShardingTable, 'InvalidPreviousOrNextIdentityId');
  // });
  //
  // it('Remove node from sharding table, expect to pass', async () => {
  //   const profiles = await createMultipleProfiles();
  //
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[2], 0, 0);
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[0], profiles[2], 0);
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[1], profiles[0], 0);
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[3], profiles[1], 0);
  //   await ShardingTable['insertNode(uint72,uint72,uint72)'](profiles[4], profiles[3], 0);
  //
  //   // remove from index 0
  //   await ShardingTable.removeNode(profiles[2]);
  //   await validateShardingTableResult([1, 2, 4, 5]);
  //
  //   // remove from last index
  //   await ShardingTable.removeNode(profiles[4]);
  //   await validateShardingTableResult([1, 2, 4]);
  //
  //   // remove from middle
  //   await ShardingTable.removeNode(profiles[1]);
  //   await validateShardingTableResult([1, 4]);
  // });
});
