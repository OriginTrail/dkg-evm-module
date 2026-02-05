# Publishing Factor Accumulation: First-Iteration Design Proposal

> **Note:** This proposal has been superseded by [RFC-26: Stake-Adjusted, Multi-Epoch Node Score Formula](https://github.com/OriginTrail/OT-RFC-repository/tree/main/RFCs/OT-RFC-26_Stake_Adjusted_Multi_Epoch_Node_Score_Formula). RFC-26 implements a multi-epoch publishing factor using a rolling 4-epoch window approach instead of EMA. This document is retained for historical reference.

## 1. Summary of Proposed Change

This proposal introduces **exponential moving average (EMA) accumulation** for the publishing factor, allowing nodes to build publishing reputation across epochs. The publishing factor will now incorporate both current-epoch activity and a weighted historical average, creating persistence and memory that rewards sustained knowledge publishing while maintaining responsiveness to recent activity. This change strengthens incentives for long-term aligned behavior without requiring complex reputation systems or significant storage overhead.

**Why this improves alignment immediately:**
- Nodes that consistently publish knowledge across multiple epochs gain a persistent advantage
- One-off publishing bursts no longer provide the same relative benefit as sustained activity
- The system maintains responsiveness to current activity (50% weight) while building memory (50% weight)
- Simple, auditable formula that can be implemented and tested within weeks

---

## 2. Updated Reward Formula

### Current Formula (Per Epoch Only)

```
nodeStakeFactor = 2 * (nodeStake / maxStake)²
nodeAskFactor = stakeRatio * ((upperBound - ask) / (upperBound - lowerBound))²
nodePublishingFactor_current = nodeStakeFactor * (currentEpochPub / maxCurrentEpochPub)

nodeScore = nodeStakeFactor + nodeAskFactor / 10 + nodePublishingFactor_current * 15
```

### Proposed Formula (With Accumulation)

```
nodeStakeFactor = 2 * (nodeStake / maxStake)²
nodeAskFactor = stakeRatio * ((upperBound - ask) / (upperBound - lowerBound))²

// NEW: Accumulated publishing factor using EMA
nodePublishingFactor_accumulated = nodeStakeFactor * (
    (0.5 * currentEpochPubRatio) + (0.5 * previousAccumulatedPubRatio)
)

nodeScore = nodeStakeFactor + nodeAskFactor / 10 + nodePublishingFactor_accumulated * 15
```

Where:
- `currentEpochPubRatio = currentEpochPub / maxCurrentEpochPub` (normalized 0-1)
- `previousAccumulatedPubRatio` = stored accumulated ratio from previous epoch (normalized 0-1)
- The 0.5/0.5 split gives equal weight to current activity and historical performance

### Detailed Calculation Steps

**Step 1: Calculate current epoch publishing ratio**
```solidity
uint256 currentEpochPub = epochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId);
uint256 maxCurrentEpochPub = epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue();
uint256 currentEpochPubRatio18 = maxCurrentEpochPub > 0 
    ? (currentEpochPub * SCALE18) / maxCurrentEpochPub 
    : 0;
```

**Step 2: Retrieve previous accumulated ratio**
```solidity
uint256 previousAccumulatedPubRatio18 = epochStorage.getNodeAccumulatedPublishingRatio(identityId);
```

**Step 3: Calculate new accumulated ratio (EMA)**
```solidity
// EMA: 50% current + 50% previous
uint256 newAccumulatedPubRatio18 = (currentEpochPubRatio18 / 2) + (previousAccumulatedPubRatio18 / 2);
```

**Step 4: Use accumulated ratio in publishing factor**
```solidity
uint256 nodePublishingFactor18 = (nodeStakeFactor18 * newAccumulatedPubRatio18) / SCALE18;
```

**Step 5: Update stored accumulated ratio for next epoch**
```solidity
epochStorage.setNodeAccumulatedPublishingRatio(identityId, newAccumulatedPubRatio18);
```

---

## 3. Smart Contract–Level Changes

### 3.1 New State Variables

**File:** `contracts/storage/EpochStorage.sol`

Add two new mappings:
```solidity
// Maps node identityId to accumulated publishing ratio (scaled by 1e18)
mapping(uint72 => uint256) public nodeAccumulatedPublishingRatio;

// Maps node identityId to last epoch when accumulated ratio was updated
mapping(uint72 => uint256) public nodeAccumulatedPublishingRatioLastUpdatedEpoch;
```

**Storage Impact:**
- 2 new mappings: `mapping(uint72 => uint256)` each
- Per-node storage: 64 bytes (2 uint256 slots) per node
- Total overhead: Minimal - only active nodes need entries
- Gas cost per write: ~40,000 gas (2 SSTORE operations, but only once per epoch)

### 3.2 Modified Calculations

**File:** `contracts/RandomSampling.sol`

**Function:** `calculateNodeScore(uint72 identityId)`

**Changes:**
1. Replace current epoch-only publishing factor calculation (lines 443-451)
2. Add logic to retrieve and update accumulated publishing ratio
3. Calculate EMA-based publishing factor

**Modified Code Block:**

**Implementation Approach:**

Keep `calculateNodeScore` as `view`, update accumulated ratio lazily in `submitProof` when entering a new epoch:

```solidity
// In submitProof(), before calculateNodeScore() call (around line 218):
uint256 epoch = chronos.getCurrentEpoch();

// Lazy update: finalize previous epoch's accumulated ratio if needed
uint256 lastUpdatedEpoch = epochStorage.getNodeAccumulatedPublishingRatioLastUpdatedEpoch(identityId);
if (lastUpdatedEpoch < epoch - 1) {
    // Finalize previous epoch's accumulated ratio using final publishing values
    _finalizeAccumulatedPublishingRatio(identityId, epoch - 1);
}

// Calculate score using accumulated ratio from previous epoch
uint256 score18 = calculateNodeScore(identityId);
```

Add helper function to `RandomSampling.sol`:
```solidity
function _finalizeAccumulatedPublishingRatio(uint72 identityId, uint256 finalizedEpoch) internal {
    uint256 maxNodePub = uint256(epochStorage.getEpochNodeMaxProducedKnowledgeValue(finalizedEpoch));
    if (maxNodePub == 0) {
        // No publishing in this epoch, decay accumulated ratio by 50%
        uint256 previousRatio = epochStorage.getNodeAccumulatedPublishingRatio(identityId);
        uint256 decayedRatio = previousRatio / 2; // 50% decay
        epochStorage.setNodeAccumulatedPublishingRatio(identityId, decayedRatio);
        epochStorage.setNodeAccumulatedPublishingRatioLastUpdatedEpoch(identityId, finalizedEpoch);
        return;
    }
    
    uint256 nodePub = uint256(epochStorage.getNodeEpochProducedKnowledgeValue(identityId, finalizedEpoch));
    uint256 currentEpochPubRatio18 = (nodePub * SCALE18) / maxNodePub;
    
    uint256 previousAccumulatedPubRatio18 = epochStorage.getNodeAccumulatedPublishingRatio(identityId);
    uint256 newAccumulatedPubRatio18 = (currentEpochPubRatio18 / 2) + (previousAccumulatedPubRatio18 / 2);
    
    epochStorage.setNodeAccumulatedPublishingRatio(identityId, newAccumulatedPubRatio18);
    epochStorage.setNodeAccumulatedPublishingRatioLastUpdatedEpoch(identityId, finalizedEpoch);
}
```

**Modified `calculateNodeScore` (uses accumulated ratio from previous epoch):**
```solidity
// 3. Node publishing factor calculation (UPDATED with accumulation)
uint256 maxNodePub = uint256(epochStorage.getCurrentEpochNodeMaxProducedKnowledgeValue());
uint256 nodePublishingFactor18 = 0;

if (maxNodePub > 0) {
    // Use accumulated ratio from previous epoch (stable, finalized value)
    uint256 accumulatedPubRatio18 = epochStorage.getNodeAccumulatedPublishingRatio(identityId);
    
    // Blend with current epoch's publishing for real-time responsiveness
    uint256 nodePub = uint256(epochStorage.getNodeCurrentEpochProducedKnowledgeValue(identityId));
    uint256 currentEpochPubRatio18 = (nodePub * SCALE18) / maxNodePub;
    
    // Use 50% current + 50% accumulated for balanced responsiveness
    uint256 blendedRatio18 = (currentEpochPubRatio18 / 2) + (accumulatedPubRatio18 / 2);
    nodePublishingFactor18 = (nodeStakeFactor18 * blendedRatio18) / SCALE18;
}
```

**Note:** 
- Accumulated ratio is finalized using **previous epoch's** final publishing values (stable, not in-progress)
- Current epoch's publishing is blended in for real-time responsiveness
- Update happens lazily on first proof submission of new epoch (efficient)
- If a node doesn't submit proofs, their accumulated ratio is not updated (acceptable - they're not earning score anyway)

