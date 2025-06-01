// src/services/nftService.js
import { ethers } from 'ethers';
import UserLink from '../data/models/UserLink.js';

const RPC_URL           = process.env.MONAD_RPC_URL_1;
const CONTRACT_ADDRESS = process.env.NFT_GENESIS_CONTRACT;

// Minimal ERC-721 ABI including balanceOf. tokenOfOwnerByIndex may not be implemented.
const ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
];

/**
 * Retrieves the list of Genesis NFT token IDs that the Discord user holds.
 * If the contract does not implement ERC-721 Enumerable (tokenOfOwnerByIndex),
 * this will return an empty array, even if balance > 0.
 */
export async function getNFTList(discordId) {
  const link = await UserLink.findOne({ discordId });
  if (!link || !link.wallet) return [];

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  try {
    // balanceOf returns a BigInt in ethers v6
    const balanceBig = await contract.balanceOf(link.wallet);
    const balance = Number(balanceBig);

    const tokenIds = [];
    for (let i = 0; i < balance; i++) {
      try {
        const tokenIdBig = await contract.tokenOfOwnerByIndex(link.wallet, i);
        tokenIds.push(tokenIdBig.toString());
      } catch (innerErr) {
        // Likely BAD_DATA because tokenOfOwnerByIndex is not supported
        console.warn(`⚠️ tokenOfOwnerByIndex not supported or failed at index ${i}. Stopping enumeration.`);
        return [];
      }
    }
    return tokenIds;
  } catch (err) {
    console.error(`❌ Error fetching NFT list for wallet ${link.wallet}:`, err);
    return [];
  }
}

/**
 * Retrieves how many Genesis NFTs the Discord user holds.
 * Internally uses getNFTList to count if enumeration works.
 * If enumeration fails (empty list but balance > 0), we fall back to balanceOf.
 */
export async function getNFTCount(discordId) {
  const link = await UserLink.findOne({ discordId });
  if (!link || !link.wallet) return 0;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  try {
    const balanceBig = await contract.balanceOf(link.wallet);
    return Number(balanceBig);
  } catch (err) {
    console.error(`❌ Error fetching NFT count for wallet ${link.wallet}:`, err);
    return 0;
  }
}

/**
 * Given a count of NFTs, returns XP & Coins multipliers and max concurrent missions.
 */
export function getBoosts(nftCount) {
  if (nftCount >= 5) {
    return { xpBoost: 0.20, coinsBoost: 0.25, maxMissions: 3 };
  }
  if (nftCount === 3 || nftCount === 4) {
    return { xpBoost: 0.10, coinsBoost: 0.15, maxMissions: 3 };
  }
  if (nftCount === 2) {
    return { xpBoost: 0.05, coinsBoost: 0.10, maxMissions: 2 };
  }
  if (nftCount === 1) {
    return { xpBoost: 0.00, coinsBoost: 0.00, maxMissions: 1 };
  }
  return { xpBoost: 0.00, coinsBoost: 0.00, maxMissions: 0 };
}
