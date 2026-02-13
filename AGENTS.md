# AGENTS.md

Agent playbook for `dkg-evm-module`.
Use this when building, testing, linting, and editing code in this repository.

## Project snapshot

- Stack: Hardhat + TypeScript + Solidity.
- Package manager: `npm`.
- CI Node version: `20.x`.
- Solidity target: `^0.8.20`.
- Core directories:
  - `contracts/` Solidity sources.
  - `deploy/` hardhat-deploy scripts (`NNN_name.ts`).
  - `test/unit/` and `test/integration/`.
  - `tasks/`, `scripts/`, `utils/`, `deployments/`, `abi/`.

## Setup and environment

- Install deps with `npm ci` (preferred) or `npm install`.
- Required env var patterns (see `.env.example`):
  - `RPC_<NETWORK>`
  - `EVM_PRIVATE_KEY_<NETWORK>` (or mnemonic)
  - `MNEMONIC_<NETWORK>` or fallback `MNEMONIC`
  - `ACCOUNT_WITH_NEURO_URI_<NETWORK>` for Neuro funding tasks
- Common networks in config include `hardhat`, `localhost`, `neuroweb_*`, `gnosis_*`, `base_*`.

## Build, lint, and test commands

### Build and generation

- `npm run clean` — clear Hardhat cache/artifacts.
- `npm run compile` — compile using `hardhat.node.config.ts`.
- `npm run compile:size` — contract size report.
- `npm run typechain` — regenerate `typechain/`.
- `npm run export-abi` — regenerate `abi/*.json`.

### Formatting and linting

- `npm run format` / `npm run format:fix`.
- `npm run lint` / `npm run lint:fix`.
- `npm run lint:sol` / `npm run lint:sol:fix`.
- `npm run lint:ts` / `npm run lint:ts:fix`.

### Test suite commands

- `npm run test` runs `test/scripts/run-tests-with-summary.sh`.
  - This script executes each `*.test.ts` file and does not accept file arguments.
- `npm run test:unit` uses `--grep '@unit'`.
- `npm run test:integration` uses `--grep '@integration'`.
  - Only a subset of integration tests are tagged; this command is partial.
- `npm run test:parallel` for parallel test execution.
- `npm run test:trace` / `npm run test:fulltrace` for traces.
- `npm run test:gas`, `test:gas:trace`, `test:gas:fulltrace` for gas reporting.
- `npm run coverage` for solidity-coverage.

### Single test file (recommended local loop)

- Use Hardhat directly:
  - `npx hardhat test test/unit/Ask.test.ts --network hardhat`
  - `npx hardhat test test/integration/StakingRewards.test.ts --network hardhat`

### Single test case

- Filter with Mocha grep:
  - `npx hardhat test test/unit/Ask.test.ts --network hardhat --grep "stake=0"`
  - `npx hardhat test --network hardhat --grep "Operator Fee Management"`

## CI and hooks expectations

- PR CI runs: `npx hardhat typechain`, `npm run lint`, `npm run format`, `npm run test`.
- CI checks `package-lock.json` presence and dependency-lock sync.
- Pre-commit hook runs `npx lint-staged`.
- `lint-staged` applies Prettier, ESLint, and Solhint on staged files.

## TypeScript style guide

- TS runs in strict mode (`"strict": true`): keep all new code type-safe.
- Prefer `type` aliases over `interface` (`@typescript-eslint/consistent-type-definitions`).
- Avoid `any`; if unavoidable, keep it narrow and justified.
- Prefer explicit return types for exported helpers.
- Prefer `async/await` over chained `.then()`.
- For state-changing tx calls in scripts/tests, `await tx.wait()` before assertions.
- Use `bigint` for on-chain numeric values and `ethers.parseUnits`/`parseEther`.
- Prefer `const`; use `let` only when reassignment is required.

### TS imports and structure

- Follow ESLint `import/order`:
  - group order: builtin, external, internal, sibling/parent/index, object, type.
  - alphabetize within groups, case-insensitive.
  - keep blank lines between groups.
- Keep relative import paths consistent with surrounding files.
- Prefer named imports; keep default exports only where existing patterns require them.

### TS naming

- `camelCase`: functions and variables.
- `PascalCase`: types/classes; contract instances in tests often follow contract names.
- Deploy script filenames: `NNN_descriptive_name.ts`.
- Task/script filenames: snake_case (current repository pattern).

## Solidity style guide

- Standard order: SPDX, pragma, imports, declarations.
- Use named imports: `import {Foo} from "./Foo.sol";`.
- Naming conventions:
  - Contracts: `PascalCase`
  - Interfaces: `I*`
  - Libraries: `*Lib`
  - Storage contracts: `*Storage`
- Keep existing narrowed integer widths (`uint72`, `uint96`, etc.) when domain-specific.
- Private constants commonly use `_UPPER_SNAKE_CASE`.
- Use existing access-control patterns (`onlyHub`, `onlyContracts`, `onlyOwner...`).

### Solidity errors, events, gas patterns

- Prefer custom errors (often defined in `*Lib`) for new logic.
- String-based `require(...)` exists in legacy paths; avoid adding new string reverts unless needed for compatibility.
- Emit events for state and admin mutations.
- Bubble low-level call revert data when appropriate (see `Hub.forwardCall`).
- Cache repeated storage/contract reads in locals.
- Use unchecked loop increments where safe:
  - `for (uint256 i; i < arr.length; ) { ... unchecked { i++; } }`
- Preserve optimizer/viaIR assumptions; do not change compiler settings casually.

## Testing conventions

- Framework: Mocha + Chai + `@nomicfoundation/hardhat-chai-matchers`.
- Heavy fixture usage is standard:
  - `await hre.deployments.fixture([...])`
  - `await loadFixture(...)`
- Many tests call `hre.helpers.resetDeploymentsJson()` in `beforeEach`.
- Prefer precise revert checks:
  - `revertedWithCustomError(...)` for custom errors
  - `revertedWith(...)` for string-revert paths
- Test files should be named `*.test.ts`.
- Add `@unit`/`@integration` tags in `describe()` when you want grep-based scripts to include suites.

## Deploy, task, and script conventions

- Deploy scripts should export `const func: DeployFunction = async (...) => {}` and `export default func`.
- Set `func.tags` and `func.dependencies` consistently.
- Prefer `hre.helpers.deploy(...)` for deployments and Hub wiring.
- Non-development deployments are staged and persisted via helper-managed arrays and `deployments/*_contracts.json`.
- Scripts should use `main().then(...).catch(...)` and exit non-zero on failure.

## Generated artifacts and tracked outputs

- Do not hand-edit generated outputs unless explicitly required:
  - `abi/*.json`, `typechain/`, `artifacts/`, `cache/`, `coverage/`
- Treat `deployments/*.json` as operational state; update through scripts/helpers, not ad-hoc edits.
- Keep `package-lock.json` present and synchronized with dependency updates.

## Cursor and Copilot rules

- Checked rule paths:
  - `.cursorrules`
  - `.cursor/rules/`
  - `.github/copilot-instructions.md`
- No Cursor or Copilot instruction files currently exist in this repository.
- If these files are added later, treat them as high-priority repository instructions.
