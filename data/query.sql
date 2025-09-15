-- GNOSIS MAINNET epoch 8 end
SELECT DISTINCT
       transaction_hash,
       block_number,
       delegator_key
FROM (
    SELECT transaction_hash, block_number, delegator_key
    FROM delegator_base_stake_updated

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM identity_created

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM node_ask_updated

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM operator_fee_added

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM profile_created

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM delegator_withdrawal_request_deleted
) AS combined
WHERE block_number >= 37746315
  AND block_number <  42060171
ORDER BY block_number;


-- BASE MAINNET epoch 8 end
SELECT DISTINCT
       transaction_hash,
       block_number,
       delegator_key
FROM (
    SELECT transaction_hash, block_number, delegator_key
    FROM delegator_base_stake_updated

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM identity_created

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM node_ask_updated

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM operator_fee_added

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM profile_created

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM delegator_withdrawal_request_deleted
) AS combined
WHERE block_number >= 24277327
  AND block_number <  35379727
ORDER BY block_number;


-- NEUROWEB MAINNET epoch 8 end
SELECT DISTINCT
       transaction_hash,
       block_number,
       delegator_key
FROM (
    SELECT transaction_hash, block_number, delegator_key
    FROM delegator_base_stake_updated

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM identity_created

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM node_ask_updated

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM operator_fee_added

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM profile_created

    UNION ALL

    SELECT transaction_hash, block_number, NULL AS delegator_key
    FROM delegator_withdrawal_request_deleted
) AS combined
WHERE block_number >= 7266256
  AND block_number < 10906621
ORDER BY block_number;