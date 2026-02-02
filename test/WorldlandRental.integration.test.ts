import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./fixtures";

describe("WorldlandRental Integration", function() {
  describe("Complete Rental Flow", function() {
    it("Should execute full flow: deposit -> start -> stop -> settlement -> withdraw", async function() {
      // Setup
      const { rental, token, user, provider } = await loadFixture(deployFixture);
      const depositAmount = ethers.parseEther("1000");
      const pricePerSecond = ethers.parseEther("0.01");
      const rentalDuration = 3600n; // 1 hour

      // Step 1: User deposits
      await rental.connect(user).deposit(depositAmount);
      expect(await rental.deposits(user.address)).to.equal(depositAmount);

      // Step 2: User starts rental
      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const rentalId = 0n; // First rental

      // Get the actual start time from the block
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = BigInt(startBlock!.timestamp);

      // Verify RentalStarted event
      await expect(startTx)
        .to.emit(rental, "RentalStarted")
        .withArgs(rentalId, user.address, provider.address, startTime);

      // Verify rental is active
      const rentalInfo = await rental.getRental(rentalId);
      expect(rentalInfo.user).to.equal(user.address);
      expect(rentalInfo.provider).to.equal(provider.address);
      expect(rentalInfo.startTime).to.equal(startTime);
      expect(rentalInfo.pricePerSecond).to.equal(pricePerSecond);
      expect(rentalInfo.active).to.be.true;

      // Step 3: Time passes
      await time.increase(rentalDuration);

      // Step 4: Stop rental and settlement
      const stopTx = await rental.connect(user).stopRental(rentalId);
      const stopReceipt = await stopTx.wait();

      // Get actual stop time from block
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = BigInt(stopBlock!.timestamp);

      // Calculate expected cost based on actual duration
      const actualDuration = stopTime - startTime;
      const expectedCost = pricePerSecond * actualDuration;

      await expect(stopTx)
        .to.emit(rental, "RentalStopped")
        .withArgs(rentalId, stopTime, expectedCost);

      // Verify settlement
      const remainingDeposit = depositAmount - expectedCost;
      expect(await rental.deposits(user.address)).to.equal(remainingDeposit);
      expect(await rental.deposits(provider.address)).to.equal(expectedCost);

      // Verify rental is no longer active
      const rentalAfterStop = await rental.getRental(rentalId);
      expect(rentalAfterStop.active).to.be.false;

      // Step 5: User withdraws remaining
      await rental.connect(user).withdraw(remainingDeposit);
      expect(await rental.deposits(user.address)).to.equal(0);
      expect(await token.balanceOf(user.address)).to.equal(
        ethers.parseEther("10000") - expectedCost // Original minus only the rental cost
      );

      // Step 6: Provider withdraws earnings
      await rental.connect(provider).withdraw(expectedCost);
      expect(await rental.deposits(provider.address)).to.equal(0);
      expect(await token.balanceOf(provider.address)).to.equal(expectedCost);
    });
  });

  describe("Multi-User Scenarios", function() {
    it("Should handle multiple concurrent rentals", async function() {
      const { rental, token, user, provider, owner } = await loadFixture(deployFixture);

      // Setup: Give owner tokens and approve
      await token.transfer(owner.address, ethers.parseEther("10000"));
      await token.connect(owner).approve(await rental.getAddress(), ethers.MaxUint256);

      // Create a second provider
      const [, , , provider2] = await ethers.getSigners();

      // User1 and User2 deposit
      await rental.connect(user).deposit(ethers.parseEther("1000"));
      await rental.connect(owner).deposit(ethers.parseEther("1000"));

      // User1 rents from Provider1
      const tx1 = await rental.connect(user).startRental(provider.address, ethers.parseEther("0.01"));
      const receipt1 = await tx1.wait();
      const block1 = await ethers.provider.getBlock(receipt1!.blockNumber);
      const start1 = BigInt(block1!.timestamp);

      // User2 rents from Provider2
      const tx2 = await rental.connect(owner).startRental(provider2.address, ethers.parseEther("0.02"));
      const receipt2 = await tx2.wait();
      const block2 = await ethers.provider.getBlock(receipt2!.blockNumber);
      const start2 = BigInt(block2!.timestamp);

      // Time passes
      await time.increase(1800n); // 30 minutes

      // Stop both rentals
      const stop1Tx = await rental.connect(user).stopRental(0);
      const stop1Receipt = await stop1Tx.wait();
      const stop1Block = await ethers.provider.getBlock(stop1Receipt!.blockNumber);
      const stop1Time = BigInt(stop1Block!.timestamp);
      const cost1 = ethers.parseEther("0.01") * (stop1Time - start1);

      const stop2Tx = await rental.connect(owner).stopRental(1);
      const stop2Receipt = await stop2Tx.wait();
      const stop2Block = await ethers.provider.getBlock(stop2Receipt!.blockNumber);
      const stop2Time = BigInt(stop2Block!.timestamp);
      const cost2 = ethers.parseEther("0.02") * (stop2Time - start2);

      // Verify settlements are independent
      expect(await rental.deposits(user.address)).to.equal(ethers.parseEther("1000") - cost1);
      expect(await rental.deposits(owner.address)).to.equal(ethers.parseEther("1000") - cost2);
      expect(await rental.deposits(provider.address)).to.equal(cost1);
      expect(await rental.deposits(provider2.address)).to.equal(cost2);
    });

    it("Should correctly accumulate provider earnings from multiple users", async function() {
      const { rental, token, user, owner } = await loadFixture(deployFixture);

      // Setup: Give owner tokens and approve
      await token.transfer(owner.address, ethers.parseEther("10000"));
      await token.connect(owner).approve(await rental.getAddress(), ethers.MaxUint256);

      // Single provider
      const [, , provider] = await ethers.getSigners();

      // Both users deposit
      await rental.connect(user).deposit(ethers.parseEther("1000"));
      await rental.connect(owner).deposit(ethers.parseEther("1000"));

      // Both users rent from same provider
      const tx1 = await rental.connect(user).startRental(provider.address, ethers.parseEther("0.01"));
      const receipt1 = await tx1.wait();
      const block1 = await ethers.provider.getBlock(receipt1!.blockNumber);
      const start1 = BigInt(block1!.timestamp);

      const tx2 = await rental.connect(owner).startRental(provider.address, ethers.parseEther("0.015"));
      const receipt2 = await tx2.wait();
      const block2 = await ethers.provider.getBlock(receipt2!.blockNumber);
      const start2 = BigInt(block2!.timestamp);

      // Time passes
      await time.increase(3600n); // 1 hour

      // Stop both rentals
      const stop1Tx = await rental.connect(user).stopRental(0);
      const stop1Receipt = await stop1Tx.wait();
      const stop1Block = await ethers.provider.getBlock(stop1Receipt!.blockNumber);
      const stop1Time = BigInt(stop1Block!.timestamp);
      const cost1 = ethers.parseEther("0.01") * (stop1Time - start1);

      const stop2Tx = await rental.connect(owner).stopRental(1);
      const stop2Receipt = await stop2Tx.wait();
      const stop2Block = await ethers.provider.getBlock(stop2Receipt!.blockNumber);
      const stop2Time = BigInt(stop2Block!.timestamp);
      const cost2 = ethers.parseEther("0.015") * (stop2Time - start2);

      // Provider earnings = sum of both settlements
      const expectedEarnings = cost1 + cost2;
      expect(await rental.deposits(provider.address)).to.equal(expectedEarnings);

      // Provider can withdraw all earnings
      await rental.connect(provider).withdraw(expectedEarnings);
      expect(await token.balanceOf(provider.address)).to.equal(expectedEarnings);
    });
  });

  describe("Edge Cases", function() {
    it("Should handle very short rental (1 second)", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      await rental.connect(user).deposit(ethers.parseEther("100"));

      const startTx = await rental.connect(user).startRental(provider.address, ethers.parseEther("1"));
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = BigInt(startBlock!.timestamp);

      // Advance exactly 1 second
      await time.increase(1n);

      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = BigInt(stopBlock!.timestamp);

      const duration = stopTime - startTime;
      const cost = ethers.parseEther("1") * duration;

      // Should have minimal but non-zero cost
      expect(cost).to.be.gt(0);
      expect(await rental.deposits(provider.address)).to.equal(cost);
    });

    it("Should handle rental that consumes most of deposit", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      const deposit = ethers.parseEther("100");
      await rental.connect(user).deposit(deposit);

      // Price configured so that 50 seconds uses most of deposit
      const pricePerSecond = ethers.parseEther("1.5"); // 1.5 token/sec

      const startTx = await rental.connect(user).startRental(provider.address, pricePerSecond);
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = BigInt(startBlock!.timestamp);

      // Advance 50 seconds - should cost ~75 tokens
      await time.increase(50n);

      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = BigInt(stopBlock!.timestamp);

      const duration = stopTime - startTime;
      const cost = pricePerSecond * duration;

      // Cost should be most but not all of deposit
      expect(cost).to.be.gt(deposit / 2n);
      expect(cost).to.be.lte(deposit);

      // User should have small remaining balance
      expect(await rental.deposits(user.address)).to.equal(deposit - cost);

      // Provider got the cost
      expect(await rental.deposits(provider.address)).to.equal(cost);
    });

    it("Should prevent overspending deposit mid-rental", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      const smallDeposit = ethers.parseEther("10");
      await rental.connect(user).deposit(smallDeposit);

      // High price that would exceed deposit if run too long
      const highPrice = ethers.parseEther("1"); // 1 token/sec

      const startTx = await rental.connect(user).startRental(provider.address, highPrice);
      await startTx.wait();

      // Try to run for longer than deposit allows (100 seconds would cost 100 tokens but we only have 10)
      await time.increase(100n);

      // Stop should revert if cost > deposit
      await expect(
        rental.connect(user).stopRental(0)
      ).to.be.revertedWith("Insufficient deposit");
    });

    it("Should handle rental stopped immediately in same block", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      await rental.connect(user).deposit(ethers.parseEther("100"));

      const startTx = await rental.connect(user).startRental(provider.address, ethers.parseEther("0.01"));
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = BigInt(startBlock!.timestamp);

      // Stop immediately (minimal time advancement)
      const stopTx = await rental.connect(user).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = BigInt(stopBlock!.timestamp);

      const duration = stopTime - startTime;
      const cost = ethers.parseEther("0.01") * duration;

      // Cost might be 0 or very small depending on block timing
      expect(cost).to.be.gte(0);
      expect(await rental.deposits(provider.address)).to.equal(cost);
    });

    it("Should allow provider to stop rental on behalf of user", async function() {
      const { rental, user, provider } = await loadFixture(deployFixture);

      await rental.connect(user).deposit(ethers.parseEther("1000"));

      const startTx = await rental.connect(user).startRental(provider.address, ethers.parseEther("0.01"));
      const startReceipt = await startTx.wait();
      const startBlock = await ethers.provider.getBlock(startReceipt!.blockNumber);
      const startTime = BigInt(startBlock!.timestamp);

      await time.increase(3600n);

      // Provider stops the rental (dual authorization)
      const stopTx = await rental.connect(provider).stopRental(0);
      const stopReceipt = await stopTx.wait();
      const stopBlock = await ethers.provider.getBlock(stopReceipt!.blockNumber);
      const stopTime = BigInt(stopBlock!.timestamp);

      const cost = ethers.parseEther("0.01") * (stopTime - startTime);

      // Settlement should work the same
      expect(await rental.deposits(provider.address)).to.equal(cost);

      const rentalInfo = await rental.getRental(0);
      expect(rentalInfo.active).to.be.false;
    });
  });
});
