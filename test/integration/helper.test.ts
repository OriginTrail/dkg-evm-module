 /**********************************************************************
     * MIGRATION TEST 1 – after D3 has claimed all, but D1/D2 have not
     **********************************************************************/
 console.log(
    '\n🚚 MIGRATION TEST 1: Attempting to migrate rewards post-claims...',
  );

  const migratorAmount = toTRAC18(1000);

  // Set rewards for all delegators in the migrator storage
  for (const delegator of [
    accounts.delegator1,
    accounts.delegator2,
    accounts.delegator3,
  ]) {
    await contracts.rewardsMigratorStorage.setDelegatorReward(
      node1Id,
      delegator.address,
      migratorAmount,
    );
    const [stored] = await contracts.rewardsMigratorStorage.getReward(
      node1Id,
      delegator.address,
    );
    expect(stored).to.equal(migratorAmount);
  }
  console.log(
    `    ✅ Migrator storage populated with ${ethers.formatUnits(
      migratorAmount,
      18,
    )} TRAC for each delegator.`,
  );

  //  Svi delegatori još uvek imaju neclaimovane nagrade za epoch 4 -> migracija treba da REVERTUJE za sve
  console.log(
    '\n    [All] Attempting migration before svi delegatori pokriju epoch 4 – očekujemo revert',
  );

  for (const del of [
    accounts.delegator3,
    accounts.delegator1,
    accounts.delegator2,
  ]) {
    await expect(
      contracts.rewardsMigrator
        .connect(del)
        .increaseDelegatorStakeBase(node1Id, del.address),
    ).to.be.revertedWith('Claim previous epoch rewards first');
  }
  console.log('    ✅ Svi migrator pozivi revertovani kao očekivano.');

  /**********************************************************************
   * MIGRATION TEST 2 - Claim all rewards then migrate
   **********************************************************************/
  console.log(
    '\n🚚 MIGRATION TEST 2: Claiming all rewards then migrating...',
  );
  const d1LastClaimedBefore2 =
    await contracts.delegatorsInfo.getLastClaimedEpoch(
      node1Id,
      accounts.delegator1.address,
    ); // Was 2
  const lastFinalized2 = await contracts.epochStorage.lastFinalizedEpoch(1); // was 4

  // Claim pending epochs for D1
  for (
    let epoch = d1LastClaimedBefore2 + 1n;
    epoch <= lastFinalized2;
    epoch++
  ) {
    await contracts.staking
      .connect(accounts.delegator1)
      .claimDelegatorRewards(node1Id, epoch, accounts.delegator1.address);
    console.log(`    ✅ D1 claimed for epoch ${epoch}`);
  }

  // D1 should now be able to stake
  await contracts.staking
    .connect(accounts.delegator1)
    .stake(node1Id, toTRAC18(5_000));
  console.log('    ✅ D1 successfully staked 5,000 TRAC after claiming.');

  // Now D1 should be able to migrate remaining rewards
  const d1BaseBeforeMigrate2 =
    await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d1Key);
  await contracts.rewardsMigrator
    .connect(accounts.delegator1)
    .increaseDelegatorStakeBase(node1Id, accounts.delegator1.address);
  const d1BaseAfterMigrate2 =
    await contracts.stakingStorage.getDelegatorStakeBase(node1Id, d1Key);
  expect(d1BaseAfterMigrate2).to.equal(d1BaseBeforeMigrate2 + migratorAmount);
  console.log('    ✅ D1 successfully migrated rewards after claiming.');
});



📤 STEP 19: Delegator3 requests withdrawal of 10 000 TRAC
    ℹ️  current epoch = 4
    ✅ withdrawal request stored (10000.0 TRAC)
    ✅ node stake 69601.991666662504647998 → 59601.991666662504647998 TRAC
    ✅ D3 stakeBase 34321.887256251891872455 → 24321.887256251891872455 TRAC
    ✅ D3 epoch-score 0 → 0 (settled +0)
