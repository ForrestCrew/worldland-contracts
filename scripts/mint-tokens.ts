import { ethers } from "hardhat";

async function main() {
  const tokenAddress = "0xB89A431232Dc67c866945996fa75C61026C4427F";
  const recipientAddress = process.env.RECIPIENT || "";
  const amount = process.env.AMOUNT || "10000"; // Default 10,000 tokens

  if (!recipientAddress) {
    console.error("Usage: RECIPIENT=0x... AMOUNT=1000 npx hardhat run scripts/mint-tokens.ts --network sepolia");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Minting Test Tokens");
  console.log("=".repeat(60));
  console.log("\nToken:", tokenAddress);
  console.log("Recipient:", recipientAddress);
  console.log("Amount:", amount, "WLT");

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // Get contract instance
  const token = await ethers.getContractAt("MockERC20", tokenAddress);

  // Mint tokens
  const amountWei = ethers.parseEther(amount);
  console.log("\nMinting", amount, "tokens to", recipientAddress);

  const tx = await token.mint(recipientAddress, amountWei);
  console.log("Transaction hash:", tx.hash);

  await tx.wait();
  console.log("✅ Tokens minted successfully!");

  // Check balance
  const balance = await token.balanceOf(recipientAddress);
  console.log("\nNew balance:", ethers.formatEther(balance), "WLT");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
