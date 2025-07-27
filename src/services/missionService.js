// src/services/missionService.js

import ActiveMission from '../data/models/ActiveMission.js';
import missionsConfig from '../config/missions.js';
import Player from '../data/models/Player.js';
import { addExperience } from './experienceService.js';
import { getNFTCount, getBoosts } from './nftService.js';
import metrics from '../config/metrics.js';
import Inventory from '../data/models/Inventory.js';
import { calculateTotalStats } from './itemService.js';

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

export async function getActiveMissionsCount(discordId) {
  const now = new Date();
  return ActiveMission.countDocuments({
    discordId,
    endAt: { $gt: now },
    claimed: false
  });
}

export async function getClaimableMissionsCount(discordId) {
  const now = new Date();
  return ActiveMission.countDocuments({
    discordId,
    endAt: { $lte: now },
    claimed: false
  });
}

function computeReducedHpCost(rawCost, agility) {
  const reduced = Math.floor(rawCost * (1 - agility * 0.01));
  return reduced > 0 ? reduced : 1;
}

export async function startMission({ discordId, missionType }) {
  const missionDef = missionsConfig[missionType];
  if (!missionDef) throw new Error('Invalid mission type.');

  const player = await Player.findOne({ discordId });
  if (!player) throw new Error('Player not found.');

  const inv = await Inventory.findOne({ discordId });
  const totalStats = await calculateTotalStats(player); // <--- version async, inventory handled inside

  if (player.level < missionDef.minLevel) {
    throw new Error(`You need level ${missionDef.minLevel} to start this mission.`);
  }

  const nftCount = await getNFTCount(discordId);
  const maxConcurrent = await getMaxConcurrentMissions(nftCount);
  if (maxConcurrent < 1) {
    throw new Error('Your NFT count bracket does not permit any concurrent missions.');
  }

  const { xpBoost, coinsBoost } = getBoosts(nftCount);

  const activeCount = await getActiveMissionsCount(discordId);
  if (activeCount >= maxConcurrent) {
    throw new Error(
      `You already have ${activeCount} active mission(s), which is your maximum (${maxConcurrent}).`
    );
  }

  const rawMax = missionDef.hpCostRange[1];
  const worstHpCost = computeReducedHpCost(rawMax, totalStats.agilite || 0);
  if (player.hp < worstHpCost) {
    throw new Error(`Not enough HP. You have ${player.hp} but need ${worstHpCost}.`);
  }

  const randRawHp =
    Math.floor(Math.random() * (missionDef.hpCostRange[1] - missionDef.hpCostRange[0] + 1)) +
    missionDef.hpCostRange[0];
  const finalHpCost = computeReducedHpCost(randRawHp, totalStats.agilite || 0);
  player.hp = Math.max(0, player.hp - finalHpCost);
  await player.save();

  const rawXp =
    Math.floor(Math.random() * (missionDef.xpRange[1] - missionDef.xpRange[0] + 1)) +
    missionDef.xpRange[0];
  const rawCoins =
    Math.floor(Math.random() * (missionDef.coinRange[1] - missionDef.coinRange[0] + 1)) +
    missionDef.coinRange[0];

  const wisdomMult = 1 + (totalStats.sagesse || 0) / 100;
  const xpReward = Math.floor(rawXp * wisdomMult * (1 + xpBoost));

  const luckMult = 1 + (totalStats.chance || 0) / 100;
  const coinReward = Math.floor(rawCoins * luckMult * (1 + coinsBoost));

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
    const { levelsGained, nextLevelXp } = await addExperience(player, m.xpReward);
    player.coins += m.coinReward;

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
