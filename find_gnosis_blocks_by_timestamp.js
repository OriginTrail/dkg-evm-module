const { ethers } = require('ethers');

// #################### PODACI ZA UNOS ####################

// 1. Unesi RPC URL za Gnosis mrežu.
//    Javni endpoint je već unet kao podrazumevana vrednost.
const RPC_URL = 'https://rpc.gnosischain.com';

// 2. Unesi početni i krajnji timestamp epohe (u SEKUNDAMA).
//    Timestamp konverter: https://www.epochconverter.com/
const START_TIMESTAMP = 1749772800; // Primer: 1. jun 2024. 00:00:00
const END_TIMESTAMP = 1752364800; //   Primer: 1. jul 2024. 00:00:00

// ########################################################

const MAX_RECENT_BLOCKS_FOR_AVG = 100; // koliko blokova koristimo za prosečno vreme

async function getAverageBlockTime(provider) {
  const latestNumber = await provider.getBlockNumber();
  const earlierNumber = Math.max(latestNumber - MAX_RECENT_BLOCKS_FOR_AVG, 1);
  const [latestBlock, earlierBlock] = await Promise.all([
    provider.getBlock(latestNumber),
    provider.getBlock(earlierNumber),
  ]);
  const diffTs = latestBlock.timestamp - earlierBlock.timestamp;
  const diffBlocks = latestBlock.number - earlierBlock.number;
  return diffTs / diffBlocks;
}

/**
 * Pronalazi prvi blok čiji je timestamp veći ili jednak ciljanom timestampu.
 * Koristi optimizovanu binarnu pretragu.
 * @param {ethers.JsonRpcProvider} provider - Aktivna konekcija ka Gnosis RPC-u.
 * @param {number} targetTimestamp - Ciljani timestamp u sekundama.
 * @returns {Promise<{blockNumber: number, blockTimestamp: number}>}
 */
async function findBlockForTimestamp(provider, targetTimestamp) {
  const latestBlock = await provider.getBlock('latest');
  if (latestBlock.timestamp < targetTimestamp) {
    // Timestamp je u budućnosti – vraćamo približan blok (latest + procena)
    const avg = await getAverageBlockTime(provider);
    const secsAhead = targetTimestamp - latestBlock.timestamp;
    const estBlocksAhead = Math.ceil(secsAhead / avg);
    console.warn(
      `⚠️  Traženi timestamp je u budućnosti za ovu mrežu. Vraćam poslednji blok #${latestBlock.number} ` +
        `i procenjujem da će blok #${latestBlock.number + estBlocksAhead} pokriti taj datum (avg ${avg.toFixed(
          2,
        )} s/block).`,
    );
    return {
      blockNumber: latestBlock.number,
      blockTimestamp: latestBlock.timestamp,
      approximate: true,
      estimatedFutureBlock: latestBlock.number + estBlocksAhead,
    };
  }

  const genesisBlock = await provider.getBlock(1);
  if (targetTimestamp <= genesisBlock.timestamp) {
    console.log(
      '⏩ Ciljani timestamp je pre ili u vreme genezis bloka, vraćam blok #1',
    );
    return { blockNumber: 1, blockTimestamp: genesisBlock.timestamp };
  }

  let low = 1;
  let high = latestBlock.number;
  let resultBlock = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await provider.getBlock(mid);

    if (block.timestamp < targetTimestamp) {
      low = mid + 1;
    } else {
      resultBlock = block;
      high = mid - 1; // tražimo raniji kandidat
    }
  }

  if (!resultBlock)
    throw new Error('Neuspešna binarna pretraga – ovo ne bi smelo da se desi');
  return {
    blockNumber: resultBlock.number,
    blockTimestamp: resultBlock.timestamp,
  };
}

/**
 * Glavna funkcija za izvršavanje skripte.
 */
async function main() {
  console.log(`Povezujem se na Gnosis mrežu preko ${RPC_URL}...`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    const network = await provider.getNetwork();
    console.log(
      `✅ Konekcija uspešna. (Mreža: ${network.name}, ChainID: ${network.chainId})\n`,
    );

    const startBlock = await findBlockForTimestamp(provider, START_TIMESTAMP);
    console.log(
      `\n✅ PRONAĐEN POČETNI BLOK: #${startBlock.blockNumber} (Vreme: ${new Date(startBlock.blockTimestamp * 1000).toISOString()})`,
    );

    const endBlock = await findBlockForTimestamp(provider, END_TIMESTAMP);
    console.log(
      `✅ PRONAĐEN KRAJNJI BLOK:  #${endBlock.blockNumber} (Vreme: ${new Date(endBlock.blockTimestamp * 1000).toISOString()})\n`,
    );

    const endBlockDisplay = endBlock.approximate
      ? `${endBlock.estimatedFutureBlock}  (procena, poslednji realni ${endBlock.blockNumber})`
      : endBlock.blockNumber;

    console.log('---------- REZULTAT ----------');
    console.log(`Početak epohe (blok): ${startBlock.blockNumber}`);
    console.log(`Kraj epohe  (blok):   ${endBlockDisplay}`);
    console.log('------------------------------');
  } catch (error) {
    console.error('\n❌ Došlo je do greške:', error.message);
  }
}

main().catch(console.error);
