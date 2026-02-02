import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=".repeat(60));
  console.log("Worldland Rental Contract Deployment");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer account:", deployer.address);
  console.log("Network:", network.name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Deploy or use existing token
  let tokenAddress = process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    console.log("\n" + "-".repeat(60));
    console.log("Deploying MockERC20 (Test Token)...");
    console.log("-".repeat(60));

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy(
      "Worldland Test Token",
      "WLT",
      ethers.parseEther("1000000")
    );
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();

    console.log("MockERC20 deployed to:", tokenAddress);
    console.log("Initial supply: 1,000,000 WLT");
  } else {
    console.log("\nUsing existing token:", tokenAddress);
  }

  // Deploy WorldlandRental
  console.log("\n" + "-".repeat(60));
  console.log("Deploying WorldlandRental...");
  console.log("-".repeat(60));

  const WorldlandRental = await ethers.getContractFactory("WorldlandRental");
  const rental = await WorldlandRental.deploy(tokenAddress);
  await rental.waitForDeployment();
  const rentalAddress = await rental.getAddress();

  console.log("WorldlandRental deployed to:", rentalAddress);
  console.log("Payment token:", tokenAddress);

  // Save deployment info
  const deployment = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      worldlandRental: rentalAddress,
      paymentToken: tokenAddress,
    },
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const filename = `deployment-${network.name}.json`;
  const filepath = path.join(process.cwd(), filename);
  fs.writeFileSync(filepath, JSON.stringify(deployment, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete");
  console.log("=".repeat(60));
  console.log("\nDeployment info saved to:", filename);
  console.log("\nContract Addresses:");
  console.log("  WorldlandRental:", rentalAddress);
  console.log("  Payment Token:", tokenAddress);

  // Network-specific instructions
  if (network.name === "bscTestnet" || network.name === "bscMainnet") {
    console.log("\n" + "-".repeat(60));
    console.log("Next Steps: Verify on BscScan");
    console.log("-".repeat(60));
    console.log(`\nVerify WorldlandRental:`);
    console.log(`  npx hardhat verify --network ${network.name} ${rentalAddress} ${tokenAddress}`);

    if (!process.env.TOKEN_ADDRESS) {
      console.log(`\nVerify MockERC20:`);
      console.log(`  npx hardhat verify --network ${network.name} ${tokenAddress} "Worldland Test Token" "WLT" "1000000000000000000000000"`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n" + "=".repeat(60));
    console.error("Deployment Failed");
    console.error("=".repeat(60));
    console.error(error);
    process.exit(1);
  });
