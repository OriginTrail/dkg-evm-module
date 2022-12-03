module.exports = {
              compilers: {
                solc: {
                  version: '0.8.7',
                  settings: {
                    optimizer: {
                      enabled: true,
                      runs: 1000,
                    },
                    evmVersion: null
                  }
                }
              }
            }