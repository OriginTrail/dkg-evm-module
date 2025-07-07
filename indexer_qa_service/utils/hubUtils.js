const { ethers } = require('ethers');
const hubAbi = require('../abi/Hub.json');

/**
 * Fetches contract address from Hub using the correct key
 */
async function getContractAddressFromHub(provider, hubAddress, moduleName = 'StakingStorage') {
  const hub = new ethers.Contract(hubAddress, hubAbi, provider);

  try {
    const encoded = ethers.encodeBytes32String(moduleName);
    const address = await hub.getContractAddress(encoded);

    if (address && address !== ethers.ZeroAddress) {
      console.log(`✅ Found "${moduleName}" on Hub: ${address}`);
      return address;
    }

    console.warn(`❌ Hub returned zero address for "${moduleName}"`);
    return null;
  } catch (err) {
    console.error(`❌ Failed to get ${moduleName} from Hub:`, err.message);
    return null;
  }
}

module.exports = {
  getContractAddressFromHub,
};

