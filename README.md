# Worldland Rental Smart Contracts

**Deterministic settlement for GPU rental marketplace on BNB Chain**

Smart contracts for Worldland's decentralized GPU rental platform, implementing timestamp-based deterministic settlement: users pay only for what they use, with zero-dispute resolution through blockchain timestamps.

## Core Value Proposition

**"사용한 만큼만 정확하게 정산"** - Pay exactly for what you use.

- Start/Stop timestamps recorded on-chain (block.timestamp)
- Deterministic settlement: `cost = duration × pricePerSecond`
- No oracles, no off-chain dependencies
- Dual authorization: user OR provider can stop rental

## Architecture

```
WorldlandRental.sol
├── Deposit/Withdraw (ERC20)
│   ├── deposit(amount) - User deposits payment tokens
│   └── withdraw(amount) - User/Provider withdraws balance
├── Rental Operations
│   ├── startRental(provider, pricePerSecond) → rentalId
│   └── stopRental(rentalId) → cost
└── Security
    ├── ReentrancyGuard (OpenZeppelin)
    ├── SafeERC20 (handles non-compliant tokens)
    └── Checks-Effects-Interactions pattern
```

## Installation

```bash
npm install
```

### Prerequisites

- Node.js >= 18.0.0
- Hardhat 2.22.0+
- OpenZeppelin Contracts 5.x

## Usage

### Compile Contracts

```bash
npx hardhat compile
```

This generates:
- Compiled artifacts in `artifacts/`
- TypeChain types in `typechain-types/`

### Run Tests

```bash
# All tests (41 tests)
npx hardhat test

# With gas reporting
REPORT_GAS=true npx hardhat test

# Specific test file
npx hardhat test test/WorldlandRental.deposit.test.ts
npx hardhat test test/WorldlandRental.rental.test.ts
npx hardhat test test/WorldlandRental.integration.test.ts
```

**Test Coverage:**
- 11 deposit/withdraw tests
- 22 rental operation tests
- 8 integration tests (end-to-end flows)
- **Total: 41 passing tests**

### Deploy

#### Local Hardhat Network

```bash
npx hardhat run scripts/deploy.ts
```

#### BNB Chain Testnet

```bash
npx hardhat run scripts/deploy.ts --network bscTestnet
```

#### BNB Chain Mainnet

```bash
npx hardhat run scripts/deploy.ts --network bscMainnet
```

Deployment outputs:
- Contract addresses to console
- Deployment info to `deployment-{network}.json`

### Verify on BscScan

After deployment to BNB Chain:

```bash
npx hardhat run scripts/verify.ts --network bscTestnet
```

Or manually:

```bash
npx hardhat verify --network bscTestnet <RENTAL_ADDRESS> <TOKEN_ADDRESS>
```

## Contract Addresses

### BNB Chain Testnet (chainId: 97)

| Contract        | Address | Verified |
|-----------------|---------|----------|
| WorldlandRental | TBD     | -        |
| Payment Token   | TBD     | -        |

### BNB Chain Mainnet (chainId: 56)

| Contract        | Address | Verified |
|-----------------|---------|----------|
| WorldlandRental | TBD     | -        |
| Payment Token   | TBD     | -        |

*Addresses will be updated after deployment*

## Integration with Hub

The Hub (Go backend) integrates via the `IWorldlandRental` interface:

```solidity
// contracts/interfaces/IWorldlandRental.sol
interface IWorldlandRental {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function startRental(address provider, uint256 pricePerSecond) external returns (uint256 rentalId);
    function stopRental(uint256 rentalId) external returns (uint256 cost);

    event RentalStarted(uint256 indexed rentalId, address indexed user, address indexed provider, uint256 startTime);
    event RentalStopped(uint256 indexed rentalId, uint256 endTime, uint256 cost);
}
```

**TypeScript Types:**
- Generated in `typechain-types/`
- Use with ethers.js v6:

```typescript
import { WorldlandRental } from './typechain-types';

const rental = WorldlandRental__factory.connect(address, signer);
await rental.deposit(ethers.parseEther("100"));
```

**ABI Location:**
- `artifacts/contracts/WorldlandRental.sol/WorldlandRental.json`
- For Go integration: extract `abi` field from JSON

## Gas Costs

Average gas consumption (optimized with 200 runs):

| Function     | Gas Cost | Notes                            |
|--------------|----------|----------------------------------|
| deposit      | ~80k     | Includes SafeERC20 transferFrom  |
| withdraw     | ~47k     | Includes SafeERC20 transfer      |
| startRental  | ~159k    | Creates rental struct            |
| stopRental   | ~61k     | Settlement + balance updates     |