### 3.3 New Storage Functions

**File:** `contracts/storage/EpochStorage.sol`

Add two new functions:

```solidity
/**
 * @dev Returns the accumulated publishing ratio for a node (scaled by 1e18)
 * @param identityId Node identity ID
 * @return Accumulated publishing ratio, scaled by 1e18 (0-1e18 range)
 */
function getNodeAccumulatedPublishingRatio(uint72 identityId) external view returns (uint256) {
    return nodeAccumulatedPublishingRatio[identityId];
}

/**
 * @dev Sets the accumulated publishing ratio for a node (scaled by 1e18)
 * Can only be called by contracts registered in the Hub
 * @param identityId Node identity ID
 * @param ratio Accumulated publishing ratio, scaled by 1e18
 */
function setNodeAccumulatedPublishingRatio(uint72 identityId, uint256 ratio) external onlyContracts {
    nodeAccumulatedPublishingRatio[identityId] = ratio;
    emit NodeAccumulatedPublishingRatioSet(identityId, ratio);
}

/**
 * @dev Returns the last epoch when accumulated publishing ratio was updated for a node
 * @param identityId Node identity ID
 * @return Last updated epoch number
 */
function getNodeAccumulatedPublishingRatioLastUpdatedEpoch(uint72 identityId) external view returns (uint256) {
    return nodeAccumulatedPublishingRatioLastUpdatedEpoch[identityId];
}

/**
 * @dev Sets the last epoch when accumulated publishing ratio was updated for a node
 * Can only be called by contracts registered in the Hub
 * @param identityId Node identity ID
 * @param epoch Epoch number
 */
function setNodeAccumulatedPublishingRatioLastUpdatedEpoch(uint72 identityId, uint256 epoch) external onlyContracts {
    nodeAccumulatedPublishingRatioLastUpdatedEpoch[identityId] = epoch;
}
```

