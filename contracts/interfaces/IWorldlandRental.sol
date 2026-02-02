// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IWorldlandRental
 * @notice External interface for the WorldlandRental contract
 * @dev This interface documents all public functions for Hub integration
 */
interface IWorldlandRental {
    // Events

    /// @notice Emitted when a user deposits tokens
    /// @param user Address of the user depositing
    /// @param amount Amount of tokens deposited
    event Deposited(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws tokens
    /// @param user Address of the user withdrawing
    /// @param amount Amount of tokens withdrawn
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when a rental starts
    /// @param rentalId Unique identifier for the rental
    /// @param user Address of the user renting
    /// @param provider Address of the GPU provider
    /// @param startTime Block timestamp when rental started
    event RentalStarted(
        uint256 indexed rentalId,
        address indexed user,
        address indexed provider,
        uint256 startTime
    );

    /// @notice Emitted when a rental stops
    /// @param rentalId Unique identifier for the rental
    /// @param endTime Block timestamp when rental stopped
    /// @param cost Total cost of the rental in tokens
    event RentalStopped(
        uint256 indexed rentalId,
        uint256 endTime,
        uint256 cost
    );

    // Deposit/Withdraw Functions

    /// @notice Deposit ERC20 tokens to the contract
    /// @dev Requires prior token approval
    /// @param amount Amount of tokens to deposit
    function deposit(uint256 amount) external;

    /// @notice Withdraw deposited tokens back to user wallet
    /// @param amount Amount of tokens to withdraw
    function withdraw(uint256 amount) external;

    /// @notice Get the deposit balance for a user
    /// @param user Address to query
    /// @return balance Current deposit balance
    function deposits(address user) external view returns (uint256 balance);

    // Rental Functions

    /// @notice Start a new rental with a provider
    /// @dev Uses block.timestamp for deterministic settlement
    /// @param provider Address of the GPU provider
    /// @param pricePerSecond Price per second in tokens
    /// @return rentalId The ID of the created rental
    function startRental(address provider, uint256 pricePerSecond)
        external
        returns (uint256 rentalId);

    /// @notice Stop an active rental and settle payment
    /// @dev Calculates cost deterministically: duration * pricePerSecond
    /// @dev Can be called by user or provider (dual authorization)
    /// @param rentalId The ID of the rental to stop
    /// @return cost The calculated rental cost
    function stopRental(uint256 rentalId)
        external
        returns (uint256 cost);

    // View Functions

    /// @notice Get the ERC20 token used for payments
    /// @return tokenAddress Address of the payment token
    function paymentToken() external view returns (address tokenAddress);

    /// @notice Get the next rental ID that will be assigned
    /// @return nextId The next rental ID
    function nextRentalId() external view returns (uint256 nextId);
}
