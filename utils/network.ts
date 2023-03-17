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

export function privateKey(networkName?: string): string | undefined {
  let privateKey;

  if (networkName) {
    privateKey = process.env['EVM_PRIVATE_KEY_' + networkName.toUpperCase()];
    if (privateKey && privateKey !== '') {
      return privateKey;
    }
  }

  return undefined;
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

export function accounts(networkName?: string): [string] | { mnemonic: string } {
  const privKey = privateKey(networkName);

  if (privKey) {
    return [privKey];
  } else {
    return { mnemonic: mnemonic(networkName) };
  }
}
