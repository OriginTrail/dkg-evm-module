import 'dotenv/config';

export function rpc(networkName: string): string {
  if (networkName) {
    const rpc = process.env['RPC_' + networkName.toUpperCase()];
    if (rpc && rpc !== '') {
      return rpc;
    }
  }

  if (networkName === 'localhost') {
    return 'http://localhost:8545';
  }

  return '';
}

export function mnemonic(networkName?: string): string {
  let mnemonic;

  if (networkName) {
    mnemonic = process.env['MNEMONIC_' + networkName.toUpperCase()];
    if (mnemonic && mnemonic !== '') {
      return mnemonic;
    }
  }

  mnemonic = process.env.MNEMONIC;
  if (!mnemonic || mnemonic === '') {
    return 'test test test test test test test test test test test junk';
  }

  return mnemonic;
}

export function accounts(networkName?: string): { mnemonic: string } {
  return { mnemonic: mnemonic(networkName) };
}
