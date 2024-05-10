import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { HubController, ParanetKnowledgeAssetsRegistry } from '../../../typechain';
import {} from '../../helpers/constants';

type deployParanetKnowledgeAssetsRegistryFixture = {
  accounts: SignerWithAddress[];
  ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;
};

describe('@v2 @unit ParanetKnowledgeAssetsRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry;

  async function deployParanetKnowledgeAssetsRegistryFixture(): Promise<deployParanetKnowledgeAssetsRegistryFixture> {
    await hre.deployments.fixture(['ParanetKnowledgeAssetsRegistry'], { keepExistingDeployments: false });
    ParanetKnowledgeAssetsRegistry = await hre.ethers.getContract<ParanetKnowledgeAssetsRegistry>(
      'ParanetKnowledgeAssetsRegistry',
    );
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ParanetKnowledgeAssetsRegistry };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ParanetKnowledgeAssetsRegistry } = await loadFixture(deployParanetKnowledgeAssetsRegistryFixture));
  });

  it('The contract is named "ParanetKnowledgeAssetsRegistry"', async () => {
    expect(await ParanetKnowledgeAssetsRegistry.name()).to.equal('ParanetKnowledgeAssetsRegistry');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await ParanetKnowledgeAssetsRegistry.version()).to.equal('2.0.0');
  });

  it('should add knowledge asset', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    const knwoledgeAssetExist = await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(assetLocation);

    expect(knwoledgeAssetExist).to.equal(true);
  });

  it('should not find knowledge asset not added', async () => {
    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    const knwoledgeAssetExist = await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(assetLocation);

    expect(knwoledgeAssetExist).to.equal(false);
  });

  it('should delete knowledge asset', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    await ParanetKnowledgeAssetsRegistry.removeKnowledgeAsset(assetLocation);

    const knwoledgeAssetExist = await ParanetKnowledgeAssetsRegistry.isParanetKnowledgeAsset(assetLocation);

    expect(knwoledgeAssetExist).to.equal(false);
  });

  it('should get knowledge asset object', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    const knowledgeAssetObject = await ParanetKnowledgeAssetsRegistry.getKnowledgeAssetObject(assetLocation);

    expect(knowledgeAssetObject.knowledgeAssetStorageContract).to.equal(accounts[150].address);
    expect(knowledgeAssetObject.tokenId).to.equal(getHashFromNumber(1));
    expect(knowledgeAssetObject.minerAddress).to.equal(accounts[151].address);
    expect(knowledgeAssetObject.paranetId).to.equal(
      hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(
          ['address', 'uint256'], // Types of the variables
          [accounts[100].address, 1], // Values to encode
        ),
      ),
    );
    expect(knowledgeAssetObject.metadata).to.equal(hre.ethers.utils.formatBytes32String(`Metadata ${1} - ${1}`));
  });

  it('should get knowledge asset locator', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    const knowledgeAssetLocator = await ParanetKnowledgeAssetsRegistry.getKnowledgeAssetLocator(assetLocation);

    expect(knowledgeAssetLocator[0]).to.equal(accounts[150].address);
    expect(knowledgeAssetLocator[1]).to.equal(getHashFromNumber(1));
  });

  it('should set knowledge asset miner address', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    await ParanetKnowledgeAssetsRegistry.setMinerAddress(assetLocation, accounts[5].address);
    const minerAddress = await ParanetKnowledgeAssetsRegistry.getMinerAddress(assetLocation);

    expect(minerAddress).to.equal(accounts[5].address);
  });
  it('should set knowledge asset paranet id', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const newParanetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 50], // Values to encode
      ),
    );

    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    await ParanetKnowledgeAssetsRegistry.setParanetId(assetLocation, newParanetId);
    const knwoledgeAssetParanetId = await ParanetKnowledgeAssetsRegistry.getParanetId(assetLocation);

    expect(knwoledgeAssetParanetId).to.equal(newParanetId);
  });

  it('should set knowledge asset metadata', async () => {
    await addknowledgeAsset(accounts, ParanetKnowledgeAssetsRegistry, 1, 1);

    const newMetadata = hre.ethers.utils.formatBytes32String(`New Metadata 1 - 1`);
    const assetLocation = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[150].address, getHashFromNumber(1)], // Values to encode
      ),
    );

    await ParanetKnowledgeAssetsRegistry.setMetadata(assetLocation, newMetadata);
    const knwoledgeAssetMetadata = await ParanetKnowledgeAssetsRegistry.getMetadata(assetLocation);

    expect(knwoledgeAssetMetadata).to.equal(newMetadata);
  });

  async function addknowledgeAsset(
    accounts: SignerWithAddress[],
    ParanetKnowledgeAssetsRegistry: ParanetKnowledgeAssetsRegistry,
    tokenId: number,
    paranetId: number,
  ) {
    const paranetIdHash = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, paranetId], // Values to encode
      ),
    );
    const tokenIdHash = getHashFromNumber(tokenId);
    const knowledgeAssetStorageContract = accounts[150].address;
    const miner = accounts[151].address;
    const metadata = hre.ethers.utils.formatBytes32String(`Metadata ${paranetId} - ${tokenId}`);

    ParanetKnowledgeAssetsRegistry.addKnowledgeAsset(
      paranetIdHash,
      knowledgeAssetStorageContract,
      tokenIdHash,
      miner,
      metadata,
    );
  }

  function getHashFromNumber(number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
  }
});
