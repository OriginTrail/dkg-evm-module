require('dotenv').config({ path: `${__dirname}/.env` });

/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * trufflesuite.com/docs/advanced/configuration
 *
 * To deploy via Infura you'll need a wallet provider (like @truffle/hdwallet-provider)
 * to sign your transactions before they're sent to a remote public node. Infura accounts
 * are available for free at: infura.io/register.
 *
 * You'll also need a mnemonic - the twelve word phrase the wallet uses to generate
 * public/private key pairs. If you're publishing your code to GitHub make sure you load this
 * phrase from a file you've .gitignored so it doesn't accidentally become public.
 *
 */
const private_key = process.env.PRIVATE_KEY;
const rpc_endpoint = process.env.ACCESS_KEY;

const HDWalletProvider = require('@truffle/hdwallet-provider');
//
// const fs = require('fs');
// const mnemonic = fs.readFileSync(".secret").toString().trim();
module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //
    ganache: {
      host: 'localhost',
      port: 7545,
      gas: 6000000,
      network_id: '5777',
      provider: () => new HDWalletProvider([private_key], rpc_endpoint),
    },
    rinkeby: {
      network_id: 4,
      gas: 500000, // Gas limit used for deploys
      gasPrice: 200000000000,
      skipDryRun: true,
      provider: () => new HDWalletProvider([private_key], rpc_endpoint),
    },
    mumbai: {
      network_id: 80001,
      gas: 10000000, // Gas limit used for deploys
      gasPrice: 100000000000,
      skipDryRun: true,
      provider: () => new HDWalletProvider([private_key], rpc_endpoint),
    },
    otp_devnet: {
      network_id: 2160,
      gas: 10000000, // Gas limit used for deploys
      gasPrice: 10000000,
      skipDryRun: true,
      provider: () =>
        new HDWalletProvider([private_key], process.env.OTP_DEVNET_RPC),
    },
    otp_testnet: {
      network_id: 20430,
      gas: 10000000, // Gas limit used for deploys
      gasPrice: 20,
      skipDryRun: true,
      provider: () =>
        new HDWalletProvider([private_key], process.env.OTP_TESTNET_RPC),
    },
    otp_mainnet: {
      network_id: 2043,
      gas: 10000000, // Gas limit used for deploys
      gasPrice: 10,
      skipDryRun: true,
      provider: () =>
        new HDWalletProvider([private_key], process.env.OTP_MAINNET_RPC),
    },

    // development: {
    //  host: "127.0.0.1",     // Localhost (default: none)
    //  port: 8545,            // Standard Ethereum port (default: none)
    //  network_id: "*",       // Any network (default: none)
    // },
    // Another network with more advanced options...
    // advanced: {
    // port: 8777,             // Custom port
    // network_id: 1342,       // Custom network
    // gas: 8500000,           // Gas sent with each transaction (default: ~6700000)
    // gasPrice: 20000000000,  // 20 gwei (in wei) (default: 100 gwei)
    // from: <address>,        // Account to send txs from (default: accounts[0])
    // websocket: true        // Enable EventEmitter interface for web3 (default: false)
    // },
    // Useful for deploying to a public network.
    // NB: It's important to wrap the provider as a function.
    // ropsten: {
    // provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/YOUR-PROJECT-ID`),
    // network_id: 3,       // Ropsten's id
    // gas: 5500000,        // Ropsten has a lower block limit than mainnet
    // confirmations: 2,    // # of confs to wait between deployments. (default: 0)
    // timeoutBlocks: 200,  // # of blocks before a deployment times out  (minimum/default: 50)
    // skipDryRun: true     // Skip dry run before migrations? (default: false for public nets )
    // },
    // Useful for private networks
    // private: {
    // provider: () => new HDWalletProvider(mnemonic, `https://network.io`),
    // network_id: 2111,   // This network is yours, in the cloud.
    // production: true    // Treats this network as if it was a public net. (default: false)
    // }
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    reporter: 'eth-gas-reporter',
    reporterOptions: {
      excludeContracts: ['Migrations']
    }
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: '0.8.16', // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200,
          // Switch optimizer components on or off in detail.
          // The "enabled" switch above provides two defaults which can be
          // tweaked here. If "details" is given, "enabled" can be omitted.
          details: {
            // The peephole optimizer is always on if no details are given,
            // use details to switch it off.
            peephole: true,
            // The inliner is always on if no details are given,
            // use details to switch it off.
            inliner: true,
            // The unused jumpdest remover is always on if no details are given,
            // use details to switch it off.
            jumpdestRemover: true,
            // Sometimes re-orders literals in commutative operations.
            orderLiterals: true,
            // Removes duplicate code blocks
            deduplicate: true,
            // Common subexpression elimination, this is the most complicated step but
            // can also provide the largest gain.
            cse: true,
            // Optimize representation of literal numbers and strings in code.
            constantOptimizer: true,
            // The new Yul optimizer. Mostly operates on the code of ABI coder v2
            // and inline assembly.
            // It is activated together with the global optimizer setting
            // and can be deactivated here.
            // Before Solidity 0.6.0 it had to be activated through this switch.
            yul: true,
            // Tuning options for the Yul optimizer.
            yulDetails: {
              // Improve allocation of stack slots for variables, can free up stack slots early.
              // Activated by default if the Yul optimizer is activated.
              stackAllocation: true,
              // Select optimization steps to be applied. It is also possible to modify both the
              // optimization sequence and the clean-up sequence. Instructions for each sequence
              // are separated with the ":" delimiter and the values are provided in the form of
              // optimization-sequence:clean-up-sequence. For more information see
              // "The Optimizer > Selecting Optimizations".
              // This field is optional, and if not provided, the default sequences for both
              // optimization and clean-up are used. If only one of the options is provivded
              // the other will not be run.
              // If only the delimiter ":" is provided then neither the optimization nor the clean-up
              // sequence will be run.
              // If set to an empty value, only the default clean-up sequence is used and
              // no optimization steps are applied.
              // optimizerSteps: "dhfoDgvulfnTUtnIf..."
            }
          },
        },
        //  evmVersion: "byzantium"
        // Optional: Change compilation pipeline to go through the Yul intermediate representation.
        // This is false by default.
        viaIR: true,
        // Optional: Debugging settings
        // debug: {
          // How to treat revert (and require) reason strings. Settings are
          // "default", "strip", "debug" and "verboseDebug".
          // "default" does not inject compiler-generated revert strings and keeps user-supplied ones.
          // "strip" removes all revert strings (if possible, i.e. if literals are used) keeping side-effects
          // "debug" injects strings for compiler-generated internal reverts, implemented for ABI encoders V1 and V2 for now.
          // "verboseDebug" even appends further information to user-supplied revert strings (not yet implemented)
          // revertStrings: "debug",
          // Optional: How much extra debug information to include in comments in the produced EVM
          // assembly and Yul code. Available components are:
          // - `location`: Annotations of the form `@src <index>:<start>:<end>` indicating the
          //    location of the corresponding element in the original Solidity file, where:
          //     - `<index>` is the file index matching the `@use-src` annotation,
          //     - `<start>` is the index of the first byte at that location,
          //     - `<end>` is the index of the first byte after that location.
          // - `snippet`: A single-line code snippet from the location indicated by `@src`.
          //     The snippet is quoted and follows the corresponding `@src` annotation.
          // - `*`: Wildcard value that can be used to request everything.
          // debugInfo: ["location", "snippet"]
        // },
      },
    },
  },

  // Plugins
  plugins: [
    // 'solidity-coverage',
    'truffle-contract-size'
  ],

  // Truffle DB is currently disabled by default; to enable it, change enabled:
  // false to enabled: true. The default storage location can also be
  // overridden by specifying the adapter settings, as shown in the commented code below.
  //
  // NOTE: It is not possible to migrate your contracts to truffle DB and you should
  // make a backup of your artifacts to a safe location before enabling this feature.
  //
  // After you backed up your artifacts you can utilize db by running migrate as follows:
  // $ truffle migrate --reset --compile-all
  //
  // db: {
  // enabled: false,
  // host: "127.0.0.1",
  // adapter: {
  //   name: "sqlite",
  //   settings: {
  //     directory: ".db"
  //   }
  // }
  // }
};
