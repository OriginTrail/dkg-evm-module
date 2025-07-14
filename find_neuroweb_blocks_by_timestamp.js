const { ApiPromise, WsProvider } = require('@polkadot/api');

// #################### PODACI ZA UNOS ####################

// 1. Unesi RPC WebSocket URL za NeuroWeb.
//    Javni endpoint je već unet kao podrazumevana vrednost.
const RPC_URL = 'wss://parachain-rpc.origin-trail.network';

// 2. Unesi početni i krajnji timestamp epohe (u SEKUNDAMA).
//    Timestamp konverter: https://www.epochconverter.com/
const START_TIMESTAMP = 1749772800; // Primer: 10. jul 2024. 12:00:00 PM
const END_TIMESTAMP = 1752364800; //   Primer: 12. jul 2024. 12:00:00 PM

// ########################################################

/**
 * Pronalazi prvi blok čiji je timestamp veći ili jednak ciljanom timestampu.
 * Koristi optimizovanu pretragu umesto linearne provere.
 * @param {ApiPromise} api - Aktivna konekcija ka Polkadot API-ju.
 * @param {number} targetTimestamp - Ciljani timestamp u sekundama.
 * @returns {Promise<{blockNumber: number, blockHash: string, blockTimestamp: number}>}
 */
async function findBlockForTimestamp(api, targetTimestamp) {
  const latestHeader = await api.rpc.chain.getHeader();
  let high = latestHeader.number.toNumber();
  let low = 0;
  let result = null;

  console.log(
    `\n🔍 Tražim blok za timestamp: ${targetTimestamp} (${new Date(
      targetTimestamp * 1000,
    ).toISOString()})`,
  );

  // Implementacija varijacije binarne pretrage
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mid === 0) {
      low = 1; // Preskačemo genesis blok ako je pretraga došla do njega
      continue;
    }
    const blockHash = await api.rpc.chain.getBlockHash(mid);
    const blockTimestampMs = (
      await api.query.timestamp.now.at(blockHash)
    ).toNumber();
    const blockTimestamp = Math.floor(blockTimestampMs / 1000);

    console.log(
      `   ... Proveravam blok #${mid} [vreme: ${new Date(blockTimestampMs).toISOString()}]`,
    );

    if (blockTimestamp >= targetTimestamp) {
      // Potencijalni kandidat. Čuvamo ga i tražimo da li postoji neki raniji.
      result = {
        blockNumber: mid,
        blockHash: blockHash.toHex(),
        blockTimestamp: blockTimestamp,
      };
      high = mid - 1;
    } else {
      // Blok je previše star, tražimo u novijem delu.
      low = mid + 1;
    }
  }

  if (!result) {
    throw new Error(
      `Nije bilo moguće pronaći blok za timestamp ${targetTimestamp}. Možda je previše u budućnosti.`,
    );
  }

  return result;
}

/**
 * Glavna funkcija za izvršavanje skripte.
 */
async function main() {
  console.log(`Povezujem se na NeuroWeb preko ${RPC_URL}...`);
  const wsProvider = new WsProvider(RPC_URL);
  const api = await ApiPromise.create({ provider: wsProvider });
  await api.isReady;
  console.log('✅ Konekcija uspešna.\n');

  try {
    const startBlock = await findBlockForTimestamp(api, START_TIMESTAMP);
    console.log(
      `\n✅ PRONAĐEN POČETNI BLOK: #${startBlock.blockNumber} (Vreme: ${new Date(startBlock.blockTimestamp * 1000).toISOString()})`,
    );

    const endBlock = await findBlockForTimestamp(api, END_TIMESTAMP);
    console.log(
      `✅ PRONAĐEN KRAJNJI BLOK:  #${endBlock.blockNumber} (Vreme: ${new Date(endBlock.blockTimestamp * 1000).toISOString()})\n`,
    );

    console.log('---------- REZULTAT ----------');
    console.log(`Početak epohe (blok): ${startBlock.blockNumber}`);
    console.log(`Kraj epohe (blok):    ${endBlock.blockNumber}`);
    console.log('------------------------------');
  } catch (error) {
    console.error('\n❌ Došlo je do greške:', error.message);
  } finally {
    console.log('\nZatvaram konekciju...');
    await api.disconnect();
  }
}

main().catch(console.error);
