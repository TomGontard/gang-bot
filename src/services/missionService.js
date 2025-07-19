// src/services/missionService.js
import ActiveMission from '../data/models/ActiveMission.js';
import missionsConfig from '../config/missions.js';
import Player from '../data/models/Player.js';
import { addExperience } from './experienceService.js';
import { getNFTCount, getBoosts } from './nftService.js';
import metrics from '../config/metrics.js';

/**
 * Given an NFT count, return maxConcurrentMissions from metrics.nftBoosts
 */
export async function getMaxConcurrentMissions(nftCount) {
  const boostEntries = Object.entries(metrics.nftBoosts)
    .map(([k, v]) => [parseInt(k), v.maxConcurrentMissions])
    .sort((a, b) => a[0] - b[0]);

  let maxMissions = 0;
  for (const [keyCount, maxConc] of boostEntries) {
    if (nftCount >= keyCount) {
      maxMissions = maxConc;
    } else {
      break;
    }
  }
  return maxMissions;
}

/**
 * getActiveMissionsCount(discordId)
 */
export async function getActiveMissionsCount(discordId) {
  const now = new Date();
  return ActiveMission.countDocuments({
    discordId,
    endAt: { $gt: now },
    claimed: false
  });
}

/**
 * getClaimableMissionsCount(discordId)
 */
export async function getClaimableMissionsCount(discordId) {
  const now = new Date();
  return ActiveMission.countDocuments({
    discordId,
    endAt: { $lte: now },
    claimed: false
  });
}

/**
 * computeReducedHpCost(rawCost, agility)
 */
function computeReducedHpCost(rawCost, agility) {
  const reduced = Math.floor(rawCost * (1 - agility * 0.01));
  return reduced > 0 ? reduced : 1;
}

/**
 * startMission({ discordId, missionType })
 * - Validates prerequisites
 * - Deducts HP
 * - Computes XP & coins including Wisdom, Luck, and NFT boosts
 * - Records ActiveMission
 */
export async function startMission({ discordId, missionType }) {
  const missionDef = missionsConfig[missionType];
  if (!missionDef) throw new Error('Invalid mission type.');

  // 1) Fetch player
  const player = await Player.findOne({ discordId });
  if (!player) throw new Error('Player not found.');

  // 2) Check level
  if (player.level < missionDef.minLevel) {
    throw new Error(`You need level ${missionDef.minLevel} to start this mission.`);
  }

  // 3) NFT & boosts
  const nftCount = await getNFTCount(discordId);
  const maxConcurrent = await getMaxConcurrentMissions(nftCount);
  if (maxConcurrent < 1) {
    throw new Error('Your NFT count bracket does not permit any concurrent missions.');
  }
  const { xpBoost, coinsBoost } = getBoosts(nftCount);

  // 4) Active‐missions vs maxConcurrent
  const activeCount = await getActiveMissionsCount(discordId);
  if (activeCount >= maxConcurrent) {
    throw new Error(
      `You already have ${activeCount} active mission(s), which is your maximum (${maxConcurrent}).`
    );
  }

  // 5) HP cost check
  const rawMax = missionDef.hpCostRange[1];
  const worstHpCost = computeReducedHpCost(rawMax, player.attributes.agilite);
  if (player.hp < worstHpCost) {
    throw new Error(`Not enough HP. You have ${player.hp} but need ${worstHpCost}.`);
  }

  // 6) Deduct HP using a random cost reduced by Agility
  const randRawHp =
    Math.floor(Math.random() * (missionDef.hpCostRange[1] - missionDef.hpCostRange[0] + 1)) +
    missionDef.hpCostRange[0];
  const finalHpCost = computeReducedHpCost(randRawHp, player.attributes.agilite);
  player.hp = Math.max(0, player.hp - finalHpCost);
  await player.save();

  // 7) Compute raw rewards
  const rawXp =
    Math.floor(Math.random() * (missionDef.xpRange[1] - missionDef.xpRange[0] + 1)) +
    missionDef.xpRange[0];
  const rawCoins =
    Math.floor(Math.random() * (missionDef.coinRange[1] - missionDef.coinRange[0] + 1)) +
    missionDef.coinRange[0];

  // 8) Apply Wisdom (+1% XP per point) and NFT xpBoost
  const wisdomMult = 1 + player.attributes.sagesse / 100;
  const xpReward = Math.floor(rawXp * wisdomMult * (1 + xpBoost));

  // 9) Apply Luck (+1% coins per point) and NFT coinsBoost
  const luckMult = 1 + player.attributes.chance / 100;
  const coinReward = Math.floor(rawCoins * luckMult * (1 + coinsBoost));

  // 10) Persist ActiveMission
  const now = new Date();
  const endAt = new Date(now.getTime() + missionDef.durationMs);
  const am = await ActiveMission.create({
    discordId,
    missionType,
    startAt: now,
    endAt,
    xpReward,
    coinReward,
    hpCost: finalHpCost,
    claimed: false
  });

  return am;
}

/**
 * claimMissionRewards(discordId)
 * - Grants XP & coins (no multipliers here since they were baked in)
 * - Marks missions as claimed
 */
export async function claimMissionRewards(discordId) {
  const now = new Date();
  const missions = await ActiveMission.find({
    discordId,
    endAt: { $lte: now },
    claimed: false
  });

  if (missions.length === 0) {
    throw new Error('No completed missions to claim.');
  }

  const player = await Player.findOne({ discordId });
  if (!player) throw new Error('Player not found.');

  const results = [];
  for (const m of missions) {
    // Apply XP & handle level‐up
    const { levelsGained, nextLevelXp } = await addExperience(player, m.xpReward);

    // Add coins
    player.coins += m.coinReward;

    // Mark claimed
    m.claimed = true;
    await m.save();

    results.push({
      missionType:  m.missionType,
      xpReward:     m.xpReward,
      coinReward:   m.coinReward,
      hpCost:       m.hpCost,
      levelsGained,
      nextLevelXp
    });
  }

  await player.save();
  return results;
}