Add event:
```solidity
event NodeAccumulatedPublishingRatioSet(uint72 indexed identityId, uint256 ratio);
```

### 3.4 Gas/Storage Impact Analysis

**Per `calculateNodeScore` call:**
- **Read operations:** +1 SLOAD (~2,100 gas) to read accumulated ratio
- **Total additional gas for calculation:** ~2,100 gas per proof submission

**Per epoch (first proof submission):**
- **Read operations:** +2 SLOAD (~4,200 gas) to read previous ratio and last updated epoch
- **Write operations:** +2 SSTORE (~40,000 gas) to update accumulated ratio and last updated epoch
- **Total additional gas:** ~44,200 gas once per epoch per node

**Storage overhead:**
- Per node: 32 bytes (1 uint256 slot)
- For 1,000 active nodes: ~32 KB total storage
- Acceptable for production deployment

**Migration considerations:**
- Existing nodes start with `nodeAccumulatedPublishingRatio = 0`
- First epoch after deployment: nodes build from zero (no historical data)
- Fair for all nodes - everyone starts fresh

---

## 4. Behavioral Impact Analysis

### 4.1 What Behavior This Rewards More

**Sustained Publishing:**
- Nodes that publish knowledge consistently across multiple epochs gain a persistent advantage
- A node publishing 50% of max for 10 epochs will have accumulated ratio ≈ 50%
- A node publishing 100% for 1 epoch then 0% for 9 epochs will have accumulated ratio ≈ 10%

**Long-term Alignment:**
- Nodes must maintain publishing activity to preserve accumulated ratio
- Inactivity causes accumulated ratio to decay (50% weight on current activity)
- Rewards operators who treat knowledge publishing as a core service, not a one-time optimization

**Gradual Build-up:**
- New nodes can build reputation over time
- No need to "burst" publish to compete
- Lower barrier to entry for new operators

### 4.2 What Behavior It Discourages

