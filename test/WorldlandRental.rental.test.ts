import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./fixtures";

describe("WorldlandRental - Rental Operations", function() {
  describe("startRental", function() {
    it("Should start rental and emit RentalStarted event", async function() {
      const { rental, token, user, provider } = await loadFixture(deployFixture);

      // Setup: user deposits tokens
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      // Test: startRental(provider, pricePerSecond)
      const pricePerSecond = ethers.parseEther("0.001"); // 0.001 token/sec

      const tx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      // Expect: RentalStarted(rentalId, user, provider, timestamp)
      await expect(tx)
        .to.emit(rental, "RentalStarted")
        .withArgs(0, user.address, provider.address, block!.timestamp);

      // Expect: rentals(rentalId).active == true
      const rentalData = await rental.rentals(0);
      expect(rentalData.active).to.equal(true);
      expect(rentalData.user).to.equal(user.address);
      expect(rentalData.provider).to.equal(provider.address);
      expect(rentalData.startTime).to.equal(block!.timestamp);
      expect(rentalData.pricePerSecond).to.equal(pricePerSecond);
    });

    it("Should revert if user has no deposit", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      const pricePerSecond = ethers.parseEther("0.001");

      // Expect: revert with "No deposit"
      await expect(
        rental.connect(user).startRental(provider.address, pricePerSecond)
      ).to.be.revertedWith("No deposit");
    });

    it("Should revert with zero pricePerSecond", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Deposit tokens first
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      // Expect: revert with "Price must be positive"
      await expect(
        rental.connect(user).startRental(provider.address, 0)
      ).to.be.revertedWith("Price must be positive");
    });

    it("Should revert with zero provider address", async function() {
      const { rental, user } = await loadFixture(deployFixture);

      // Deposit tokens first
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.001");

      // Expect: revert with "Invalid provider"
      await expect(
        rental.connect(user).startRental(ethers.ZeroAddress, pricePerSecond)
      ).to.be.revertedWith("Invalid provider");
    });

    it("Should increment rentalId for each new rental", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Deposit tokens
      const depositAmount = ethers.parseEther("10000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.001");

      // Start first rental
      const tx1 = await rental.connect(user).startRental(provider.address, pricePerSecond);
      await expect(tx1)
        .to.emit(rental, "RentalStarted")
        .withArgs(0, user.address, provider.address, await getBlockTimestamp(tx1));

      // Start second rental
      const tx2 = await rental.connect(user).startRental(provider.address, pricePerSecond);
      await expect(tx2)
        .to.emit(rental, "RentalStarted")
        .withArgs(1, user.address, provider.address, await getBlockTimestamp(tx2));
    });
  });

  describe("stopRental", function() {
    it("Should stop rental and emit RentalStopped event", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup: deposit, startRental
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.001");
      const tx1 = await rental.connect(user).startRental(provider.address, pricePerSecond);
      await tx1.wait();

      // Advance time by 1 hour
      await time.increase(3600);

      // Test: stopRental(rentalId)
      const tx2 = await rental.connect(user).stopRental(0);
      const receipt = await tx2.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      // Expect: RentalStopped(rentalId, endTime, cost)
      await expect(tx2)
        .to.emit(rental, "RentalStopped");

      // Expect: rentals(rentalId).active == false
      const rentalData = await rental.rentals(0);
      expect(rentalData.active).to.equal(false);
    });

    it("Should calculate cost as duration * pricePerSecond", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup: deposit 1000, startRental with pricePerSecond = 1
      const depositAmount = ethers.parseEther("10000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("1"); // 1 token/sec
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Advance time by 3600 seconds (1 hour)
      await time.increase(3600);

      // Test: stopRental
      const tx = await rental.connect(user).stopRental(0);
      const receipt = await tx.wait();
      const stopBlock = await ethers.provider.getBlock(receipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate actual duration
      const actualDuration = stopTime - startTime;

      // Extract cost from event
      const rentalStoppedEvent = receipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (rentalStoppedEvent) {
        const parsedLog = rental.interface.parseLog(rentalStoppedEvent);
        const cost = parsedLog!.args.cost;
        // Cost should equal duration * pricePerSecond (deterministic)
        expect(cost).to.equal(ethers.parseEther(actualDuration.toString()));
      }
    });

    it("Should deduct cost from user deposit", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup: deposit 1000, start, advance 100 seconds, stop
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("1"); // 1 token/sec
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      const initialDeposit = await rental.deposits(user.address);

      // Advance 100 seconds
      await time.increase(100);

      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate actual duration
      const actualDuration = stopTime - startTime;
      const expectedCost = ethers.parseEther(actualDuration.toString());

      // Expect: deposits(user) == initial - actual cost
      const finalDeposit = await rental.deposits(user.address);
      expect(finalDeposit).to.equal(initialDeposit - expectedCost);
    });

    it("Should add cost to provider balance", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup: deposit, start, advance, stop
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("1"); // 1 token/sec
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      const initialProviderBalance = await rental.deposits(provider.address);

      // Advance 100 seconds
      await time.increase(100);

      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate actual duration
      const actualDuration = stopTime - startTime;
      const expectedCost = ethers.parseEther(actualDuration.toString());

      // Expect: deposits(provider) == calculated cost
      const finalProviderBalance = await rental.deposits(provider.address);
      expect(finalProviderBalance).to.equal(initialProviderBalance + expectedCost);
    });

    it("Should revert if rental not active", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Start and stop rental
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.001");
      await rental.connect(user).startRental(provider.address, pricePerSecond);

      await time.increase(10);
      await rental.connect(user).stopRental(0);

      // Try to stop again
      // Expect: revert with "Rental not active"
      await expect(
        rental.connect(user).stopRental(0)
      ).to.be.revertedWith("Rental not active");
    });

    it("Should revert if insufficient deposit for settlement", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Start rental with low deposit, high price
      const depositAmount = ethers.parseEther("10");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("1"); // 1 token/sec
      await rental.connect(user).startRental(provider.address, pricePerSecond);

      // Advance time until cost > deposit (advance 20 seconds, cost = 20)
      await time.increase(20);

      // Expect: revert with "Insufficient deposit"
      await expect(
        rental.connect(user).stopRental(0)
      ).to.be.revertedWith("Insufficient deposit");
    });

    it("Should allow provider to stop rental", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup rental
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.001");
      await rental.connect(user).startRental(provider.address, pricePerSecond);

      await time.increase(100);

      // Provider calls stopRental
      // Expect: succeeds
      await expect(
        rental.connect(provider).stopRental(0)
      ).to.emit(rental, "RentalStopped");
    });

    it("Should revert if caller is neither user nor provider", async function() {
      const { rental, user, provider, owner } = await loadFixture(deployFixture);

      // Setup rental
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.001");
      await rental.connect(user).startRental(provider.address, pricePerSecond);

      await time.increase(10);

      // Third party calls stopRental
      // Expect: revert with "Not authorized"
      await expect(
        rental.connect(owner).stopRental(0)
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Settlement Determinism", function() {
    it("Should produce identical cost for same duration and rate", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup two rentals with same pricePerSecond and duration
      const depositAmount = ethers.parseEther("10000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.5");

      // Start first rental
      await rental.connect(user).startRental(provider.address, pricePerSecond);
      await time.increase(1000);
      const tx1 = await rental.connect(user).stopRental(0);
      const receipt1 = await tx1.wait();

      // Start second rental with same conditions
      await rental.connect(user).startRental(provider.address, pricePerSecond);
      await time.increase(1000);
      const tx2 = await rental.connect(user).stopRental(1);
      const receipt2 = await tx2.wait();

      // Extract costs from events
      const event1 = receipt1!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );
      const event2 = receipt2!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event1 && event2) {
        const cost1 = rental.interface.parseLog(event1)!.args.cost;
        const cost2 = rental.interface.parseLog(event2)!.args.cost;

        // Verify costs are exactly equal
        expect(cost1).to.equal(cost2);
      }
    });

    it("Should handle large durations without overflow", async function() {
      const { rental, token, user, provider } = await loadFixture(deployFixture);

      // Test with 30 days of rental
      // User has 10,000 tokens from fixture
      // 30 days at 0.1 token/sec = 259,200 tokens
      // We'll use a lower price to fit within available balance
      const depositAmount = ethers.parseEther("10000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("0.0001"); // 0.0001 token/sec = ~259 tokens for 30 days
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Advance 30 days (2592000 seconds)
      const thirtyDays = 30 * 24 * 60 * 60;
      await time.increase(thirtyDays);

      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate actual duration
      const actualDuration = stopTime - startTime;

      // Verify calculation is correct
      const event = stopReceipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event) {
        const cost = rental.interface.parseLog(event)!.args.cost;
        const expectedCost = ethers.parseEther("0.0001") * BigInt(actualDuration);
        expect(cost).to.equal(expectedCost);
      }
    });

    it("Should handle minimum duration (1 second)", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Setup
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond = ethers.parseEther("1"); // 1 token/sec
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Advance only 1 block/second
      await time.increase(1);

      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate actual duration
      const actualDuration = stopTime - startTime;

      // Verify cost == duration * pricePerSecond (deterministic)
      const event = stopReceipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event) {
        const cost = rental.interface.parseLog(event)!.args.cost;
        const expectedCost = ethers.parseEther("1") * BigInt(actualDuration);
        expect(cost).to.equal(expectedCost);
      }
    });
  });

  describe("Time-based Settlement", function() {
    it("Should correctly calculate 1 hour rental", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      const pricePerSecond = ethers.parseEther("0.001"); // 0.001 token/sec
      const depositAmount = ethers.parseEther("5000");
      await rental.connect(user).deposit(depositAmount);

      // Start rental
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Advance 1 hour (3600 seconds)
      await time.increase(3600);

      // Stop rental
      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate expected cost
      const actualDuration = stopTime - startTime;
      const expectedCost = pricePerSecond * BigInt(actualDuration);

      // Verify cost matches
      const event = stopReceipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event) {
        const cost = rental.interface.parseLog(event)!.args.cost;
        expect(cost).to.equal(expectedCost);
      }
    });

    it("Should correctly calculate 24 hour rental", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      const pricePerSecond = ethers.parseEther("0.001"); // 0.001 token/sec
      const depositAmount = ethers.parseEther("10000");
      await rental.connect(user).deposit(depositAmount);

      // Start rental
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Advance 24 hours (86400 seconds)
      await time.increase(86400);

      // Stop rental
      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate expected cost
      const actualDuration = stopTime - startTime;
      const expectedCost = pricePerSecond * BigInt(actualDuration);

      // Verify cost matches
      const event = stopReceipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event) {
        const cost = rental.interface.parseLog(event)!.args.cost;
        expect(cost).to.equal(expectedCost);
      }
    });

    it("Should correctly calculate 7 day rental", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      const pricePerSecond = ethers.parseEther("0.0001"); // 0.0001 token/sec
      const depositAmount = ethers.parseEther("10000");
      await rental.connect(user).deposit(depositAmount);

      // Start rental
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Advance 7 days (604800 seconds)
      const sevenDays = 7 * 24 * 60 * 60;
      await time.increase(sevenDays);

      // Stop rental
      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate expected cost
      const actualDuration = stopTime - startTime;
      const expectedCost = pricePerSecond * BigInt(actualDuration);

      // Verify cost matches (should be ~60.48 tokens)
      const event = stopReceipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event) {
        const cost = rental.interface.parseLog(event)!.args.cost;
        expect(cost).to.equal(expectedCost);
        // Verify it's approximately correct (within 1 token of expected)
        const approximateCost = ethers.parseEther("60.48");
        expect(cost).to.be.closeTo(approximateCost, ethers.parseEther("1"));
      }
    });

    it("Should handle sub-second precision", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      // Even though we use seconds, verify exact calculation
      const pricePerSecond = ethers.parseEther("1");
      const depositAmount = ethers.parseEther("1000");
      await rental.connect(user).deposit(depositAmount);

      // Start rental
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = startBlock!.timestamp;

      // Don't advance time - stop immediately (next block)
      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = stopBlock!.timestamp;

      // Calculate expected cost (should be small, just the block time difference)
      const actualDuration = stopTime - startTime;
      const expectedCost = pricePerSecond * BigInt(actualDuration);

      // Verify cost matches exactly
      const event = stopReceipt!.logs.find(
        (log: any) => rental.interface.parseLog(log)?.name === "RentalStopped"
      );

      if (event) {
        const cost = rental.interface.parseLog(event)!.args.cost;
        expect(cost).to.equal(expectedCost);
      }
    });
  });

  describe("Multiple Rentals", function() {
    it("Should handle concurrent rentals from same user", async function() {
      const { rental, user, provider, owner } = await loadFixture(deployFixture);

      // User starts 2 rentals with different providers
      const depositAmount = ethers.parseEther("5000");
      await rental.connect(user).deposit(depositAmount);

      const pricePerSecond1 = ethers.parseEther("0.001");
      const pricePerSecond2 = ethers.parseEther("0.002");

      // Start first rental
      await rental.connect(user).startRental(provider.address, pricePerSecond1);

      // Start second rental with different provider
      await rental.connect(user).startRental(owner.address, pricePerSecond2);

      // Advance time
      await time.increase(1000);

      const initialDeposit = await rental.deposits(user.address);

      // Stop both rentals
      await rental.connect(user).stopRental(0);
      await rental.connect(user).stopRental(1);

      // Verify user deposit decreased and providers received payments
      const finalDeposit = await rental.deposits(user.address);
      expect(finalDeposit).to.be.lt(initialDeposit);

      const provider1Balance = await rental.deposits(provider.address);
      const provider2Balance = await rental.deposits(owner.address);

      expect(provider1Balance).to.be.gt(0);
      expect(provider2Balance).to.be.gt(0);
    });

    it("Should handle same provider with multiple users", async function() {
      const { rental, token, user, provider, owner } = await loadFixture(deployFixture);

      // Set up second user (owner) with tokens
      await token.connect(owner).approve(await rental.getAddress(), ethers.MaxUint256);
      await rental.connect(owner).deposit(ethers.parseEther("5000"));

      // User also deposits
      await rental.connect(user).deposit(ethers.parseEther("5000"));

      const pricePerSecond = ethers.parseEther("0.001");

      // Both users rent from same provider
      await rental.connect(user).startRental(provider.address, pricePerSecond);
      await rental.connect(owner).startRental(provider.address, pricePerSecond);

      // Advance time
      await time.increase(1000);

      const initialProviderBalance = await rental.deposits(provider.address);

      // Stop both rentals
      await rental.connect(user).stopRental(0);
      await rental.connect(owner).stopRental(1);

      // Verify provider balance accumulated correctly from both rentals
      const finalProviderBalance = await rental.deposits(provider.address);
      expect(finalProviderBalance).to.be.gt(initialProviderBalance);

      // Provider should have received payments from both users
      const totalReceived = finalProviderBalance - initialProviderBalance;
      expect(totalReceived).to.be.gt(ethers.parseEther("0"));
    });
  });
});

// Helper function to get block timestamp from transaction
async function getBlockTimestamp(tx: any) {
  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(receipt!.blockNumber);
  return block!.timestamp;
}
