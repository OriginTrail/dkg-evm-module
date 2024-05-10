import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre from 'hardhat';

import { HubController, ParanetKnowledgeMinersRegistry } from '../../../typechain';
import {} from '../../helpers/constants';

type deployParanetKnowledgeMinersRegistryFixture = {
  accounts: SignerWithAddress[];
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
};

describe('@v2 @unit ParanetKnowledgeMinersRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;

  async function deployParanetKnowledgeMinersRegistryFixture(): Promise<deployParanetKnowledgeMinersRegistryFixture> {
    await hre.deployments.fixture(['ParanetKnowledgeMinersRegistry'], { keepExistingDeployments: false });
    ParanetKnowledgeMinersRegistry = await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
      'ParanetKnowledgeMinersRegistry',
    );
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, ParanetKnowledgeMinersRegistry };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, ParanetKnowledgeMinersRegistry } = await loadFixture(deployParanetKnowledgeMinersRegistryFixture));
  });

  it('The contract is named "ParanetKnowledgeMinersRegistry"', async () => {
    expect(await ParanetKnowledgeMinersRegistry.name()).to.equal('ParanetKnowledgeMinersRegistry');
  });

  it('The contract is version "2.0.0"', async () => {
    expect(await ParanetKnowledgeMinersRegistry.version()).to.equal('2.0.0');
  });

  it('should create knowledge miner', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const knowledgeMinerExists = await ParanetKnowledgeMinersRegistry.knowledgeMinerExists(accounts[1].address);

    expect(knowledgeMinerExists).to.equal(true);
  });
  // it('should check knowledge miner exist with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const knowledgeMinerExists = await ParanetKnowledgeMinersRegistry['knowledgeMinerExists()']({from: accounts[0].address});

  //   expect(knowledgeMinerExists).to.equal(true);
  // });

  it('should delete knowledge miner', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.deleteKnowledgeMiner(accounts[1].address);

    const knowledgeMinerExists = await ParanetKnowledgeMinersRegistry.knowledgeMinerExists(accounts[1].address);

    expect(knowledgeMinerExists).to.equal(false);
  });

  // it('should delete knowledge miner using miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   await ParanetKnowledgeMinersRegistry.deleteKnowledgeMiner({from: accounts[1].address});

  //   const knowledgeMinerExists = ParanetKnowledgeMinersRegistry.knowledgeMinerExists(accounts[1].address);

  //   expect(knowledgeMinerExists).to.equal(false);
  // });

  it('should get knowledge miner metadata', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const knowledgeMinerMetadata = await ParanetKnowledgeMinersRegistry.getKnowledgeMinerMetadata(accounts[1].address);

    expect(knowledgeMinerMetadata.addr).to.equal(accounts[1].address);
    expect(knowledgeMinerMetadata.totalTracSpent).to.equal(0);
    expect(knowledgeMinerMetadata.totalSubmittedKnowledgeAssetsCount).to.equal(0);
    expect(knowledgeMinerMetadata.metadata).to.equal(hre.ethers.utils.formatBytes32String(`Metadata 1`));
  });

  it('should set total trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.setTotalTracSpent(accounts[1].address, 100);

    const totalTracSpent = await ParanetKnowledgeMinersRegistry.getTotalTracSpent(accounts[1].address);

    expect(totalTracSpent).to.equal(100);
  });

  // it('should set total trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   await ParanetKnowledgeMinersRegistry.setTotalTracSpent(100, {from: accounts[1].address});

  //   const totalTracSpent = ParanetKnowledgeMinersRegistry.getTotalTracSpent({from: accounts[1].address});

  //   expect(totalTracSpent).to.equal(100);
  // });

  // it('should add total trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   await ParanetKnowledgeMinersRegistry.addTotalTracSpent(100, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.addTotalTracSpent(100, {from: accounts[1].address});

  //   const totalTracSpent = await ParanetKnowledgeMinersRegistry.getTotalTracSpent({from: accounts[1].address});

  //   expect(totalTracSpent).to.equal(200);
  // });

  it('should add total srac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.addTotalTracSpent(accounts[1].address, 100);
    await ParanetKnowledgeMinersRegistry.addTotalTracSpent(accounts[1].address, 100);

    const totalTracSpent = await ParanetKnowledgeMinersRegistry.getTotalTracSpent(accounts[1].address);

    expect(totalTracSpent).to.equal(200);
  });

  it('should sub total srac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.setTotalTracSpent(accounts[1].address, 100);

    await ParanetKnowledgeMinersRegistry.subTotalTracSpent(accounts[1].address, 25);
    await ParanetKnowledgeMinersRegistry.subTotalTracSpent(accounts[1].address, 10);

    const totalTracSpent = await ParanetKnowledgeMinersRegistry.getTotalTracSpent(accounts[1].address);

    expect(totalTracSpent).to.equal(65);
  });

  // it('should sub total trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   await ParanetKnowledgeMinersRegistry.subTotalTracSpent(accounts[1].address, 25);
  //   await ParanetKnowledgeMinersRegistry.subTotalTracSpent(10, {from: accounts[1].address});

  //   const totalTracSpent = await ParanetKnowledgeMinersRegistry.getTotalTracSpent({form: accounts[1].address});

  //   expect(totalTracSpent).to.equal(65);
  // });

  it('should set cumulative trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.setCumulativeTracSpent(accounts[1].address, paranetId, 100);

    const totalTracSpent = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(accounts[1].address, paranetId);

    expect(totalTracSpent).to.equal(100);
  });

  // it('should set cumulative trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.setCumulativeTracSpent(paranetId, 100, {from: accounts[1].address});

  //   const totalTracSpent = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(paranetId, {from: accounts[1].address});

  //   expect(totalTracSpent).to.equal(100);
  // });

  it('should add cumulative trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.addCumulativeTracSpent(accounts[1].address, paranetId, 100);
    await ParanetKnowledgeMinersRegistry.addCumulativeTracSpent(accounts[1].address, paranetId, 100);

    const totalTracSpent = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(accounts[1].address, paranetId);

    expect(totalTracSpent).to.equal(200);
  });

  // it('should add cumulative trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.addCumulativeTracSpent(paranetId, 100, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.addCumulativeTracSpent(paranetId, 100, {from: accounts[1].address});

  //   const totalTracSpent = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(paranetId, {from: accounts[1].address});

  //   expect(totalTracSpent).to.equal(200);
  // });

  it('should sub cumulative trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );
    await ParanetKnowledgeMinersRegistry.setCumulativeTracSpent(accounts[1].address, paranetId, 100);

    await ParanetKnowledgeMinersRegistry.subCumulativeTracSpent(accounts[1].address, paranetId, 10);
    await ParanetKnowledgeMinersRegistry.subCumulativeTracSpent(accounts[1].address, paranetId, 25);

    const totalTracSpent = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(accounts[1].address, paranetId);

    expect(totalTracSpent).to.equal(65);
  });

  // it('should sub cumulative trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );
  //   await ParanetKnowledgeMinersRegistry.setCumulativeTracSpent(paranetId, 100, {from: accounts[1].address});

  //   await ParanetKnowledgeMinersRegistry.subCumulativeTracSpent(paranetId, 25, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.subCumulativeTracSpent(paranetId, 10, {from: accounts[1].address});

  //   const totalTracSpent = await ParanetKnowledgeMinersRegistry.getCumulativeTracSpent(paranetId, {from: accounts[1].address});

  //   expect(totalTracSpent).to.equal(65);
  // });

  it('should set unrewarded trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.setUnrewardedTracSpent(accounts[1].address, paranetId, 100);

    const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      accounts[1].address,
      paranetId,
    );

    expect(unrewardedTracSpent).to.equal(100);
  });

  // it('should set unrewarded trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.setUnrewardedTracSpent(paranetId, 100, {from: accounts[1].address});

  //   const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(paranetId, {from: accounts[1].address});

  //   expect(unrewardedTracSpent).to.equal(100);
  // });

  it('should add unrewarded trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.addUnrewardedTracSpent(accounts[1].address, paranetId, 100);
    await ParanetKnowledgeMinersRegistry.addUnrewardedTracSpent(accounts[1].address, paranetId, 100);

    const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      accounts[1].address,
      paranetId,
    );

    expect(unrewardedTracSpent).to.equal(200);
  });

  // it('should add unrewarded trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.addUnrewardedTracSpent(paranetId, 100, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.addUnrewardedTracSpent(paranetId, 100, {from: accounts[1].address});

  //   const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(paranetId, {from: accounts[1].address});

  //   expect(unrewardedTracSpent).to.equal(200);
  // });

  it('should sub unrewarded trac spent', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );
    await ParanetKnowledgeMinersRegistry.setUnrewardedTracSpent(accounts[1].address, paranetId, 100);

    await ParanetKnowledgeMinersRegistry.subUnrewardedTracSpent(accounts[1].address, paranetId, 25);
    await ParanetKnowledgeMinersRegistry.subUnrewardedTracSpent(accounts[1].address, paranetId, 10);

    const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(
      accounts[1].address,
      paranetId,
    );

    expect(unrewardedTracSpent).to.equal(65);
  });

  // it('should sub unrewarded trac spent with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );
  //   await ParanetKnowledgeMinersRegistry.setCumulativeTracSpent(paranetId, 100, {from: accounts[1].address});

  //   await ParanetKnowledgeMinersRegistry.subUnrewardedTracSpent(paranetId, 25, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.subUnrewardedTracSpent(paranetId, 10, {from: accounts[1].address});

  //   const unrewardedTracSpent = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(paranetId, {from: accounts[1].address});

  //   expect(unrewardedTracSpent).to.equal(65);
  // });

  it('should set cumulative awarded neuro', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.setCumulativeAwardedNeuro(accounts[1].address, paranetId, 100);

    const cumulativeAwardedNeuro = await ParanetKnowledgeMinersRegistry.getCumulativeAwardedNeuro(
      accounts[1].address,
      paranetId,
    );

    expect(cumulativeAwardedNeuro).to.equal(100);
  });

  // it('should set cumulative awarded neurot with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.setCumulativeAwardedNeuro(paranetId, 100, {from: accounts[1].address});

  //   const cumulativeAwardedNeuro = await ParanetKnowledgeMinersRegistry.getCumulativeAwardedNeuro(paranetId, {from: accounts[1].address});

  //   expect(cumulativeAwardedNeuro).to.equal(100);
  // });

  it('should add cumulative awarded neuro', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.addCumulativeAwardedNeuro(accounts[1].address, paranetId, 100);
    await ParanetKnowledgeMinersRegistry.addCumulativeAwardedNeuro(accounts[1].address, paranetId, 100);

    const cumulativeAwardedNeuro = await ParanetKnowledgeMinersRegistry.getCumulativeAwardedNeuro(
      accounts[1].address,
      paranetId,
    );

    expect(cumulativeAwardedNeuro).to.equal(200);
  });

  // it('should add cumulative awarded neuro with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.addCumulativeAwardedNeuro(paranetId, 100, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.addCumulativeAwardedNeuro(paranetId, 100, {from: accounts[1].address});

  //   const cumulativeAwardedNeuro = await ParanetKnowledgeMinersRegistry.getCumulativeAwardedNeuro(paranetId, {from: accounts[1].address});

  //   expect(cumulativeAwardedNeuro).to.equal(200);
  // });

  it('should sub cumulative awarded neuro ', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );
    await ParanetKnowledgeMinersRegistry.setCumulativeAwardedNeuro(accounts[1].address, paranetId, 100);

    await ParanetKnowledgeMinersRegistry.subCumulativeAwardedNeuro(accounts[1].address, paranetId, 25);
    await ParanetKnowledgeMinersRegistry.subCumulativeAwardedNeuro(accounts[1].address, paranetId, 10);

    const cumulativeAwardedNeuro = await ParanetKnowledgeMinersRegistry.getCumulativeAwardedNeuro(
      accounts[1].address,
      paranetId,
    );

    expect(cumulativeAwardedNeuro).to.equal(65);
  });

  // it('should sub cumulative awarded neuro with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );
  //   await ParanetKnowledgeMinersRegistry.setCumulativeAwardedNeuro(paranetId, 100, accounts[1].address);

  //   await ParanetKnowledgeMinersRegistry.subCumulativeAwardedNeuro(paranetId, 25, {from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.subCumulativeAwardedNeuro(paranetId, 10, {from: accounts[1].address});

  //   const cumulativeAwardedNeuro = await ParanetKnowledgeMinersRegistry.getUnrewardedTracSpent(paranetId, {from: accounts[1].address});

  //   expect(cumulativeAwardedNeuro).to.equal(65);
  // });

  it('should set total submitted knowledge assets count', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.setTotalSubmittedKnowledgeAssetsCount(accounts[1].address, 100);

    const totalSubmittedKnowledgeAssetsCount =
      await ParanetKnowledgeMinersRegistry.getTotalSubmittedKnowledgeAssetsCount(accounts[1].address);

    expect(totalSubmittedKnowledgeAssetsCount).to.equal(100);
  });

  // it('should set total submitted knowledge assets count with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.setTotalSubmittedKnowledgeAssetsCount(100, {from: accounts[1].address});

  //   const totalSubmittedKnowledgeAssetsCount = await ParanetKnowledgeMinersRegistry.getTotalSubmittedKnowledgeAssetsCount({from: accounts[1].address});

  //   expect(totalSubmittedKnowledgeAssetsCount).to.equal(100);
  // });

  it('should inc total submitted knowledge assets count', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.incrementTotalSubmittedKnowledgeAssetsCount(accounts[1].address);
    await ParanetKnowledgeMinersRegistry.incrementTotalSubmittedKnowledgeAssetsCount(accounts[1].address);

    const totalSubmittedKnowledgeAssetsCount =
      await ParanetKnowledgeMinersRegistry.getTotalSubmittedKnowledgeAssetsCount(accounts[1].address);

    expect(totalSubmittedKnowledgeAssetsCount).to.equal(2);
  });

  // it('should inc total submitted knowledge assets count with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.incrementTotalSubmittedKnowledgeAssetsCount({from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.incrementTotalSubmittedKnowledgeAssetsCount({from: accounts[1].address});

  //   const totalSubmittedKnowledgeAssetsCount = await ParanetKnowledgeMinersRegistry.getTotalSubmittedKnowledgeAssetsCount(paranetId, {from: accounts[1].address});

  //   expect(totalSubmittedKnowledgeAssetsCount).to.equal(2);
  // });

  it('should dec total submitted knowledge assets count', async () => {
    await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

    await ParanetKnowledgeMinersRegistry.setTotalSubmittedKnowledgeAssetsCount(accounts[1].address, 100);

    await ParanetKnowledgeMinersRegistry.decrementTotalSubmittedKnowledgeAssetsCount(accounts[1].address);
    await ParanetKnowledgeMinersRegistry.decrementTotalSubmittedKnowledgeAssetsCount(accounts[1].address);

    const totalSubmittedKnowledgeAssetsCount =
      await ParanetKnowledgeMinersRegistry.getTotalSubmittedKnowledgeAssetsCount(accounts[1].address);

    expect(totalSubmittedKnowledgeAssetsCount).to.equal(98);
  });

  // it('should dec total submitted knowledge assets count with miner wallet', async () => {
  //   await createknowledgeMiner(accounts, ParanetKnowledgeMinersRegistry, 1);

  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );
  //   await ParanetKnowledgeMinersRegistry.setTotalSubmittedKnowledgeAssetsCount(paranetId, 100, accounts[1].address);

  //   await ParanetKnowledgeMinersRegistry.decrementTotalSubmittedKnowledgeAssetsCount({from: accounts[1].address});
  //   await ParanetKnowledgeMinersRegistry.decrementTotalSubmittedKnowledgeAssetsCount({from: accounts[1].address});

  //   const totalSubmittedKnowledgeAssetsCount = await ParanetKnowledgeMinersRegistry.getTotalSubmittedKnowledgeAssetsCount(paranetId, {from: accounts[1].address});

  //   expect(totalSubmittedKnowledgeAssetsCount).to.equal(98);
  // });

  it('should add submitted knowledge asset', async () => {
    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(1),
    );
    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(2),
    );
    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(3),
    );

    const submittedKnowledgeAssets = await ParanetKnowledgeMinersRegistry.getSubmittedKnowledgeAssets(
      accounts[1].address,
      paranetId,
    );

    expect(submittedKnowledgeAssets.length).to.equal(3);
    expect(submittedKnowledgeAssets[0]).to.equal(getHashFromNumber(1));
    expect(submittedKnowledgeAssets[1]).to.equal(getHashFromNumber(2));
    expect(submittedKnowledgeAssets[2]).to.equal(getHashFromNumber(3));
  });

  // it('should add submitted knowledge assets with miner walle', async () => {
  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(1), { from: accounts[1].address });
  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(2), { from: accounts[1].address });
  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(3), { from: accounts[1].address });

  //   const submittedKnowledgeAssets = await ParanetKnowledgeMinersRegistry.getSubmittedKnowledgeAssets(paranetId, { from: accounts[1].address });

  //   expect(submittedKnowledgeAssets.length).to.equal(3);
  //   expect(submittedKnowledgeAssets[0]).to.equal(getHashFromNumber(1));
  //   expect(submittedKnowledgeAssets[1]).to.equal(getHashFromNumber(2));
  //   expect(submittedKnowledgeAssets[2]).to.equal(getHashFromNumber(3));
  // });

  // it('should remove submitted knowledge assets with miner wallet', async () => {
  //   const paranetId = hre.ethers.utils.keccak256(
  //     hre.ethers.utils.solidityPack(
  //       ['address', 'uint256'], // Types of the variables
  //       [accounts[100].address, 123], // Values to encode
  //     ),
  //   );

  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(1), { from: accounts[1].address });
  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(2), { from: accounts[1].address });
  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(3), { from: accounts[1].address });
  //   await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(paranetId, getHashFromNumber(4), { from: accounts[1].address });

  //   await ParanetKnowledgeMinersRegistry.removeSubmittedKnowledgeAsset(paranetId, getHashFromNumber(2), { from: accounts[1].address });

  //   const submittedKnowledgeAssets = await ParanetKnowledgeMinersRegistry.getSubmittedKnowledgeAssets(paranetId, { from: accounts[1].address });

  //   expect(submittedKnowledgeAssets.length).to.equal(3);
  //   expect(submittedKnowledgeAssets[0]).to.equal(getHashFromNumber(1));
  //   expect(submittedKnowledgeAssets[1]).to.equal(getHashFromNumber(3));
  //   expect(submittedKnowledgeAssets[2]).to.equal(getHashFromNumber(4));
  // });

  it('should remove submitted knowledge assets', async () => {
    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(1),
    );
    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(2),
    );
    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(3),
    );
    await ParanetKnowledgeMinersRegistry.addSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(4),
    );

    await ParanetKnowledgeMinersRegistry.removeSubmittedKnowledgeAsset(
      accounts[1].address,
      paranetId,
      getHashFromNumber(2),
    );

    const submittedKnowledgeAssets = await ParanetKnowledgeMinersRegistry.getSubmittedKnowledgeAssets(
      accounts[1].address,
      paranetId,
    );

    expect(submittedKnowledgeAssets.length).to.equal(3);
    expect(submittedKnowledgeAssets[0]).to.equal(getHashFromNumber(1));
    expect(submittedKnowledgeAssets[1]).to.equal(getHashFromNumber(4));
    expect(submittedKnowledgeAssets[2]).to.equal(getHashFromNumber(3));
  });

  async function createknowledgeMiner(
    accounts: SignerWithAddress[],
    ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry,
    number: number,
  ) {
    const metadata = hre.ethers.utils.formatBytes32String(`Metadata ${number}`);

    await ParanetKnowledgeMinersRegistry.registerKnowledgeMiner(accounts[number].address, metadata);
  }

  function getHashFromNumber(number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
  }
});