**Epoch Gaming:**
- One-off publishing bursts become less effective
- Nodes cannot "game" a single epoch and coast on reputation
- Must maintain activity to preserve accumulated advantage

**Intermittent Participation:**
- Nodes that publish sporadically lose accumulated ratio quickly
- 50% decay rate means 2 epochs of inactivity reduces accumulated ratio by 75%
- Encourages consistent participation

### 4.3 Impact on Different Node Types

**Small vs Large Nodes:**
- **Small nodes:** Can build reputation over time through consistent publishing
- **Large nodes:** Still benefit from stake factor, but must also maintain publishing to maximize rewards
- **Fairness:** Publishing factor is normalized (ratio-based), so small nodes can compete on publishing activity

**Short-term vs Long-term Operators:**
- **Short-term:** Accumulated ratio decays quickly (50% per epoch), so short-term operators must maintain activity
- **Long-term:** Builds persistent advantage that compounds over time
- **Alignment:** Rewards long-term commitment while remaining responsive to current activity

**New vs Established Nodes:**
- **New nodes:** Start with zero accumulated ratio, but can build it over 3-5 epochs
- **Established nodes:** Maintain advantage if they continue publishing, but cannot rest on laurels
- **Fairness:** Everyone starts from zero after deployment (clean slate)

---

## 5. Edge Cases & Abuse Resistance

### 5.1 Epoch Gaming

**Scenario:** Node publishes massive amount in one epoch, then stops.

**Mitigation:**
- EMA with 50% decay means one burst provides only temporary benefit
- After 2 epochs of inactivity, accumulated ratio drops to 25% of peak
- After 4 epochs, drops to ~6% of peak
- **Conclusion:** Gaming is ineffective - must maintain activity

### 5.2 Publishing Spam

**Scenario:** Node publishes low-value knowledge repeatedly to maintain ratio.

**Mitigation:**
- Publishing factor uses `tokenAmount` (value-based), not count-based
- Low-value publishing provides minimal benefit
- Ratio is normalized against max node publishing, so spam doesn't help relative position
- **Conclusion:** Spam is economically inefficient

### 5.3 Stake Concentration Effects

**Scenario:** Large staked nodes dominate publishing factor.

**Mitigation:**
- Publishing factor is normalized (ratio-based), not absolute
- Small nodes can achieve high ratios through consistent publishing
- Stake factor and publishing factor are separate - publishing provides independent signal
- **Conclusion:** No additional concentration risk introduced

### 5.4 Reset or Decay Behavior

**Decay Rate:**
- 50% weight on current epoch means 50% decay per epoch of inactivity
- Formula: `newRatio = 0.5 * currentRatio + 0.5 * 0` (if inactive)
- After N epochs of inactivity: `ratio = 0.5^N * initialRatio`
- **Practical impact:** 3 epochs of inactivity = 12.5% of original ratio

**Reset Scenarios:**
- New nodes: Start at 0 (fair)
- After deployment: All nodes start at 0 (clean slate)
- No manual reset needed - decay handles inactive nodes

**Edge Case: Max Publishing Changes:**
- If max publishing drops dramatically, ratios may temporarily spike
- EMA smooths this effect over time
- **Mitigation:** Ratio normalization prevents absolute value issues

---

## 6. First-Iteration Scope Boundary

### 6.1 What Is Intentionally Not Solved Yet

**Complex Reputation Systems:**
- No time-weighted scoring (all epochs weighted equally in EMA)
- No quality metrics beyond token value
- No peer validation or reputation signals
- **Rationale:** Keep it simple, auditable, and implementable quickly

**Variable Decay Rates:**
- Fixed 50/50 split (not configurable)
- No adaptive decay based on activity level
- **Rationale:** Simplicity and predictability

**Multi-Dimensional Publishing Metrics:**
- Only uses token value, not knowledge quality, diversity, or utility
- **Rationale:** Token value is already tracked and provides economic signal

**Historical Lookback Windows:**
- EMA implicitly includes all history (infinite window with exponential decay)
- No explicit N-epoch lookback window
- **Rationale:** EMA is mathematically equivalent to infinite window with exponential weights

**Publishing Factor Weight Tuning:**
- Publishing factor multiplier remains at 15x (unchanged)
- No dynamic adjustment based on network state
- **Rationale:** Preserve existing balance, focus on accumulation mechanism

