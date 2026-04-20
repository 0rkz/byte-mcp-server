import { formatEther, type Address } from "viem";
import { publicClient, DataRegistryAbi, PPBTokenAbi } from "../lib/contracts.js";
import { ADDRESSES } from "../lib/config.js";

/**
 * Fetches PPB token, USDC, and ETH balances for an address on Arbitrum Sepolia.
 * @param address - Ethereum address to check.
 */
export async function getTokenBalances(address: string) {
  const addr = address as Address;

  const [ppb, usdc, eth] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.PPBToken,
      abi: PPBTokenAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
    publicClient.readContract({
      address: ADDRESSES.MockUSDC as Address,
      abi: PPBTokenAbi, // same ERC20 interface
      functionName: "balanceOf",
      args: [addr],
    }),
    publicClient.getBalance({ address: addr }),
  ]);

  return {
    ppb: formatEther(ppb),
    usdc: formatEther(usdc),
    eth: formatEther(eth),
  };
}

/**
 * Checks if an address is subscribed to a specific publisher.
 * @param subscriber - Subscriber Ethereum address.
 * @param publisher - Publisher Ethereum address.
 */
export async function checkSubscription(subscriber: string, publisher: string) {
  const isSubscribed = await publicClient.readContract({
    address: ADDRESSES.DataRegistry,
    abi: DataRegistryAbi,
    functionName: "isSubscribed",
    args: [subscriber as Address, publisher as Address],
  });

  return { subscribed: isSubscribed };
}
