import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=".repeat(60));
  console.log("Worldland Rental Contract Verification");
  console.log("=".repeat(60));

  const network = process.env.HARDHAT_NETWORK || "bscTestnet";
  const filename = `deployment-${network}.json`;
  const filepath = path.join(process.cwd(), filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Deployment file not found: ${filename}\nPlease run deployment first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(filepath, "utf8"));

  console.log("\nNetwork:", deployment.network);
  console.log("Chain ID:", deployment.chainId);
  console.log("WorldlandRental:", deployment.contracts.worldlandRental);
  console.log("Payment Token:", deployment.contracts.paymentToken);

  console.log("\n" + "-".repeat(60));
  console.log("Verifying WorldlandRental...");
  console.log("-".repeat(60));

  try {
    await run("verify:verify", {
      address: deployment.contracts.worldlandRental,
      constructorArguments: [deployment.contracts.paymentToken],
    });
    console.log("✓ WorldlandRental verified successfully");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ WorldlandRental already verified");
    } else {
      console.error("✗ Verification failed:", error.message);
      throw error;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Verification Complete");
  console.log("=".repeat(60));

  console.log("\nView contract on BscScan:");
  const explorerUrl = deployment.chainId === "56"
    ? "https://bscscan.com"
    : "https://testnet.bscscan.com";
  console.log(`${explorerUrl}/address/${deployment.contracts.worldlandRental}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n" + "=".repeat(60));
    console.error("Verification Failed");
    console.error("=".repeat(60));
    console.error(error);
    process.exit(1);
  });