### 6.2 What Is Deferred to Later Iterations

**Sophisticated Decay Curves:**
- Future: Configurable decay rates, adaptive decay, or time-based decay
- **Deferred because:** Requires parameter governance and adds complexity

**Quality-Based Publishing Metrics:**
- Future: Incorporate knowledge quality scores, diversity metrics, or utility measures
- **Deferred because:** Requires off-chain infrastructure or complex on-chain validation

**Publishing Factor Multiplier Tuning:**
- Future: Dynamic adjustment of the 15x multiplier based on network publishing activity
- **Deferred because:** Requires careful analysis of incentive balance and governance

**Cross-Epoch Publishing Patterns:**
- Future: Reward consistent publishing schedules, penalize irregular patterns
- **Deferred because:** Adds complexity without clear benefit in first iteration

**Migration from Old System:**
- Future: One-time migration to initialize accumulated ratios from historical data
- **Deferred because:** Clean slate is fairer and simpler for first iteration

### 6.3 Clear Rationale for Deferral

**Philosophy:**
- Ship meaningful improvement fast
- Validate concept with simple, auditable mechanism
- Iterate based on real-world behavior
- Avoid over-engineering before understanding usage patterns

**Risk Management:**
- Simple mechanisms are easier to audit and test
- Fewer edge cases and failure modes
- Faster deployment reduces time-to-value
- Can always add sophistication later if needed

**Success Criteria for First Iteration:**
- ✅ Publishing factor accumulates across epochs
- ✅ Sustained publishing is rewarded more than bursts
- ✅ System remains responsive to current activity
- ✅ Minimal storage and gas overhead
- ✅ Safe to deploy in production

---

## 7. Implementation Checklist

### 7.1 Contract Changes

- [ ] Add `nodeAccumulatedPublishingRatio` mapping to `EpochStorage.sol`
- [ ] Add `getNodeAccumulatedPublishingRatio()` view function
- [ ] Add `setNodeAccumulatedPublishingRatio()` setter function
- [ ] Add `NodeAccumulatedPublishingRatioSet` event
- [ ] Update `calculateNodeScore()` in `RandomSampling.sol` to use EMA
- [ ] Update function documentation/comments

### 7.2 Testing

- [ ] Unit tests for EMA calculation logic
- [ ] Integration tests for accumulated ratio persistence
- [ ] Edge case tests (new nodes, inactive nodes, max changes)
- [ ] Gas cost benchmarks
- [ ] Regression tests for existing reward calculations

### 7.3 Migration & Deployment

- [ ] Verify all nodes start with zero accumulated ratio (no migration needed)
- [ ] Deploy updated contracts
- [ ] Monitor first few epochs for expected behavior
- [ ] Document behavior changes for node operators

---

## 8. Alternative Designs Considered

### 8.1 Simple Sum (Rejected)

**Design:** Sum publishing values over last N epochs.

**Why rejected:**
- Requires storing per-epoch values (higher storage)
- Needs explicit lookback window management
- Less elegant than EMA

### 8.2 Linear Weighted Average (Rejected)

**Design:** Weight recent epochs more, older epochs less.

**Why rejected:**
- More complex than EMA
- Requires storing multiple epoch values
- EMA provides similar effect with single value

### 8.3 Configurable Decay Rate (Deferred)

**Design:** Make 50/50 split configurable via governance.

**Why deferred:**
- Adds complexity for first iteration
- Fixed 50/50 is a good default
- Can add configurability in future if needed

---

## 9. Conclusion

This proposal provides a **minimal, implementable, and effective** solution for accumulating publishing factor across epochs. The EMA approach:

- ✅ Introduces persistence and memory with minimal storage overhead
- ✅ Rewards sustained publishing while remaining responsive to current activity
- ✅ Is simple, auditable, and safe to deploy
- ✅ Can be implemented within weeks
- ✅ Maintains compatibility with existing staking and reward logic

The 50/50 EMA split provides a balanced approach that rewards long-term alignment without sacrificing responsiveness. Nodes that consistently publish knowledge will build a persistent advantage, while the system remains fair for new entrants and responsive to current activity.

**Next Steps:**
1. Review and approval
2. Implementation and testing
3. Audit (if required)
4. Deployment and monitoring

