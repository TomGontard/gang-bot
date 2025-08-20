// src/services/experienceService.js
import metrics from '../config/metrics.js';
import Player from '../data/models/Player.js';

/**
 * getXpForLevel(level)
 * - Returns the total XP required to reach `level`.
 * - If metrics.levelThresholds[level] is undefined, return Infinity (no further levels).
 */
export function getXpForLevel(level) {
  const thresholds = metrics.levelThresholds;
  if (thresholds[level] === undefined) {
    return Infinity;
  }
  return thresholds[level];
}

/**
 * addExperience(player, xpAmount)
 * - Adds xpAmount to player.xp, then checks for level-ups in a loop.
 * - For each level gained:
 *   • increments player.level
 *   • adds 10 unassigned attribute points
 *   • adds metrics.hpPerLevel to player.hpMax
 * - Saves the player document at the end.
 * - Returns an object { levelsGained, nextLevelXp }.
 */
export async function addExperience(player, xpAmount) {
  player.xp += xpAmount;
  let levelsGained = 0;

  // Loop while player.xp >= XP required for next level
  while (true) {
    const nextLevel = player.level + 1;
    const required = getXpForLevel(nextLevel);
    if (player.xp >= required) {
      // Level up
      player.level += 1;
      player.unassignedPoints += 10;
      levelsGained += 1;
    } else {
      break;
    }
  }

  // Calculate XP needed for the next level (could be Infinity)
  const nextLevel = player.level + 1;
  const nextLevelXp = getXpForLevel(nextLevel);

  await player.save();
  return { levelsGained, nextLevelXp };
}
