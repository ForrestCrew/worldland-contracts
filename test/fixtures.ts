import { ethers } from "hardhat";
import { MockERC20, WorldlandRental } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Deployment fixture for WorldlandRental tests
 * Deploys MockERC20 and WorldlandRental, sets up test accounts with tokens
 */
export async function deployFixture() {
  // Get test signers
  const [owner, user, provider] = await ethers.getSigners();

  // Deploy MockERC20 with 1M initial supply
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const token = (await MockERC20Factory.deploy(
    "Test Token",
    "TEST",
    ethers.parseEther("1000000")
  )) as MockERC20;
  await token.waitForDeployment();

  // Deploy WorldlandRental
  const WorldlandRentalFactory = await ethers.getContractFactory("WorldlandRental");
  const rental = (await WorldlandRentalFactory.deploy(
    await token.getAddress()
  )) as WorldlandRental;
  await rental.waitForDeployment();

  // Transfer 10,000 tokens to user
  await token.transfer(user.address, ethers.parseEther("10000"));

  // Approve rental contract for MaxUint256 from user
  await token.connect(user).approve(await rental.getAddress(), ethers.MaxUint256);

  return { rental, token, owner, user, provider };
}

export interface Fixture {
  rental: WorldlandRental;
  token: MockERC20;
  owner: SignerWithAddress;
  user: SignerWithAddress;
  provider: SignerWithAddress;
}
