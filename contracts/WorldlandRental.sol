// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WorldlandRental
 * @notice Main rental contract for GPU marketplace with ERC20 deposit/withdrawal
 * @dev Implements secure deposit/withdrawal with ReentrancyGuard and SafeERC20
 */
contract WorldlandRental is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The ERC20 token used for payments
    IERC20 public immutable paymentToken;

    /// @notice User deposits mapping
    mapping(address => uint256) public deposits;

    /// @notice Rental information struct
    struct Rental {
        address user;
        address provider;
        uint256 startTime;
        uint256 pricePerSecond;
        bool active;
    }

    /// @notice Mapping from rentalId to Rental struct
    mapping(uint256 => Rental) public rentals;

    /// @notice Counter for rental IDs
    uint256 public nextRentalId;

    /// @notice Emitted when a user deposits tokens
    event Deposited(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws tokens
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when a rental starts
    event RentalStarted(
        uint256 indexed rentalId,
        address indexed user,
        address indexed provider,
        uint256 startTime
    );

    /// @notice Emitted when a rental stops
    event RentalStopped(
        uint256 indexed rentalId,
        uint256 endTime,
        uint256 cost
    );

    /**
     * @dev Constructor sets the payment token
     * @param _paymentToken Address of the ERC20 token for payments
     */
    constructor(address _paymentToken) {
        require(_paymentToken != address(0), "Invalid token address");
        paymentToken = IERC20(_paymentToken);
    }

    /**
     * @notice Deposit ERC20 tokens to the contract
     * @dev Uses checks-effects-interactions pattern with ReentrancyGuard
     * @param amount Amount of tokens to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");

        // Effects: update state before external call
        deposits[msg.sender] += amount;

        // Interactions: external call after state change
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        // Event emission after successful state change
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw deposited tokens back to user wallet
     * @dev Uses checks-effects-interactions pattern with ReentrancyGuard
     * @param amount Amount of tokens to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(deposits[msg.sender] >= amount, "Insufficient deposit");

        // Effects: update state before external call
        deposits[msg.sender] -= amount;

        // Interactions: external call after state change
        paymentToken.safeTransfer(msg.sender, amount);

        // Event emission after successful state change
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Start a new rental with a provider
     * @dev Uses block.timestamp for deterministic settlement
     * @param provider Address of the GPU provider
     * @param pricePerSecond Price per second in tokens
     * @return rentalId The ID of the created rental
     */
    function startRental(address provider, uint256 pricePerSecond)
        external
        nonReentrant
        returns (uint256 rentalId)
    {
        require(provider != address(0), "Invalid provider");
        require(pricePerSecond > 0, "Price must be positive");
        require(deposits[msg.sender] > 0, "No deposit");

        // Get rental ID and increment counter
        rentalId = nextRentalId++;

        // Store rental information with block.timestamp
        rentals[rentalId] = Rental({
            user: msg.sender,
            provider: provider,
            startTime: block.timestamp,
            pricePerSecond: pricePerSecond,
            active: true
        });

        // Emit event with all rental details
        emit RentalStarted(rentalId, msg.sender, provider, block.timestamp);
    }

    /**
     * @notice Stop an active rental and settle payment
     * @dev Calculates cost deterministically: duration * pricePerSecond
     * @param rentalId The ID of the rental to stop
     * @return cost The calculated rental cost
     */
    function stopRental(uint256 rentalId)
        external
        nonReentrant
        returns (uint256 cost)
    {
        Rental storage rental = rentals[rentalId];

        // Checks
        require(rental.active, "Rental not active");
        require(
            msg.sender == rental.user || msg.sender == rental.provider,
            "Not authorized"
        );

        // Calculate cost deterministically
        uint256 duration = block.timestamp - rental.startTime;
        cost = duration * rental.pricePerSecond;

        require(deposits[rental.user] >= cost, "Insufficient deposit");

        // Effects: update state before any interactions
        rental.active = false;
        deposits[rental.user] -= cost;
        deposits[rental.provider] += cost;

        // Emit event with settlement details
        emit RentalStopped(rentalId, block.timestamp, cost);
    }

    /**
     * @notice Get rental information by ID
     * @param rentalId The ID of the rental
     * @return rental The rental struct
     */
    function getRental(uint256 rentalId) external view returns (Rental memory) {
        return rentals[rentalId];
    }
}
