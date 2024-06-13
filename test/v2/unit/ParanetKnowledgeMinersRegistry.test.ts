import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { SignerWithAddress } from 'hardhat-deploy-ethers/signers';

import { HubV2, HubController, ParanetKnowledgeMinersRegistry } from '../../../typechain';

type deployParanetKnowledgeMinersRegistryFixture = {
  accounts: SignerWithAddress[];
  HubV2: HubV2;
  ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
};

describe('@v2 @unit ParanetKnowledgeMinersRegistry contract', function () {
  let accounts: SignerWithAddress[];
  let ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry;
  let HubV2: HubV2;

  async function deployParanetKnowledgeMinersRegistryFixture(): Promise<deployParanetKnowledgeMinersRegistryFixture> {
    await hre.deployments.fixture(['ParanetKnowledgeMinersRegistry', 'HubV2', 'ContentAssetStorage'], {
      keepExistingDeployments: false,
    });
    ParanetKnowledgeMinersRegistry = await hre.ethers.getContract<ParanetKnowledgeMinersRegistry>(
      'ParanetKnowledgeMinersRegistry',
    );
    HubV2 = await hre.ethers.getContract<HubV2>('Hub');
    const HubController = await hre.ethers.getContract<HubController>('HubController');
    accounts = await hre.ethers.getSigners();
    await HubController.setContractAddress('HubOwner', accounts[0].address);

    return { accounts, HubV2, ParanetKnowledgeMinersRegistry };
  }

  beforeEach(async () => {
    hre.helpers.resetDeploymentsJson();
    ({ accounts, HubV2, ParanetKnowledgeMinersRegistry } = await loadFixture(
      deployParanetKnowledgeMinersRegistryFixture,
    ));
  });

  it('The contract is named "ParanetKnowledgeMinersRegistry"', async () => {
    expect(await ParanetKnowledgeMinersRegistry.name()).to.equal('ParanetKnowledgeMinersRegistry');
  });

  it('The contract is version "2.0.1"', async () => {
    expect(await ParanetKnowledgeMinersRegistry.version()).to.equal('2.0.1');
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

    const submittedKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getSubmittedKnowledgeAssets(address,bytes32)'
    ](accounts[1].address, paranetId);

    expect(submittedKnowledgeAssets.length).to.equal(3);
    expect(submittedKnowledgeAssets[0]).to.equal(getHashFromNumber(1));
    expect(submittedKnowledgeAssets[1]).to.equal(getHashFromNumber(2));
    expect(submittedKnowledgeAssets[2]).to.equal(getHashFromNumber(3));
  });

  // it('should add submitted knowledge assets with miner wallet', async () => {
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

    const submittedKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getSubmittedKnowledgeAssets(address,bytes32)'
    ](accounts[1].address, paranetId);

    expect(submittedKnowledgeAssets.length).to.equal(3);
    expect(submittedKnowledgeAssets[0]).to.equal(getHashFromNumber(1));
    expect(submittedKnowledgeAssets[1]).to.equal(getHashFromNumber(4));
    expect(submittedKnowledgeAssets[2]).to.equal(getHashFromNumber(3));
  });

  it('should update token amount when knowledge asset updated', async () => {
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

    const KaStorageContract = await HubV2.getAssetStorageAddress('ContentAssetStorage');
    await ParanetKnowledgeMinersRegistry.addUpdatingKnowledgeAssetState(
      accounts[1].address,
      paranetId,
      KaStorageContract,
      getHashFromNumber(1), // token id
      getHashFromNumber(12345), // assertion id
      100, // update token amount
    );

    const updatingKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getUpdatingKnowledgeAssetStates(address,bytes32)'
    ](accounts[1].address, paranetId);

    expect(updatingKnowledgeAssets.length).to.equal(1);
    expect(updatingKnowledgeAssets[0][1]).to.equal(getHashFromNumber(1));
    expect(updatingKnowledgeAssets[0][2]).to.equal(getHashFromNumber(12345));
    expect(updatingKnowledgeAssets[0][3]).to.equal(100);
  });

  it('should update 3 KAs token amounts and get first, second and third separately', async () => {
    const paranetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['address', 'uint256'], // Types of the variables
        [accounts[100].address, 123], // Values to encode
      ),
    );

    // Create 3 KA and add to Paranet
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

    // Update Token amount for 3 KAs
    const KaStorageContract = await HubV2.getAssetStorageAddress('ContentAssetStorage');
    await ParanetKnowledgeMinersRegistry.addUpdatingKnowledgeAssetState(
      accounts[1].address,
      paranetId,
      KaStorageContract,
      getHashFromNumber(1),
      getHashFromNumber(12345),
      100,
    );
    await ParanetKnowledgeMinersRegistry.addUpdatingKnowledgeAssetState(
      accounts[1].address,
      paranetId,
      KaStorageContract,
      getHashFromNumber(2),
      getHashFromNumber(12346),
      150,
    );
    await ParanetKnowledgeMinersRegistry.addUpdatingKnowledgeAssetState(
      accounts[1].address,
      paranetId,
      KaStorageContract,
      getHashFromNumber(3),
      getHashFromNumber(12347),
      200,
    );

    let updatingKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getUpdatingKnowledgeAssetStates(address,bytes32,uint256,uint256)'
    ](accounts[1].address, paranetId, 0, 2);

    expect(updatingKnowledgeAssets.length).to.equal(2);

    updatingKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getUpdatingKnowledgeAssetStates(address,bytes32,uint256,uint256)'
    ](accounts[1].address, paranetId, 0, 1);

    expect(updatingKnowledgeAssets.length).to.equal(1);

    updatingKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getUpdatingKnowledgeAssetStates(address,bytes32,uint256,uint256)'
    ](accounts[1].address, paranetId, 1, 2);

    expect(updatingKnowledgeAssets.length).to.equal(1);

    updatingKnowledgeAssets = await ParanetKnowledgeMinersRegistry[
      'getUpdatingKnowledgeAssetStates(address,bytes32,uint256,uint256)'
    ](accounts[1].address, paranetId, 2, 3);

    expect(updatingKnowledgeAssets.length).to.equal(1);
  });

  async function createknowledgeMiner(
    accounts: SignerWithAddress[],
    ParanetKnowledgeMinersRegistry: ParanetKnowledgeMinersRegistry,
    number: number,
  ) {
    await ParanetKnowledgeMinersRegistry.registerKnowledgeMiner(accounts[number].address);
  }

  function getHashFromNumber(number: number) {
    return hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['uint256'], [number]));
  }
});
