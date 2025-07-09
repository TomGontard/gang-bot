// src/services/missionService.js
import ActiveMission from '../data/models/ActiveMission.js';
import missionsConfig from '../config/missions.js';
import Player from '../data/models/Player.js';
import { addExperience } from './experienceService.js';
import { getNFTCount } from './nftService.js';
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
 * getReservedHp(discordId)
 * - Sums hpCost of all unclaimed ActiveMissions where endAt > now.
 */
export async function getReservedHp(discordId) {
  const now = new Date();
  const active = await ActiveMission.find({
    discordId,
    endAt: { $gt: now },
    claimed: false
  }).lean();
  return active.reduce((sum, m) => sum + m.hpCost, 0);
}

/**
 * getActiveMissionsCount(discordId)
 * - Returns the number of missions that are currently active (not yet ended, not claimed).
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
 * - Returns how many missions have ended (endAt <= now) but not yet claimed.
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
 * - Validates:
 *    • missionType exists
 *    • player.level >= minLevel
 *    • player holds >= 3 NFTs
 *    • activeMissionsCount < nftCount (max simultaneous)
 *    • reservedHp + worstHpCostAfterAgility <= player.hp
 * - Then randomizes raw Hp cost in range, reduces by agility, randomizes XP & coins,
 *   records ActiveMission.
 */
export async function startMission({ discordId, missionType }) {
  const missionDef = missionsConfig[missionType];
  if (!missionDef) {
    throw new Error('Invalid mission type.');
  }

  // 1) Fetch player
  const player = await Player.findOne({ discordId });
  if (!player) {
    throw new Error('Player not found.');
  }

  // 2) Check level
  if (player.level < missionDef.minLevel) {
    throw new Error(`You need level ${missionDef.minLevel} to start this mission.`);
  }

  // 3) Check NFT count
  const nftCount = await getNFTCount(discordId);
  const maxConcurrent = getMaxConcurrentMissions(nftCount);
  if (maxConcurrent < 1) {
    throw new Error('Your NFT count bracket does not permit any concurrent missions.');
  }

  // 4) Check active missions vs maxConcurrent
  const activeCount = await getActiveMissionsCount(discordId);
  if (activeCount >= maxConcurrent) {
    throw new Error(
      `You already have ${activeCount} active mission(s), which ℹ️ is at your maximum (${maxConcurrent}). ` +
      'Finish or claim at least one mission before starting another.'
    );
  }

  // 5) Compute reserved HP
  const reservedHp = await getReservedHp(discordId);
  const availableHp = player.hp - reservedHp;

  // 6) Compute worst-case HP cost after agility reduction
  const rawMax = missionDef.hpCostRange[1];
  const worstHpCost = computeReducedHpCost(rawMax, player.attributes.agilite);

  if (availableHp < worstHpCost) {
    throw new Error(
      `Not enough HP available. You have ${player.hp} total, ` +
      `${reservedHp} reserved for active missions, leaving ${availableHp}. ` +
      `Worst-case HP cost is ${worstHpCost}.`
    );
  }

  // 7) Randomize raw Hp cost in [min..max], then reduce by agility
  const rawHp =
    Math.floor(
      Math.random() * (missionDef.hpCostRange[1] - missionDef.hpCostRange[0] + 1)
    ) + missionDef.hpCostRange[0];
  const finalHpCost = computeReducedHpCost(rawHp, player.attributes.agilite);

  // 8) Randomize XP and coin rewards
  const xpReward =
    Math.floor(
      Math.random() * (missionDef.xpRange[1] - missionDef.xpRange[0] + 1)
    ) + missionDef.xpRange[0];
  const coinReward =
    Math.floor(
      Math.random() * (missionDef.coinRange[1] - missionDef.coinRange[0] + 1)
    ) + missionDef.coinRange[0];

  // 9) Create ActiveMission (no immediate HP deduction)
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
  if (!player) {
    throw new Error('Player not found.');
  }

  const results = [];
  for (const m of missions) {
    // Subtract HP cost now
    player.hp -= m.hpCost;
    if (player.hp < 0) player.hp = 0;

    // Add XP (handles level‐up)
    const { levelsGained, nextLevelXp } = await addExperience(player, m.xpReward);

    // Add coins
    player.coins += m.coinReward;

    // Mark as claimed
    m.claimed = true;
    await m.save();

    results.push({
      missionType: m.missionType,
      xpReward: m.xpReward,
      coinReward: m.coinReward,
      hpCost: m.hpCost,
      levelsGained,
      nextLevelXp
    });
  }

  await player.save();
  return results;
}
