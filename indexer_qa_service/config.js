module.exports = {
    HOURS: 7 * 24, // 7 dana
    networks: [
      {
        name: 'Gnosis',
        rpcUrl: 'https://rpc.gnosischain.com',
        hubAddress: '0x882D0BF07F956b1b94BBfe9E77F47c6fc7D4EC8f',
        // Direct contract addresses (fallback)
        stakingStorageAddress: '0x03DbaBD10C2e99C9F4cb5f18a6635545Ef526386',
        knowledgeCollectionStorageAddress: '0x3Cb124E1cDcEECF6E464BB185325608dbe635f5D',
        avgBlockTime: 5,
      },
      {
        name: 'Base',
        rpcUrl: 'https://api-base-mainnet-archive.n.dwellir.com/ce0b9180-f868-4142-a4c7-6265641cfb49',
        hubAddress: '0x99Aa571fD5e681c2D27ee08A7b7989DB02541d13',
        // Direct contract addresses (fallback)
        stakingStorageAddress: '0x57307C87E95a372C5D94BCC372bb7304505A739D',
        knowledgeCollectionStorageAddress: '0xc28F310A87f7621A087A603E2ce41C22523F11d7',
        avgBlockTime: 2,
      },
      {
        name: 'Neuroweb',
        rpcUrl: 'https://astrosat.origintrail.network',
        hubAddress: '0x0957e25BD33034948abc28204ddA54b6E1142D6F',
        // Direct contract addresses (fallback)
        stakingStorageAddress: '0x36175d07F8F0022B7cB24dd6F68062f1dD7E425f',
        knowledgeCollectionStorageAddress: '0x8f678eB0E57ee8A109B295710E23076fA3a443fe',
        avgBlockTime: 6,
      },
    ],
  };  