import { randomBytes } from 'crypto';

import { HardhatEthersSigner as SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

import { Profile } from '../../typechain';

export type NodeAccounts = {
  admin: SignerWithAddress;
  operational: SignerWithAddress;
};

export async function createProfile(
  ProfileContract: Profile,
  nodeAccounts: NodeAccounts,
) {
  const nodeId = '0x' + randomBytes(32).toString('hex');
  const tx = await ProfileContract.connect(
    nodeAccounts.operational,
  ).createProfile(
    nodeAccounts.admin.address,
    [],
    `Node ${Math.floor(Math.random() * 1000)}`,
    nodeId,
    0,
  );
  const receipt = await tx.wait();
  const identityId = Number(receipt!.logs[0].topics[1]);
  return { nodeId, identityId };
}

export async function createProfiles(
  ProfileContract: Profile,
  nodeAccounts: NodeAccounts[],
): Promise<{ nodeId: string; identityId: number }[]> {
  const profiles: { nodeId: string; identityId: number }[] = [];
  for (let i = 0; i < nodeAccounts.length; i++) {
    const { nodeId, identityId } = await createProfile(
      ProfileContract,
      nodeAccounts[i],
    );
    profiles.push({ nodeId, identityId });
  }
  return profiles;
}
