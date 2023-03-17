import { BytesLike } from 'ethers';

declare module 'assertion-tools' {
  export function calculateRoot(nQuads: string[]): BytesLike;
  export function getMerkleProof(nQuads: string[], challenge: number): { proof: BytesLike[]; leaf: BytesLike };
}