**Deployment:**
- WorldlandRental: ~694k gas (~1.2% of BNB Chain block gas limit)
- MockERC20: ~580k gas

## Security

### Protections Implemented

1. **ReentrancyGuard (OpenZeppelin)**
   - Prevents reentrancy attacks on deposit/withdraw
   - Applied to all state-changing functions

2. **SafeERC20 (OpenZeppelin)**
   - Handles non-compliant ERC20 tokens (USDT, etc.)
   - Safe approve, transfer, transferFrom

3. **Checks-Effects-Interactions Pattern**
   - State changes before external calls
   - Prevents reentrancy and state corruption

4. **Deterministic Settlement**
   - `cost = duration × pricePerSecond`
   - No division, no rounding errors
   - Fully deterministic from blockchain data

5. **Dual Authorization**
   - User OR provider can stop rental
   - Prevents stuck rentals
   - Either party can initiate settlement

### Known Limitations

1. **No Emergency Stop**
   - Contracts are immutable once deployed
   - Consider proxy pattern for upgradeability in v2

2. **No Deposit Timeout**
   - Deposits remain indefinitely if rental never starts
   - Consider adding deposit expiration in v2

3. **Single Token**
   - Only one payment token per contract instance
   - Multi-token support requires separate deployments

4. **Block Timestamp Dependency**
   - Relies on block.timestamp (BNB Chain ~3s blocks)
   - Acceptable for minute/hour-scale rentals
   - Not suitable for sub-second precision

## Development

### Project Structure

```
worldland-contracts/
├── contracts/
│   ├── WorldlandRental.sol          # Main rental contract
│   ├── interfaces/
│   │   └── IWorldlandRental.sol     # External interface
│   └── mocks/
│       └── MockERC20.sol             # Test token
├── test/
│   ├── fixtures.ts                   # Test setup
│   ├── WorldlandRental.deposit.test.ts
│   ├── WorldlandRental.rental.test.ts
│   └── WorldlandRental.integration.test.ts
├── scripts/
│   ├── deploy.ts                     # Deployment script
│   └── verify.ts                     # Verification script
└── hardhat.config.ts                 # Hardhat configuration
```

### Configuration

**Solidity Version:** 0.8.28
**Optimizer:** Enabled (200 runs)
**EVM Target:** Paris

**Networks Configured:**
- Hardhat (local)
- BNB Chain Testnet (chainId: 97)
- BNB Chain Mainnet (chainId: 56)

### Environment Variables

Create `.env` file:

```bash
# Required for BNB Chain deployment
PRIVATE_KEY=your_private_key_here

# Required for BscScan verification
BSCSCAN_API_KEY=your_bscscan_api_key_here

# Optional: Use existing token instead of deploying MockERC20
TOKEN_ADDRESS=0x...
```

## Testing Strategy

Tests follow TDD (Test-Driven Development) with RED-GREEN-REFACTOR cycles:

1. **Unit Tests** (deposit, rental)
   - Isolated function testing
   - Edge cases and error conditions
   - Gas cost verification

2. **Integration Tests**
   - End-to-end rental flow
   - Multi-user scenarios
   - Settlement accuracy

3. **Security Tests**
   - Reentrancy protection
   - Authorization checks
   - Invariant verification

## Roadmap

### Phase 1: Smart Contract Foundation ✓
- [x] Deposit/withdraw with ERC20
- [x] Start/stop rental with timestamps
- [x] Deterministic settlement
- [x] Comprehensive tests
- [x] Deployment scripts

### Phase 2: Provider Infrastructure (Next)
- [ ] Provider Node daemon
- [ ] mTLS certificate automation
- [ ] GPU metrics reporting

### Phase 3: Hub Core
- [ ] SIWE authentication
- [ ] Provider matching algorithm
- [ ] Event indexing and state sync

### Phase 4: Rental Execution
- [ ] Proxy server with session management
- [ ] End-to-end rental flow
- [ ] Production deployment

## License

MIT

## Support

- Documentation: [Worldland Docs](https://docs.worldland.foundation)
- Discord: [Worldland Community](https://discord.gg/worldland)
- Issues: [GitHub Issues](https://github.com/worldland-foundation/worldland/issues)

---

**Built with:**
- [Hardhat](https://hardhat.org/) - Ethereum development environment
- [OpenZeppelin](https://www.openzeppelin.com/) - Secure smart contract library
- [BNB Chain](https://www.bnbchain.org/) - High-performance blockchain

**Deterministic. Trustless. Fair.**
